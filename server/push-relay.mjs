// Dev push relay: a stand-in for the push service the backend does not have yet
// (README: "Intentionally absent: ... notifications").
//
// It implements the contract the app expects from the backend:
//   GET    /api/v1/push/config          -> { vapidPublicKey }
//   POST   /api/v1/push/subscriptions   -> store { subscription, prefs } for the signed-in user
//   DELETE /api/v1/push/subscriptions   -> forget { endpoint }
//   POST   /api/v1/push/test            -> send a sample alert after { delaySeconds }
// and, for every subscribed user, follows the backend's SSE round stream and sends real
// Web Push messages (VAPID, RFC 8030/8291) for the same alerts the app shows in-app.
// Because it pushes through FCM / Mozilla / Apple push services, alerts reach the lock screen
// even when the PWA is closed. Moving this logic into the backend keeps the client unchanged.
import fs from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'
import { ALERT_PREF, diffLive, isLive, isOpen, isSettled, lockReminder } from '../src/lib/liveDiff.js'

const DEFAULT_PREFS = { tactical: true, lock: true, recaps: true, quietHours: false, tzOffset: 0 }
const MAX_POINT_ALERTS_PER_ROUND = 3

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}
async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}
function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(body === undefined ? '' : JSON.stringify(body))
}

export function createPushRelay({ apiBase, dataDir = '.dev-data', subject = process.env.VAPID_SUBJECT || 'mailto:push@sportystreet.app', log = console.log }) {
  fs.mkdirSync(dataDir, { recursive: true })
  const keysFile = path.join(dataDir, 'vapid-keys.json')
  const subsFile = path.join(dataDir, 'push-subscriptions.json')
  let keys = readJson(keysFile)
  if (!keys?.publicKey) {
    keys = webpush.generateVAPIDKeys()
    writeJson(keysFile, keys)
    log('[push] generated VAPID keys in .dev-data/vapid-keys.json')
  }
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey)

  /** endpoint -> { subscription, username, prefs, createdAt } */
  const subs = new Map(Object.entries(readJson(subsFile) ?? {}))
  const persist = () => writeJson(subsFile, Object.fromEntries(subs))
  const watchers = new Map()

  const api = async (pathname, username, init = {}) => {
    const res = await fetch(`${apiBase}/api/v1${pathname}`, {
      ...init,
      headers: { 'X-Dev-User': username, Accept: 'application/json', ...(init.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`${pathname} → ${res.status}`)
    return res.json()
  }

  function quiet(prefs) {
    if (!prefs.quietHours) return false
    const local = new Date(Date.now() - (prefs.tzOffset ?? 0) * 60_000)
    const h = local.getUTCHours()
    return h >= 23 || h < 8
  }

  async function pushTo(username, alert) {
    const targets = [...subs.values()].filter((s) => s.username === username)
    for (const s of targets) {
      const prefs = { ...DEFAULT_PREFS, ...s.prefs }
      const prefKey = ALERT_PREF[alert.type]
      if (prefKey && prefs[prefKey] === false) continue
      if (quiet(prefs) && alert.type !== 'test') continue
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(alert), { TTL: 900, urgency: 'high' })
        log(`[push] → ${username}: ${alert.title}`)
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          subs.delete(s.subscription.endpoint)
          persist()
          log(`[push] dropped expired subscription of ${username}`)
        } else {
          log(`[push] send failed (${e.statusCode ?? e.message}) for ${username}`)
        }
      }
    }
  }

  /** Follows every open/live round of one user and turns snapshots into pushes. */
  function createWatcher(username) {
    const streams = new Map() // roundId -> AbortController
    const state = new Map() // roundId -> { round, team, timeline }
    const pointAlerts = new Map()
    const sentIds = new Set() // alert ids are stable (e.g. one sub moment per round)
    const reminded = new Set()
    let stopped = false

    async function scan() {
      if (stopped) return
      try {
        const page = await api('/rounds?size=50', username)
        for (const round of page.items ?? []) {
          if ((isOpen(round.status) || isLive(round.status)) && !streams.has(round.id)) openStream(round.id)
          if (isOpen(round.status) && !reminded.has(round.id)) {
            const team = state.get(round.id)?.team
            const alert = lockReminder(round, team)
            if (alert) {
              reminded.add(round.id)
              await pushTo(username, alert)
            }
          }
        }
      } catch (e) {
        log(`[push] scan for ${username} failed: ${e.message}`)
      }
    }

    async function openStream(roundId) {
      const ctrl = new AbortController()
      streams.set(roundId, ctrl)
      try {
        const res = await fetch(`${apiBase}/api/v1/rounds/${roundId}/stream`, {
          headers: { 'X-Dev-User': username, Accept: 'text/event-stream' },
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
        const decoder = new TextDecoder()
        let buffer = ''
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true })
          let idx
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
            if (data) await onSnapshot(roundId, JSON.parse(data))
            if (stopped || ctrl.signal.aborted) return
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) log(`[push] stream ${roundId} for ${username}: ${e.message}`)
      } finally {
        streams.delete(roundId)
      }
    }

    async function onSnapshot(roundId, envelope) {
      const { round, myTeam: team, result } = envelope.payload ?? {}
      const prev = state.get(roundId)
      let timeline = prev?.timeline ?? null
      const changed = !prev || prev.team?.score !== team?.score || prev.team?.stateVersion !== team?.stateVersion
      if (team && changed) {
        try { timeline = (await api(`/teams/${team.id}/score-breakdown`, username)).timeline ?? [] } catch { /* keep old */ }
      }
      const next = { round, team, timeline, result }
      state.set(roundId, next)
      for (const alert of diffLive(prev ?? null, next)) {
        if (sentIds.has(alert.id)) continue
        sentIds.add(alert.id)
        if (alert.type === 'points') {
          const n = pointAlerts.get(roundId) ?? 0
          if (n >= MAX_POINT_ALERTS_PER_ROUND) continue
          pointAlerts.set(roundId, n + 1)
        }
        await pushTo(username, alert)
      }
      if (isSettled(round?.status)) streams.get(roundId)?.abort()
    }

    const timer = setInterval(scan, 10_000)
    scan()
    return {
      stop() {
        stopped = true
        clearInterval(timer)
        for (const c of streams.values()) c.abort()
      },
    }
  }

  function ensureWatcher(username) {
    if (!watchers.has(username)) watchers.set(username, createWatcher(username))
  }
  for (const s of subs.values()) ensureWatcher(s.username)

  async function resolveUser(req) {
    const headers = {}
    if (req.headers.cookie) headers.cookie = req.headers.cookie
    if (req.headers['x-dev-user']) headers['X-Dev-User'] = req.headers['x-dev-user']
    const res = await fetch(`${apiBase}/api/v1/me`, { headers })
    if (!res.ok) return null
    return res.json()
  }

  async function middleware(req, res, next) {
    const url = new URL(req.url, 'http://relay.local')
    if (!url.pathname.startsWith('/api/v1/push/')) return next()
    try {
      if (url.pathname === '/api/v1/push/config' && req.method === 'GET') {
        return send(res, 200, { vapidPublicKey: keys.publicKey, provider: 'dev-relay' })
      }
      const user = await resolveUser(req)
      if (!user) return send(res, 401, { code: 'UNAUTHENTICATED', message: 'Sign in first' })
      const body = req.method === 'GET' ? {} : await readBody(req)

      if (url.pathname === '/api/v1/push/subscriptions' && req.method === 'POST') {
        const subscription = body.subscription
        if (!subscription?.endpoint || !subscription?.keys?.p256dh) return send(res, 400, { code: 'BAD_SUBSCRIPTION', message: 'Missing subscription' })
        subs.set(subscription.endpoint, { subscription, username: user.username, prefs: { ...DEFAULT_PREFS, ...body.prefs }, createdAt: new Date().toISOString() })
        persist()
        ensureWatcher(user.username)
        log(`[push] subscribed ${user.username} (${new URL(subscription.endpoint).host})`)
        return send(res, 201, { ok: true, username: user.username })
      }
      if (url.pathname === '/api/v1/push/subscriptions' && req.method === 'DELETE') {
        subs.delete(body.endpoint)
        persist()
        return send(res, 204)
      }
      if (url.pathname === '/api/v1/push/test' && req.method === 'POST') {
        const delay = Math.min(60, Math.max(0, Number(body.delaySeconds ?? 5)))
        const alert = {
          type: 'test',
          id: `test:${Date.now()}`,
          title: body.title || 'Sub moment ⚡',
          body: body.body || 'This is how SportyStreet alerts look on your lock screen.',
          tag: 'test',
          url: body.url || '/notifications',
          createdAt: new Date().toISOString(),
        }
        setTimeout(() => pushTo(user.username, alert), delay * 1000)
        const count = [...subs.values()].filter((s) => s.username === user.username).length
        return send(res, 202, { scheduled: count, delaySeconds: delay })
      }
      return send(res, 404, { code: 'NOT_FOUND', message: 'Unknown push endpoint' })
    } catch (e) {
      log(`[push] ${req.method} ${url.pathname} failed: ${e.message}`)
      return send(res, 500, { code: 'PUSH_RELAY_ERROR', message: e.message })
    }
  }

  return {
    middleware,
    close() {
      for (const w of watchers.values()) w.stop()
      watchers.clear()
    },
  }
}
