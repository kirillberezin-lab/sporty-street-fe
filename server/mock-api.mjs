// Local mock of the Sporty Street backend (Java/Spring, profile `local`).
// It follows the backend source, not only its OpenAPI: same seed and ids, statuses
// (DRAFT → OPEN → LIVE → SETTLED, auto-start at the deadline), error codes, score components
// (BASE / LATE_GOAL_BONUS / CAPTAIN_BONUS / HOME_HERO_BONUS), event revisions, the scripted
// simulator, settlement, RP ledger, gifts and idempotency — so the app behaves the same on both.
//
// Standalone: `npm run mock` (port 8090). With Vite: `npm run dev:mock`.
// Player photos: set MOCK_MEDIA_DIR to the backend's src/main/resources/static/media.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { GIFTS, PLAYERS, RULES, USERS, seedRounds } from './mock-data.mjs'

const iso = (t) => (t == null ? null : new Date(t).toISOString())
const sum = (lines) => lines.reduce((s, l) => s + l.points, 0)
const byName = (a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' }

class ApiError extends Error {
  constructor(status, code, message, fieldErrors = []) {
    super(message)
    Object.assign(this, { status, code, fieldErrors })
  }
}
const rule = (code, message) => new ApiError(422, code, message)
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Resource not found')

export function createMockApi({ minuteMs = 2000, subDelaySeconds = 60, mediaDir = null, log = () => {} } = {}) {
  let db

  const playerById = (id) => PLAYERS.find((p) => p.id === id)
  const userById = (id) => USERS.find((u) => u.id === id)
  const roundById = (id) => db.rounds.find((r) => r.id === id)
  const bump = (round) => ++round.stateVersion
  const fixtureOf = (round, player) =>
    round.fixtures.find((f) => f.homeClubId === player.clubId || f.awayClubId === player.clubId)

  function reset() {
    simReset()
    db = {
      rounds: seedRounds(Date.now(), subDelaySeconds),
      teams: [], // { id, roundId, userId, captainPlayerId, homeCountryId, subsUsed, version, selections, subs }
      events: [], // match_event rows
      results: [], // round_result rows
      wallets: Object.fromEntries(USERS.map((u) => [u.id, 0])),
      ledger: [],
      purchases: [],
      idem: new Map(),
    }
    for (const username of ['bob', 'carol']) {
      const user = USERS.find((u) => u.username === username)
      const round = db.rounds[0]
      const pick = autoPick(round, user, true)
      createTeam(round, user, { starterPlayerIds: pick.starters.map((p) => p.id), benchPlayerId: pick.bench.id, captainPlayerId: pick.captainPlayerId })
    }
  }

  // ---------- catalogue ----------
  function playerResponse(p, homeCountryId, round) {
    const fixture = fixtureOf(round, p)
    const { clubIndex, playerIndex, ...rest } = p
    return {
      ...rest,
      displayStats: {},
      fixtureId: fixture?.id ?? null,
      eligible: Boolean(fixture),
      isHomeCountry: Boolean(homeCountryId && homeCountryId === p.countryId),
    }
  }
  const roundPlayers = (round, homeCountryId) =>
    PLAYERS.filter((p) => fixtureOf(round, p)).map((p) => playerResponse(p, homeCountryId, round)).sort(byName)

  function roundResponse(r) {
    return {
      id: r.id, name: r.name, status: r.status, entryDeadline: iso(r.entryDeadline),
      subWindowOpensAt: iso(r.subWindowOpensAt), subWindowClosesAt: iso(r.subWindowClosesAt),
      rules: r.rules, stateVersion: r.stateVersion, serverTime: iso(Date.now()),
      fixtures: r.fixtures.map((f) => ({ ...f, kickoffAt: iso(f.kickoffAt) })),
    }
  }
  function requireRound(id) {
    const round = roundById(id)
    if (!round) throw notFound()
    return round
  }

  // ---------- teams ----------
  function autoPick(round, user, preferHome) {
    const pool = roundPlayers(round, user.countryId).filter((p) => p.eligible)
    if (preferHome) pool.sort((a, b) => Number(b.isHomeCountry) - Number(a.isHomeCountry))
    const countries = new Set()
    const starters = []
    for (const p of pool) if (starters.length < 5 && !countries.has(p.countryId)) { countries.add(p.countryId); starters.push(p) }
    const bench = pool.find((p) => !starters.includes(p))
    if (starters.length !== 5 || !bench) throw rule('AUTO_PICK_IMPOSSIBLE', 'Need five starter countries and a sixth player')
    return {
      starters, bench, captainPlayerId: starters[0].id,
      explanation: 'Five different countries; first starter is captain; home player prioritized when requested.',
    }
  }

  function validate(round, lineup) {
    const starters = lineup.starterPlayerIds
    if (!Array.isArray(starters) || starters.length !== 5) throw rule('WRONG_SQUAD_SIZE', 'Exactly five starters required')
    const ids = [...starters, lineup.benchPlayerId]
    if (new Set(ids).size !== 6) throw rule('DUPLICATE_PLAYER', 'Six distinct players required')
    const selected = roundPlayers(round, null).filter((p) => ids.includes(p.id) && p.eligible)
    if (selected.length !== 6) throw rule('PLAYER_INELIGIBLE', 'All players must be eligible for this round')
    if (!starters.includes(lineup.captainPlayerId)) throw rule('CAPTAIN_NOT_STARTER', 'Captain must be a starter')
    if (new Set(selected.filter((p) => starters.includes(p.id)).map((p) => p.countryId)).size !== 5)
      throw rule('DUPLICATE_COUNTRY', 'Starters must represent five countries')
  }

  const findTeam = (roundId, userId) => db.teams.find((t) => t.roundId === roundId && t.userId === userId)
  function selectionsFor(lineup, from) {
    return [
      ...lineup.starterPlayerIds.map((playerId) => ({ playerId, role: 'STARTER', from, to: null })),
      { playerId: lineup.benchPlayerId, role: 'BENCH', from, to: null },
    ]
  }

  function createTeam(round, user, lineup) {
    if (round.status !== 'OPEN') throw rule('ROUND_NOT_OPEN', 'Round is not open')
    if (Date.now() >= round.entryDeadline) throw rule('ROUND_LOCKED', 'Entry deadline has passed')
    if (findTeam(round.id, user.id)) throw new ApiError(409, 'TEAM_ALREADY_EXISTS', 'One team per round')
    validate(round, lineup)
    const team = {
      id: randomUUID(), roundId: round.id, userId: user.id, captainPlayerId: lineup.captainPlayerId,
      homeCountryId: user.countryId, subsUsed: 0, version: 0, selections: selectionsFor(lineup, round.entryDeadline), subs: [],
    }
    db.teams.push(team)
    bump(round)
    return snapshot(team)
  }

  function teamOf(user, teamId) {
    const team = db.teams.find((t) => t.id === teamId)
    if (!team) throw notFound()
    if (team.userId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'Team belongs to another user')
    return team
  }
  const checkVersion = (team, expected) => {
    if (team.version !== expected) throw new ApiError(409, 'VERSION_CONFLICT', 'Reload the current team version')
  }

  function updateLineup(team, body) {
    const round = roundById(team.roundId)
    checkVersion(team, body.expectedVersion)
    if (round.status !== 'OPEN' || Date.now() >= round.entryDeadline) throw rule('ROUND_LOCKED', 'Lineup is locked')
    validate(round, body)
    team.selections = selectionsFor(body, round.entryDeadline)
    team.captainPlayerId = body.captainPlayerId
    team.version += 1
    bump(round)
    return snapshot(team)
  }

  function substitute(team, body) {
    const round = roundById(team.roundId)
    checkVersion(team, body.expectedVersion)
    if (round.status !== 'LIVE') throw rule('ROUND_NOT_LIVE', 'Round is not live')
    if (team.subsUsed > 0) throw rule('SUBSTITUTION_USED', 'One substitution per round')
    const now = Date.now()
    if (now < round.subWindowOpensAt || now >= round.subWindowClosesAt) throw rule('SUBSTITUTION_WINDOW_CLOSED', 'Substitution window is closed')
    const current = snapshot(team, now)
    if (!current.bench || current.bench.player.id !== body.incomingPlayerId || !current.starters.some((s) => s.player.id === body.outgoingPlayerId))
      throw rule('INVALID_SUBSTITUTION', 'Swap one active starter for the bench player')
    if (!current.bench.player.eligible) throw rule('PLAYER_INELIGIBLE', 'Bench player is ineligible')
    const countries = new Set(current.starters.filter((s) => s.player.id !== body.outgoingPlayerId).map((s) => s.player.countryId))
    if (countries.has(current.bench.player.countryId)) throw rule('DUPLICATE_COUNTRY', 'Swap would duplicate a starter country')
    const cutoff = now + round.rules.subActivationDelaySeconds * 1000
    for (const s of team.selections) if (s.to == null && (s.playerId === body.outgoingPlayerId || s.playerId === body.incomingPlayerId)) s.to = cutoff
    team.selections.push({ playerId: body.outgoingPlayerId, role: 'BENCH', from: cutoff, to: null })
    team.selections.push({ playerId: body.incomingPlayerId, role: 'STARTER', from: cutoff, to: null })
    team.subs.push({ outgoingPlayerId: body.outgoingPlayerId, incomingPlayerId: body.incomingPlayerId, acceptedAt: now, effectiveAt: cutoff })
    team.subsUsed = 1
    team.version += 1
    bump(round)
    return snapshot(team, now)
  }

  // ---------- events & scoring ----------
  function latestEvents(round) {
    const fixtureIds = new Set(round.fixtures.map((f) => f.id))
    const newest = new Map()
    for (const e of db.events) {
      if (!fixtureIds.has(e.fixtureId)) continue
      const prev = newest.get(e.providerEventId)
      if (!prev || e.revision > prev.revision) newest.set(e.providerEventId, e)
    }
    const appearances = new Set()
    return [...newest.values()]
      .filter((e) => !e.voided)
      .sort((a, b) => a.occurredAt - b.occurredAt || a.providerEventId.localeCompare(b.providerEventId))
      .filter((e) => e.eventType !== 'APPEARANCE' || !appearances.has(`${e.fixtureId}:${e.playerId}`) && appearances.add(`${e.fixtureId}:${e.playerId}`))
  }

  const activeAt = (s, t) => s.role === 'STARTER' && t >= s.from && (s.to == null || t < s.to)

  /** ScoringEngine.score for every event of the round. */
  function contributions(team, round) {
    const rules = round.rules
    const lines = []
    for (const e of latestEvents(round)) {
      const sel = team.selections.find((s) => s.playerId === e.playerId && activeAt(s, e.occurredAt))
      if (!sel) continue
      const add = (component, points, explanation) => {
        if (points !== 0) lines.push({ playerId: e.playerId, eventId: e.id, component, points, explanation, matchMinute: e.matchMinute, occurredAt: iso(e.occurredAt), fixtureId: e.fixtureId })
      }
      const base = rules.base[e.eventType]
      add('BASE', base, e.eventType)
      const late = e.eventType === 'GOAL' && e.matchMinute >= rules.twist.fromMatchMinute ? base * (rules.twist.multiplier - 1) : 0
      add('LATE_GOAL_BONUS', late, `Goal from minute ${rules.twist.fromMatchMinute}`)
      if (e.playerId === team.captainPlayerId) add('CAPTAIN_BONUS', (base + late) * (rules.captainMultiplier - 1), 'Captain multiplier')
      if (team.homeCountryId && team.homeCountryId === playerById(e.playerId).countryId) {
        const bonus = e.eventType === 'GOAL' ? rules.homeHero.GOAL : e.eventType === 'ASSIST' ? rules.homeHero.ASSIST : 0
        add('HOME_HERO_BONUS', bonus, 'Home Hero (fixed bonus)')
      }
    }
    return lines.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId) || a.component.localeCompare(b.component))
  }

  function breakdown(team) {
    const lines = contributions(team, roundById(team.roundId))
    const byPlayer = new Map()
    for (const l of lines) (byPlayer.get(l.playerId) ?? byPlayer.set(l.playerId, []).get(l.playerId)).push(l)
    return {
      teamId: team.id,
      total: sum(lines),
      players: [...byPlayer].map(([playerId, components]) => ({ playerId, total: sum(components), components })),
      timeline: lines,
    }
  }

  function standings(round) {
    const rows = db.teams
      .filter((t) => t.roundId === round.id)
      .map((t) => ({ teamId: t.id, displayName: userById(t.userId).displayName, score: breakdown(t).total }))
      .sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId))
    rows.forEach((row, i) => (row.rank = i > 0 && row.score === rows[i - 1].score ? rows[i - 1].rank : i + 1))
    return rows.map(({ teamId, displayName, rank, score }) => ({ teamId, displayName, rank, score }))
  }

  function snapshot(team, now = Date.now()) {
    const round = roundById(team.roundId)
    const b = breakdown(team)
    const points = new Map(b.players.map((p) => [p.playerId, p.total]))
    const current = team.selections.filter((s) => round.status === 'OPEN' || (now >= s.from && (s.to == null || now < s.to)))
    const state = (s) => ({ player: playerResponse(playerById(s.playerId), team.homeCountryId, round), points: points.get(s.playerId) ?? 0 })
    const starters = current.filter((s) => s.role === 'STARTER').map(state)
    const bench = current.filter((s) => s.role === 'BENCH').map(state)[0] ?? null
    const pending = team.subs.find((s) => s.effectiveAt > now)
    return {
      id: team.id, roundId: team.roundId, starters, bench, captainPlayerId: team.captainPlayerId, homeCountryId: team.homeCountryId,
      homeHeroPlayerId: starters.find((s) => s.player.isHomeCountry)?.player.id ?? null,
      pendingSubstitution: pending ? { outgoingPlayerId: pending.outgoingPlayerId, incomingPlayerId: pending.incomingPlayerId, effectiveAt: iso(pending.effectiveAt) } : null,
      subsUsed: team.subsUsed, subsRemaining: 1 - team.subsUsed, score: b.total,
      rank: standings(round).find((e) => e.teamId === team.id)?.rank ?? 0,
      version: team.version, stateVersion: round.stateVersion, asOf: iso(now),
    }
  }

  function ingest(round, { key, revision = 1, player, type, minute, occurredAt, voided = false }) {
    const providerEventId = `${round.id}:${key}`
    const prior = db.events.filter((e) => e.providerEventId === providerEventId)
    if (prior.some((e) => e.revision === revision)) return // exact replay
    const applied = !prior.length || revision > Math.max(...prior.map((e) => e.revision))
    db.events.push({ id: randomUUID(), providerEventId, revision, fixtureId: fixtureOf(round, player).id, playerId: player.id, eventType: type, matchMinute: minute, occurredAt, voided })
    if (applied) bump(round)
  }

  // ---------- lifecycle ----------
  function openRound(round) {
    if (round.status === 'OPEN') return roundResponse(round)
    if (round.status !== 'DRAFT') throw rule('ROUND_NOT_OPEN', 'Only draft rounds can open')
    const deadline = Date.now() + 600_000
    Object.assign(round, { status: 'OPEN', entryDeadline: deadline, subWindowOpensAt: deadline, subWindowClosesAt: deadline + 21_600_000, rules: { ...RULES, subActivationDelaySeconds: subDelaySeconds } })
    bump(round)
    return roundResponse(round)
  }

  function startRound(round, early) {
    if (round.status === 'LIVE') return roundResponse(round)
    if (round.status !== 'OPEN') throw rule('ROUND_NOT_OPEN', 'Round is not open')
    const now = Date.now()
    if (early && now < round.entryDeadline) round.entryDeadline = now
    if (now < round.entryDeadline) throw rule('ROUND_NOT_LIVE', 'Deadline has not arrived')
    Object.assign(round, { status: 'LIVE', subWindowOpensAt: round.entryDeadline, subWindowClosesAt: round.entryDeadline + 21_600_000 })
    for (const t of db.teams.filter((x) => x.roundId === round.id)) for (const s of t.selections) s.from = round.entryDeadline
    bump(round)
    return roundResponse(round)
  }

  function settle(round) {
    if (sim.running && sim.roundId === round.id) throw new ApiError(409, 'ROUND_BUSY', 'Stop or finish the simulator before settlement')
    const rows = standings(round)
    if (round.status === 'SETTLED') return { roundId: round.id, status: 'SETTLED', participants: rows.length, stateVersion: round.stateVersion }
    if (round.status !== 'LIVE') throw rule('ROUND_NOT_LIVE', 'Only live rounds can settle')
    const now = Date.now()
    if (db.teams.some((t) => t.roundId === round.id && t.subs.some((s) => s.effectiveAt > now)))
      throw new ApiError(409, 'ROUND_BUSY', 'Wait for pending substitutions to activate')
    const { participationRp, winnerBonusRp } = round.rules.rewards
    const credit = (userId, reason, amount) => {
      if (db.ledger.some((l) => l.userId === userId && l.roundId === round.id && l.reason === reason)) return
      db.ledger.push({ id: randomUUID(), userId, delta: amount, reason, roundId: round.id, purchaseId: null, createdAt: now })
      db.wallets[userId] += amount
    }
    for (const row of rows) {
      const team = db.teams.find((t) => t.id === row.teamId)
      credit(team.userId, 'PARTICIPATION', participationRp)
      if (row.rank === 1) credit(team.userId, 'WINNER', winnerBonusRp)
      db.results.push({ teamId: row.teamId, roundId: round.id, finalScore: row.score, finalRank: row.rank, participationRp, winnerRp: row.rank === 1 ? winnerBonusRp : 0, settledAt: now })
    }
    Object.assign(round, { status: 'SETTLED', settledAt: now })
    bump(round)
    return { roundId: round.id, status: 'SETTLED', participants: rows.length, stateVersion: round.stateVersion }
  }

  function result(team) {
    const r = db.results.find((x) => x.teamId === team.id)
    if (!r) throw notFound()
    return { ...r, totalAwardedRp: r.participationRp + r.winnerRp, settledAt: iso(r.settledAt), breakdown: breakdown(team) }
  }

  // RoundScheduler.startDue: OPEN rounds go LIVE once the deadline passes.
  const scheduler = setInterval(() => {
    for (const r of db.rounds) if (r.status === 'OPEN' && r.entryDeadline <= Date.now()) startRound(r, false)
  }, 1000)

  // ---------- simulator (SimulatorService) ----------
  let sim
  function simReset() {
    if (sim?.timer) clearInterval(sim.timer)
    sim = { roundId: null, running: false, completed: false, lastError: null, cursor: 0, script: [], cutoffs: new Set(), timer: null }
  }
  const simStatus = () => {
    const round = sim.roundId ? roundById(sim.roundId) : null
    const minute = round ? Math.max(0, Math.min(90, Math.floor((Date.now() - round.entryDeadline) / minuteMs))) : 0
    return { roundId: sim.roundId, running: sim.running, completed: sim.completed, currentMatchMinute: minute, lastError: sim.lastError }
  }
  function simStart(roundId) {
    if (sim.running) {
      if (roundId !== sim.roundId) throw new ApiError(409, 'ROUND_BUSY', 'Another simulation is running')
      return simStatus()
    }
    const round = requireRound(roundId)
    if (round.status !== 'LIVE') throw rule('ROUND_NOT_LIVE', 'Start round first')
    const players = roundPlayers(round, null)
    const d = (minute, player, type, key, deliveryMinute = minute, revision = 1, voided = false) => ({ deliveryMinute, minute, player, type, key, revision, voided })
    const script = players.map((p) => d(0, p, 'APPEARANCE', `appearance-${p.id}`))
    if (script.length) script.push(script[0])
    for (const minute of [5, 15, 30, 74, 75, 81])
      for (const p of players) script.push(d(minute, p, minute === 15 ? 'ASSIST' : minute === 30 ? 'YELLOW_CARD' : 'GOAL', `event-${minute}-${p.id}`))
    if (players.length) {
      const p = players[0]
      script.push(d(35, p, 'GOAL', 'voided-goal'), d(35, p, 'GOAL', 'voided-goal', 40, 2, true), d(20, p, 'GOAL', 'delayed-goal', 50))
      script.push(d(55, p, 'GOAL', 'corrected-event'), d(55, p, 'ASSIST', 'corrected-event', 56, 3), d(55, p, 'GOAL', 'corrected-event', 57, 2))
    }
    script.sort((a, b) => a.deliveryMinute - b.deliveryMinute)
    Object.assign(sim, { roundId, running: true, completed: false, lastError: null, cursor: 0, script, cutoffs: new Set() })
    clearInterval(sim.timer)
    sim.timer = setInterval(simTick, Math.max(50, Math.min(500, minuteMs / 4)))
    return simStatus()
  }
  function simTick() {
    if (!sim.running) return
    try {
      const round = roundById(sim.roundId)
      if (round.status !== 'LIVE') { sim.running = false; return }
      const now = Date.now()
      let sent = 0
      while (sim.cursor < sim.script.length && sent++ < 10) {
        const e = sim.script[sim.cursor]
        if (round.entryDeadline + e.deliveryMinute * minuteMs > now) break
        ingest(round, { key: e.key, revision: e.revision, player: e.player, type: e.type, minute: e.minute, occurredAt: round.entryDeadline + e.minute * minuteMs, voided: e.voided })
        sim.cursor++
      }
      for (const t of db.teams.filter((x) => x.roundId === round.id)) {
        for (const s of t.subs) {
          const key = `${s.outgoingPlayerId}:${s.incomingPlayerId}:${s.effectiveAt}`
          if (sim.cutoffs.has(key) || now < s.effectiveAt + 2000) continue
          const minuteAt = (t2) => Math.floor((t2 - round.entryDeadline) / minuteMs)
          ingest(round, { key: `cutoff:${key}:out-before`, player: playerById(s.outgoingPlayerId), type: 'GOAL', minute: minuteAt(s.effectiveAt - 1), occurredAt: s.effectiveAt - 1 })
          ingest(round, { key: `cutoff:${key}:in-at`, player: playerById(s.incomingPlayerId), type: 'GOAL', minute: minuteAt(s.effectiveAt), occurredAt: s.effectiveAt })
          sim.cutoffs.add(key)
        }
      }
      if (sim.cursor === sim.script.length && now >= round.entryDeadline + 90 * minuteMs) {
        Object.assign(sim, { running: false, completed: true })
        clearInterval(sim.timer)
      }
    } catch (e) {
      Object.assign(sim, { running: false, lastError: e.message })
      log(`[mock] simulator failed: ${e.stack}`)
    }
  }

  // ---------- helpers ----------
  function page(items, query, map = (x) => x) {
    const p = Number(query.get('page') ?? 0)
    const size = Number(query.get('size') ?? 20)
    if (!(p >= 0) || !(size >= 1) || size > 100) throw new ApiError(400, 'VALIDATION_FAILED', 'page >= 0 and size 1–100 required')
    return { items: items.slice(p * size, p * size + size).map(map), page: p, size, total: items.length }
  }
  function idempotent(req, user, methodPath, body, status, fn) {
    const key = req.headers['idempotency-key']
    if (!key || key.length > 200) throw new ApiError(400, 'VALIDATION_FAILED', 'Idempotency-Key must contain 1–200 characters')
    const id = `${user.id}:${key}:${methodPath}`
    const hash = createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex')
    const saved = db.idem.get(id)
    if (saved) {
      if (saved.hash !== hash) throw rule('IDEMPOTENCY_KEY_REUSED', 'Key already used for a different request')
      return { status: saved.status, body: saved.body }
    }
    const out = { status, body: fn() }
    db.idem.set(id, { hash, ...out })
    return out
  }
  function authUser(req) {
    const cookie = Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0])).dev_user
    const username = req.headers['x-dev-user'] ?? cookie
    if (!username) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
    const user = USERS.find((u) => u.username === username)
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Unknown demo user')
    return user
  }

  // ---------- routing ----------
  const routes = []
  const route = (method, pattern, fn, { auth = true } = {}) =>
    routes.push({ method, re: new RegExp(`^/api/v1${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn, auth })

  route('POST', '/dev/login', ({ query, res }) => {
    const user = USERS.find((u) => u.username === query.get('username'))
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Unknown demo user')
    res.setHeader('Set-Cookie', `dev_user=${user.username}; Path=/api; HttpOnly; SameSite=Lax`)
    return user
  }, { auth: false })
  route('GET', '/me', ({ user }) => user)
  route('GET', '/rules', () => ({ ...RULES, subActivationDelaySeconds: subDelaySeconds }))
  route('GET', '/rounds', ({ query }) => {
    const status = query.get('status')
    if (status != null && !['OPEN', 'LIVE', 'SETTLED'].includes(status)) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid round status')
    const items = db.rounds
      .filter((r) => (status == null ? ['OPEN', 'LIVE'].includes(r.status) : r.status === status))
      .sort((a, b) => Number(a.status !== 'LIVE') - Number(b.status !== 'LIVE') || a.entryDeadline - b.entryDeadline || a.id.localeCompare(b.id))
    return page(items, query, roundResponse)
  })
  route('GET', '/rounds/:id', ({ p }) => roundResponse(requireRound(p.id)))
  route('GET', '/rounds/:id/players', ({ p, query, user }) => {
    const round = requireRound(p.id)
    const position = query.get('position')
    const countryId = query.get('countryId')
    const name = (query.get('name') ?? '').toLowerCase()
    return page(roundPlayers(round, user.countryId).filter((pl) =>
      (position == null || pl.position === position) && (countryId == null || pl.countryId === countryId) && pl.name.toLowerCase().includes(name)), query)
  })
  route('GET', '/rounds/:id/players/:playerId', ({ p, user }) => {
    const pl = roundPlayers(requireRound(p.id), user.countryId).find((x) => x.id === p.playerId)
    if (!pl) throw notFound()
    return pl
  })
  route('POST', '/rounds/:roundId/auto-pick', ({ p, body, user }) => autoPick(requireRound(p.roundId), user, Boolean(body?.preferHomeHero)))
  route('POST', '/rounds/:roundId/teams', ({ p, body, user, req, res }) => {
    const round = requireRound(p.roundId)
    const out = idempotent(req, user, `POST /api/v1/rounds/${p.roundId}/teams`, body, 201, () => createTeam(round, user, body ?? {}))
    res.statusCode = out.status
    return out.body
  })
  route('GET', '/rounds/:roundId/my-team', ({ p, user }) => {
    requireRound(p.roundId)
    const team = findTeam(p.roundId, user.id)
    if (!team) throw notFound()
    return snapshot(team)
  })
  route('PUT', '/teams/:id/lineup', ({ p, body, user }) => updateLineup(teamOf(user, p.id), body ?? {}))
  route('POST', '/teams/:id/substitutions', ({ p, body, user, req, res }) => {
    const team = teamOf(user, p.id)
    const out = idempotent(req, user, `POST /api/v1/teams/${p.id}/substitutions`, body, 200, () => substitute(team, body ?? {}))
    res.statusCode = out.status
    return out.body
  })
  route('GET', '/teams/:id/score-breakdown', ({ p, user }) => breakdown(teamOf(user, p.id)))
  route('GET', '/rounds/:id/leaderboard', ({ p, query }) => {
    const round = requireRound(p.id)
    return { roundId: round.id, stateVersion: round.stateVersion, standings: page(standings(round), query) }
  })
  route('GET', '/rounds/:id/result', ({ p, user }) => {
    const round = requireRound(p.id)
    if (round.status !== 'SETTLED') throw rule('ROUND_NOT_SETTLED', 'Round is not settled')
    const team = findTeam(round.id, user.id)
    if (!team) throw notFound()
    return result(team)
  })
  route('GET', '/rewards/wallet', ({ user }) => ({ balanceRp: db.wallets[user.id] ?? 0 }))
  route('GET', '/rewards/history', ({ user, query }) =>
    page(db.ledger.filter((l) => l.userId === user.id).sort((a, b) => b.createdAt - a.createdAt), query, ({ userId, ...l }) => ({ ...l, createdAt: iso(l.createdAt) })))
  route('GET', '/me/purchases', ({ user, query }) =>
    page(db.purchases.filter((x) => x.userId === user.id).sort((a, b) => b.createdAt - a.createdAt), query, ({ userId, ...x }) => ({ ...x, createdAt: iso(x.createdAt) })))
  route('GET', '/gifts', ({ query }) => {
    const category = query.get('category')
    return page(GIFTS.filter((g) => category == null || g.category === category), query)
  })
  route('POST', '/gifts/:id/purchases', ({ p, user, req, res, body }) => {
    const out = idempotent(req, user, `POST /api/v1/gifts/${p.id}/purchases`, body, 201, () => {
      const gift = GIFTS.find((g) => g.id === p.id)
      if (!gift) throw rule('GIFT_UNAVAILABLE', 'Gift is unavailable')
      const balance = db.wallets[user.id]
      if (balance < gift.priceRp) throw rule('INSUFFICIENT_RP', 'Not enough reward points')
      const now = Date.now()
      const purchase = { id: randomUUID(), userId: user.id, giftId: gift.id, giftName: gift.name, priceRp: gift.priceRp, voucherCode: `SST-${randomUUID()}`, createdAt: now }
      db.wallets[user.id] -= gift.priceRp
      db.purchases.push(purchase)
      db.ledger.push({ id: randomUUID(), userId: user.id, delta: -gift.priceRp, reason: 'PURCHASE', roundId: null, purchaseId: purchase.id, createdAt: now })
      const { userId, ...pub } = purchase
      return { purchase: { ...pub, createdAt: iso(now) }, balanceRp: db.wallets[user.id] }
    })
    res.statusCode = out.status
    return out.body
  })
  route('GET', '/dev/simulator', () => simStatus())
  route('POST', '/dev/simulator/start', ({ body }) => {
    if (!body?.roundId) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid request')
    return simStart(body.roundId)
  })
  route('POST', '/dev/simulator/stop', () => { sim.running = false; return simStatus() })
  route('POST', '/dev/rounds/:id/open', ({ p }) => openRound(requireRound(p.id)))
  route('POST', '/dev/rounds/:id/start', ({ p }) => startRound(requireRound(p.id), true))
  route('POST', '/dev/rounds/:id/settle', ({ p }) => settle(requireRound(p.id)))
  route('POST', '/dev/reset', () => { reset(); return { reset: true } })

  function stream({ p, user, req, res }) {
    const round = requireRound(p.roundId)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const send = () => {
      const team = findTeam(round.id, user.id)
      const envelope = {
        eventType: 'ROUND_SNAPSHOT', roundId: round.id, stateVersion: round.stateVersion, asOf: iso(Date.now()),
        payload: {
          round: roundResponse(round),
          myTeam: team ? snapshot(team) : null,
          leaderboard: standings(round).slice(0, 100),
          result: round.status === 'SETTLED' && team ? result(team) : null,
        },
      }
      res.write(`event:ROUND_SNAPSHOT\ndata:${JSON.stringify(envelope)}\n\n`)
    }
    send()
    const timer = setInterval(send, 2000)
    const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 20_000)
    req.on('close', () => { clearInterval(timer); clearInterval(heartbeat) })
  }
  route('GET', '/rounds/:roundId/stream', (ctx) => { stream(ctx); return undefined })

  async function readBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return undefined
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw) return undefined
    try { return JSON.parse(raw) } catch { throw new ApiError(400, 'VALIDATION_FAILED', 'Malformed or missing request value') }
  }

  /** Public player photos and credits (`GET/HEAD /media/players/**`), served from MOCK_MEDIA_DIR. */
  function media(req, res, url) {
    const root = mediaDir && path.resolve(mediaDir)
    const file = root && path.resolve(root, `.${decodeURIComponent(url.pathname.replace(/^\/media/, ''))}`)
    if (!file || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, 'http://mock.local')
    if (url.pathname.startsWith('/media/players/') && (req.method === 'GET' || req.method === 'HEAD')) return media(req, res, url)
    if (!url.pathname.startsWith('/api/v1/')) return next ? next() : notFoundRes(res)
    const traceId = randomBytes(8).toString('hex')
    try {
      const match = routes.map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.re) })).find((x) => x.m)
      const user = match?.r.auth === false ? undefined : authUser(req)
      if (!match) throw notFound()
      const body = await readBody(req)
      const out = await match.r.fn({ req, res, p: match.m.groups ?? {}, query: url.searchParams, body, user })
      if (out === undefined) return // streamed
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(out))
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500
      if (!(e instanceof ApiError)) log(`[mock] ${req.method} ${url.pathname} failed: ${e.stack}`)
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ code: e.code ?? 'INTERNAL_ERROR', message: e instanceof ApiError ? e.message : 'Unexpected server error', fieldErrors: e.fieldErrors ?? [], traceId }))
    }
  }
  function notFoundRes(res) {
    res.statusCode = 404
    res.end()
  }

  reset()
  return {
    handler,
    reset,
    close() {
      clearInterval(scheduler)
      simReset()
    },
  }
}

/** Starts the mock on its own port. Resolves to null when the port is taken (already running). */
export function startMockApi({ port = 8090, ...options } = {}) {
  const api = createMockApi(options)
  const server = http.createServer((req, res) => api.handler(req, res))
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        api.close()
        resolve(null)
      } else reject(e)
    })
    server.listen(port, () => resolve({ server, api, close: () => { api.close(); server.close() } }))
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.MOCK_API_PORT || 8090)
  const started = await startMockApi({
    port,
    minuteMs: Number(process.env.MOCK_MINUTE_MS || 2000),
    subDelaySeconds: Number(process.env.MOCK_SUB_DELAY_S || 60),
    mediaDir: process.env.MOCK_MEDIA_DIR || null,
    log: console.log,
  })
  console.log(started ? `Mock Sporty Street API on http://localhost:${port}/api/v1` : `Port ${port} is busy`)
}
