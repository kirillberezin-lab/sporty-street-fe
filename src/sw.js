/* Service worker: offline app shell (Workbox precache) + Web Push for tactical alerts (design 4.1). */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { queueAlert } from './lib/idb.js'

const BASE = import.meta.env.BASE_URL // '/' or '/<repo>/' on GitHub Pages

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// SPA deep links (e.g. challenge links /c/...) work offline; the API is never served from cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/api\//, /\/media\//] }))
// Player photos (backend /media/players/*) rarely change: cache-first, bounded.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith(`${BASE}media/players/`),
  new CacheFirst({ cacheName: 'player-photos', plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 86400 })] }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let alert
  try {
    alert = event.data?.json() ?? {}
  } catch {
    alert = { title: 'SportyStreet', body: event.data?.text() ?? '' }
  }
  alert.id ??= `push:${Date.now()}`
  alert.createdAt ??= new Date().toISOString()

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const visible = windows.some((c) => c.visibilityState === 'visible')
      for (const c of windows) c.postMessage({ type: 'alert-received', alert })
      await queueAlert(alert).catch(() => {})
      // Always show a notification: iOS revokes push permission from sites that receive silent pushes.
      await self.registration.showNotification(alert.title || 'SportyStreet', {
        body: alert.body,
        tag: alert.tag,
        renotify: Boolean(alert.tag),
        icon: `${BASE}pwa-192x192.png`,
        badge: `${BASE}badge-96x96.png`,
        data: { url: alert.url || '/' },
        requireInteraction: Boolean(alert.requireInteraction) && !visible,
        silent: visible,
        timestamp: Date.parse(alert.createdAt) || Date.now(),
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Alert urls are app routes ('/rounds/…'); the page lives under BASE.
  const route = event.notification.data?.url || '/'
  const target = new URL(`${BASE}${route.replace(/^\//, '')}`, self.location.origin)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const win = windows.find((c) => new URL(c.url).origin === self.location.origin)
      if (win) {
        await win.focus()
        win.postMessage({ type: 'navigate', url: route })
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})

// Browsers may rotate subscriptions; re-register the new one with the same server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(`${BASE}api/v1/push/config`, { credentials: 'same-origin' })
      if (!res.ok) return
      const { vapidPublicKey } = await res.json()
      const pad = '='.repeat((4 - (vapidPublicKey.length % 4)) % 4)
      const key = Uint8Array.from(atob((vapidPublicKey + pad).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      await fetch(`${BASE}api/v1/push/subscriptions`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
    })(),
  )
})
