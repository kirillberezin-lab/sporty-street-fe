// Player helpers shared by the UI and the Node push relay (no browser APIs here).

const PARTICLES = new Set(['van', 'von', 'de', 'da', 'del', 'di', 'ter', 'den', 'der', 'dos', 'el', 'al', 'le', 'la', 'mac', 'mc'])
// Players known by another part of their name than the last one.
const KNOWN_AS = { 'Alisson Becker': 'Alisson', 'Bernardo Silva': 'Bernardo', 'Kim Min-jae': 'Kim' }
const SUFFIXES = new Set(['júnior', 'junior', 'jr', 'jr.', 'filho', 'neto'])

/** "Virgil van Dijk" → "Van Dijk", "Vinícius Júnior" → "Vinícius", "Pedri" → "Pedri". */
export function shortName(name = '') {
  if (KNOWN_AS[name]) return KNOWN_AS[name]
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ''
  const last = parts.at(-1)
  if (SUFFIXES.has(last.toLowerCase())) return parts[0]
  const prev = parts.at(-2)
  if (PARTICLES.has(prev.toLowerCase())) return `${prev[0].toUpperCase()}${prev.slice(1)} ${last}`
  return last
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase()
}

const POSITION_ORDER = ['FW', 'MF', 'DF', 'GK']
export const POSITIONS = ['GK', 'DF', 'MF', 'FW']
export const POSITION_NAMES = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' }

/** Normalises any backend spelling (GOALKEEPER, Defender, ST...) to GK/DF/MF/FW. */
export function positionCode(position = '') {
  const p = String(position).toUpperCase()
  if (p.startsWith('G')) return 'GK'
  if (p.startsWith('D') || p === 'CB' || p === 'LB' || p === 'RB') return 'DF'
  if (p.startsWith('M') || p === 'CM' || p === 'AM' || p === 'DM') return 'MF'
  if (p.startsWith('F') || p.startsWith('A') || p.startsWith('S') || p === 'W' || p === 'CF') return 'FW'
  return p.slice(0, 2) || '—'
}

export function byPosition(a, b) {
  return POSITION_ORDER.indexOf(positionCode(a.position)) - POSITION_ORDER.indexOf(positionCode(b.position))
}

const CLUB_COLORS = {
  liverpool: '#C8102E', arsenal: '#EF0107', barcelona: '#A50044', 'fc barcelona': '#A50044', sevilla: '#D71920', 'real madrid': '#1D3557',
  villarreal: '#C9A800', galatasaray: '#A90432', 'fenerbahçe': '#163E7A', fenerbahce: '#163E7A',
  'manchester city': '#4E9ED8', 'manchester united': '#DA291C', fulham: '#2B2B2B', brentford: '#E30613',
  chelsea: '#034694', tottenham: '#132257', 'bayern munich': '#DC052D', juventus: '#1B1B1B',
  'inter milan': '#0068A8', 'ac milan': '#FB090B', psg: '#004170', 'paris saint-germain': '#004170',
  'atlético madrid': '#CB3524', 'borussia dortmund': '#E2B600', napoli: '#12A0D7',
}
const PALETTE = ['#7C3AED', '#0F766E', '#DB2777', '#CA8A04', '#2563EB', '#475569', '#B45309', '#0E7490', '#9333EA', '#15803D']

export function hashColor(key = '') {
  let h = 0
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function clubColor(clubName = '') {
  return CLUB_COLORS[clubName.toLowerCase()] ?? hashColor(clubName)
}

export function clubShort(clubName = '') {
  const known = {
    'fc barcelona': 'BAR', barcelona: 'BAR', liverpool: 'LIV',
    'manchester city': 'MCI', 'manchester united': 'MUN', 'real madrid': 'RMA', 'fenerbahçe': 'FEN',
    'atlético madrid': 'ATM', 'paris saint-germain': 'PSG', 'bayern munich': 'BAY', 'borussia dortmund': 'BVB',
  }
  const k = clubName.toLowerCase()
  if (known[k]) return known[k]
  const words = clubName.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.map((w) => w[0]).join('') : clubName).slice(0, 3).toUpperCase()
}
