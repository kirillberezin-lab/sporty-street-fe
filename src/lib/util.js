/** UUID v4 that also works outside secure contexts (crypto.randomUUID needs HTTPS). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`ss:${key}`)
      return raw == null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`ss:${key}`, JSON.stringify(value))
    } catch { /* storage full or blocked */ }
  },
  remove(key) {
    try { localStorage.removeItem(`ss:${key}`) } catch { /* ignore */ }
  },
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Six-char code for invites: LAGOS-5K style. */
export function inviteCode(name = 'SPORTY') {
  const base = name.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 5) || 'FIVE'
  const tail = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${base}-${tail}`
}
