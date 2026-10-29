// Static build (GitHub Pages): the backend runs inside the page. src/mock/core.js answers every API
// call and feeds a stand-in for the SSE stream; its state lives in localStorage, so teams, RP and
// vouchers survive reloads and the clock-driven rounds catch up when the app is opened again.
import { createMockCore } from '../mock/core.js'

const KEY = 'sst:engine'
const USER_KEY = 'sst:engine:user'
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

let dirty = false
const core = createMockCore({
  autopilot: true,
  minuteMs: Number(import.meta.env.VITE_MINUTE_MS || 2000),
  subDelaySeconds: Number(import.meta.env.VITE_SUB_DELAY_S || 60),
  periodMs: Number(import.meta.env.VITE_ROUND_EVERY_MIN || 6) * 60_000,
  mediaBase: import.meta.env.BASE_URL.replace(/\/$/, ''),
  state: read(KEY),
  onChange: () => (dirty = true),
  log: console.warn,
})
function save() {
  if (!dirty) return
  dirty = false
  try {
    localStorage.setItem(KEY, JSON.stringify(core.serialize()))
  } catch (e) {
    console.warn('Could not save demo state', e)
  }
}
setInterval(save, 3000)
addEventListener('pagehide', save)
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())

// The cookie session of the real backend, kept per browser.
let devUser = read(USER_KEY)

/** fetch() stand-in for `/api/v1/...` */
export async function localFetch(url, init = {}) {
  const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  if (devUser) headers['x-dev-user'] = devUser
  const out = await core.handle({ method: init.method ?? 'GET', url, headers, body: init.body ? JSON.parse(init.body) : undefined })
  if (out.status === 200 && url.includes('/dev/login')) {
    devUser = out.body.username
    localStorage.setItem(USER_KEY, JSON.stringify(devUser))
  }
  if (url.includes('/dev/reset')) save()
  return new Response(out.body === undefined ? null : JSON.stringify(out.body), { status: out.status, headers: out.headers })
}

/** EventSource stand-in: named ROUND_SNAPSHOT events every 2 s, like LiveController. */
export class LocalEventSource extends EventTarget {
  static CLOSED = 2
  constructor(url) {
    super()
    this.readyState = 0
    this.url = url
    const send = async () => {
      if (this.readyState === LocalEventSource.CLOSED) return
      const out = await core.handle({ method: 'GET', url, headers: devUser ? { 'x-dev-user': devUser } : {} })
      if (!out.stream) {
        this.readyState = LocalEventSource.CLOSED
        clearInterval(this.timer)
        this.dispatchEvent(new Event('error'))
        return
      }
      if (this.readyState === 0) {
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
      }
      this.dispatchEvent(new MessageEvent('ROUND_SNAPSHOT', { data: JSON.stringify(out.stream()) }))
    }
    setTimeout(send, 0)
    this.timer = setInterval(send, 2000)
  }
  close() {
    clearInterval(this.timer)
    this.readyState = LocalEventSource.CLOSED
  }
}
