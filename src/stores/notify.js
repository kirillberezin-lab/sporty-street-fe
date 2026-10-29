// Tactical alerts (design 4.1) and the notifications inbox (9.2).
//
// Three delivery paths, best available wins:
//  1. Web Push (app closed / phone locked): service worker subscription + server sender.
//     The backend has no push yet, so the dev relay (server/push-relay.mjs) implements the contract.
//  2. Local system notifications from live SSE diffs while the app is open in the background.
//  3. In-app banners while the app is visible.
import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ALERT_PREF } from '../lib/liveDiff.js'
import { drainAlerts } from '../lib/idb.js'
import { pwa, swRegistration } from '../lib/pwa.js'
import { store } from '../lib/util.js'
import { session } from './session.js'
import { toast } from './ui.js'
import { asset } from '../lib/url.js'

const hasNotification = typeof window !== 'undefined' && 'Notification' in window

export const notify = reactive({
  supported: hasNotification,
  pushSupported: 'PushManager' in window && pwa.swSupported,
  permission: hasNotification ? Notification.permission : 'unsupported',
  pushActive: false,
  provider: null,
  busy: false,
  lastError: null,
  prefs: { enabled: true, tactical: true, lock: true, social: true, recaps: true, quietHours: false, ...store.get('alertPrefs', {}) },
  inbox: [],
})

const inboxKey = () => `inbox:${session.username}`

export function loadInbox() {
  notify.inbox = store.get(inboxKey(), [])
}
function saveInbox() {
  store.set(inboxKey(), notify.inbox.slice(0, 100))
}

export function addToInbox(alert, { read = false } = {}) {
  if (!alert?.id || notify.inbox.some((a) => a.id === alert.id)) return false
  notify.inbox.unshift({ createdAt: new Date().toISOString(), ...alert, read })
  notify.inbox.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  saveInbox()
  return true
}

export function markAllRead() {
  notify.inbox.forEach((a) => (a.read = true))
  saveInbox()
}
export function markRead(id) {
  const a = notify.inbox.find((x) => x.id === id)
  if (a) {
    a.read = true
    saveInbox()
  }
}
export const unreadCount = () => notify.inbox.filter((a) => !a.read).length

export function savePrefs() {
  store.set('alertPrefs', notify.prefs)
  if (notify.pushActive) syncPush().catch(() => {})
}

function inQuietHours(date = new Date()) {
  if (!notify.prefs.quietHours) return false
  const h = date.getHours()
  return h >= 23 || h < 8
}

export function allowed(alert) {
  const key = ALERT_PREF[alert.type]
  return !key || notify.prefs[key] !== false
}

/** What the platform allows right now — drives the copy in the alerts sheet and settings. */
export function capability() {
  if (!pwa.secure) return { level: 'insecure', text: 'Alerts need HTTPS (or localhost).' }
  if (pwa.isIOS && !pwa.installed) {
    return pwa.iosVersion && pwa.iosVersion < 16.4
      ? { level: 'ios-old', text: 'Lock-screen alerts need iOS 16.4 or newer.' }
      : { level: 'ios-install', text: 'On iPhone, add SportyStreet to your Home Screen first — iOS only allows alerts for installed web apps.' }
  }
  if (!notify.supported) return { level: 'unsupported', text: 'This browser does not support notifications.' }
  if (notify.permission === 'denied') return { level: 'denied', text: 'Notifications are blocked. Allow them in your browser or system settings.' }
  return { level: 'ok', text: '' }
}

async function showSystem(alert, { silent = false } = {}) {
  if (notify.permission !== 'granted') return false
  const options = {
    body: alert.body,
    tag: alert.tag,
    icon: asset('pwa-192x192.png'),
    badge: asset('badge-96x96.png'),
    data: { url: alert.url ?? '/' },
    renotify: Boolean(alert.tag),
    silent,
    timestamp: Date.parse(alert.createdAt ?? '') || Date.now(),
  }
  const reg = await swRegistration(1500)
  if (reg?.showNotification) {
    await reg.showNotification(alert.title, options)
    return true
  }
  try {
    new Notification(alert.title, options)
    return true
  } catch {
    return false
  }
}

/** Alerts computed in the app from live snapshots. */
export function handleAlerts(alerts = []) {
  for (const alert of alerts) {
    if (!addToInbox(alert)) continue
    if (!allowed(alert)) continue
    if (document.visibilityState === 'visible') {
      toast({ title: alert.title, body: alert.body, to: alert.url, duration: alert.type === 'sub_moment' ? 9000 : 5000 })
    } else if (!notify.pushActive && notify.prefs.enabled !== false && !inQuietHours()) {
      // The push relay covers the background when subscribed; otherwise notify from the page itself.
      showSystem(alert)
    }
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
function sameKey(buffer, base64) {
  if (!buffer) return false
  const a = new Uint8Array(buffer)
  const b = urlBase64ToUint8Array(base64)
  return a.length === b.length && a.every((x, i) => x === b[i])
}

const prefsPayload = () => ({ ...notify.prefs, tzOffset: new Date().getTimezoneOffset() })

/** Subscribes this device for Web Push and registers it with the server. */
export async function syncPush({ create = false } = {}) {
  if (!notify.pushSupported || notify.permission !== 'granted' || notify.prefs.enabled === false) return false
  const reg = await swRegistration()
  if (!reg?.pushManager) return false
  const config = await api.pushConfig().catch(() => null)
  if (!config?.vapidPublicKey) {
    notify.provider = null
    notify.pushActive = false
    return false
  }
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options?.applicationServerKey, config.vapidPublicKey)) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub && !create) return false
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) })
  await api.pushSubscribe(sub.toJSON(), prefsPayload())
  notify.provider = config.provider ?? 'backend'
  notify.pushActive = true
  return true
}

/** Must run from a tap: iOS and Chrome only show the permission prompt after a user gesture. */
export async function enableAlerts() {
  const cap = capability()
  if (cap.level !== 'ok') return cap.level
  notify.busy = true
  notify.lastError = null
  try {
    if (notify.permission !== 'granted') notify.permission = await Notification.requestPermission()
    if (notify.permission !== 'granted') return notify.permission
    notify.prefs.enabled = true
    notify.prefs.tactical = true
    savePrefs()
    await syncPush({ create: true }).catch((e) => (notify.lastError = e.message))
    return 'granted'
  } finally {
    notify.busy = false
  }
}

export async function disablePush() {
  const reg = await swRegistration(1500)
  const sub = await reg?.pushManager?.getSubscription()
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
  notify.pushActive = false
}

/** Demo button: a push through the server (works with the phone locked) or a local notification. */
export async function testAlert(sample) {
  const alert = { id: `test:${Date.now()}`, type: 'test', tag: 'test', url: '/notifications', createdAt: new Date().toISOString(), ...sample }
  if (notify.pushActive) {
    const res = await api.pushTest({ delaySeconds: 5, title: alert.title, body: alert.body, url: alert.url })
    return { via: 'push', scheduled: res?.scheduled ?? 0 }
  }
  if (notify.permission === 'granted') {
    setTimeout(() => showSystem(alert), 5000)
    return { via: 'local' }
  }
  handleAlerts([alert])
  return { via: 'in-app' }
}

export async function initNotify() {
  loadInbox()
  if (pwa.swSupported) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'alert-received') addToInbox(e.data.alert)
    })
  }
  const pending = await drainAlerts().catch(() => [])
  pending.forEach((a) => addToInbox(a))
  if (notify.supported) notify.permission = Notification.permission
  if (notify.permission === 'granted') await syncPush().catch(() => {})
}
