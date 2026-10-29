// Challenge links: friends who open them land on the same round with the challenger's five
// (design 3.6). The backend has no challenges endpoint, so the link carries everything needed:
// round, team (to find the challenger on the leaderboard) and the five player ids, packed in
// ~170 url-safe characters.
const VERSION = 1

const hexToBytes = (uuid) => Uint8Array.from((uuid ?? '').replace(/-/g, '').padEnd(32, '0').match(/../g), (h) => parseInt(h, 16))
const bytesToUuid = (b) => {
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  if (/^0+$/.test(h)) return null
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))

export function encodeChallenge({ roundId, teamId, playerIds = [], captainId, heroId, name = '' }) {
  const ids = playerIds.slice(0, 15)
  const nameBytes = new TextEncoder().encode(name.slice(0, 24))
  const out = new Uint8Array(1 + 16 + 16 + 2 + ids.length * 16 + nameBytes.length)
  let o = 0
  out[o++] = VERSION
  out.set(hexToBytes(roundId), o); o += 16
  out.set(hexToBytes(teamId), o); o += 16
  const ci = ids.indexOf(captainId)
  const hi = ids.indexOf(heroId)
  out[o++] = ((ci < 0 ? 15 : ci) << 4) | (hi < 0 ? 15 : hi)
  out[o++] = ids.length
  for (const id of ids) { out.set(hexToBytes(id), o); o += 16 }
  out.set(nameBytes, o)
  return toB64url(out)
}

export function decodeChallenge(code) {
  try {
    const b = fromB64url(code)
    if (b[0] !== VERSION) return null
    let o = 1
    const roundId = bytesToUuid(b.slice(o, o + 16)); o += 16
    const teamId = bytesToUuid(b.slice(o, o + 16)); o += 16
    const ci = b[o] >> 4
    const hi = b[o++] & 15
    const n = b[o++]
    const playerIds = []
    for (let i = 0; i < n; i++) { playerIds.push(bytesToUuid(b.slice(o, o + 16))); o += 16 }
    const name = new TextDecoder().decode(b.slice(o))
    return { roundId, teamId, playerIds, captainId: playerIds[ci] ?? null, heroId: playerIds[hi] ?? null, name }
  } catch {
    return null
  }
}

export const challengeUrl = (code) => `${location.origin}/c/${code}`
