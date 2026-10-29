export const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0')

/** Splits a duration into {d, h, m, s, total}. */
export function parts(ms) {
  const total = Math.max(0, ms)
  const s = Math.floor(total / 1000)
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total }
}

/** "1d 02:14" / "02:14:33" / "04:12" */
export function countdown(ms, { seconds = true } = {}) {
  const p = parts(ms)
  if (p.d > 0) return `${p.d}d ${pad2(p.h)}:${pad2(p.m)}`
  if (p.h > 0 || seconds === false) return `${pad2(p.h)}:${pad2(p.m)}${seconds ? `:${pad2(p.s)}` : ''}`
  return `${pad2(p.m)}:${pad2(p.s)}`
}

/** Short human time left for tight spots: "45s", "9 min", "2h 05m", "3d 4h". */
export function timeLeft(ms) {
  const p = parts(ms)
  if (p.d > 0) return `${p.d}d ${p.h}h`
  if (p.h > 0) return `${p.h}h ${pad2(p.m)}m`
  if (p.m > 0) return `${p.m} min`
  return `${p.s}s`
}

export function clock(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** "Sat 17:30", or "Today 17:30" / "Tomorrow 17:30" */
export function dayTime(iso, now = Date.now()) {
  if (!iso) return '—'
  const d = new Date(iso)
  const day = (t) => new Date(t).toDateString()
  const label = day(d) === day(now) ? 'Today' : day(d) === day(now + 86400_000) ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short' })
  return `${label} ${clock(iso)}`
}

export function shortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function longDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "now", "9m ago", "3h ago", "2d ago" */
export function ago(iso, now = Date.now()) {
  const diff = Math.max(0, now - Date.parse(iso))
  if (diff < 60_000) return 'now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`
  return `${Math.floor(diff / 86400_000)}d`
}

export function num(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US')
}

export function compact(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return num(n)
}

export const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** "Top 8%" — only when it flatters; the bottom half, 1st place and tiny rounds just show the rank. */
export function topPercent(rank, total) {
  if (!rank || !total || rank === 1 || total < 10) return null
  const pct = Math.max(1, Math.ceil((rank / total) * 100))
  return pct <= 50 ? `Top ${pct}%` : null
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Good night,'
  if (h < 12) return 'Good morning,'
  if (h < 18) return 'Good afternoon,'
  return 'Good evening,'
}

export const humanize = (s = '') =>
  String(s).replace(/[_-]+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
