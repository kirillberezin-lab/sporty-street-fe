// Explains a settled round in plain words (design 5.1 / 5.2) from the Breakdown schema.
import { groupEvents, lineKind } from './liveDiff.js'
import { shortName } from './players.js'

const VERB = { GOAL: 'goal', ASSIST: 'assist', YELLOW_CARD: 'yellow', RED_CARD: 'red', OWN_GOAL: 'own goal', APPEARANCE: 'played' }

export function playersMap(team) {
  const map = new Map()
  for (const s of team?.starters ?? []) map.set(s.player.id, s.player)
  if (team?.bench) map.set(team.bench.player.id, team.bench.player)
  return map
}

/** One row per player: total and a short reason ("goal ×2 late, C ×2"). */
export function playerRows(breakdown, players) {
  return (breakdown?.players ?? [])
    .filter((p) => p.components?.length)
    .map((p) => {
      const events = groupEvents(p.components)
      const parts = []
      const counts = {}
      for (const e of events) if (e.kind !== 'APPEARANCE') counts[e.kind] = (counts[e.kind] ?? 0) + 1
      for (const [k, n] of Object.entries(counts)) parts.push(`${n > 1 ? `${n} ` : ''}${VERB[k] ?? k.toLowerCase()}${n > 1 && k !== 'OWN_GOAL' ? 's' : ''}`)
      const kinds = new Set(p.components.map(lineKind))
      if (kinds.has('TWIST')) parts.push('late ×2')
      if (kinds.has('CAPTAIN')) parts.push('captain')
      if (!parts.length) parts.push('appearance')
      const hero = p.components.filter((c) => lineKind(c) === 'HOME_HERO').reduce((s, c) => s + c.points, 0)
      return { playerId: p.playerId, player: players.get(p.playerId) ?? null, total: p.total - hero, reason: parts.join(', '), captain: kinds.has('CAPTAIN') }
    })
    .sort((a, b) => b.total - a.total)
}

export function sumKind(breakdown, kind) {
  return (breakdown?.timeline ?? []).filter((l) => lineKind(l) === kind).reduce((s, l) => s + l.points, 0)
}

/** Points of a player from a given time on (sub impact). */
export function pointsAfter(breakdown, playerId, iso) {
  const t = Date.parse(iso ?? 0)
  return (breakdown?.timeline ?? []).filter((l) => l.playerId === playerId && Date.parse(l.occurredAt) >= t).reduce((s, l) => s + l.points, 0)
}

/** Cumulative score in 10-minute buckets for the points timeline chart. */
export function timelineBuckets(breakdown, buckets = 9) {
  const out = Array.from({ length: buckets }, (_, i) => ({ from: i * 10, to: i * 10 + 10, points: 0, cumulative: 0, kinds: new Set() }))
  for (const l of breakdown?.timeline ?? []) {
    const b = out[Math.min(buckets - 1, Math.max(0, Math.floor((l.matchMinute ?? 0) / 10)))]
    b.points += l.points
    b.kinds.add(lineKind(l))
  }
  let acc = 0
  for (const b of out) {
    acc += b.points
    b.cumulative = acc
  }
  return out
}

export function story({ result, breakdown, players, sub, rows, total }) {
  const lines = []
  const top = rows[0]
  if (top?.player) lines.push(`${shortName(top.player.name)} led your five with ${top.total} pts.`)
  const late = sumKind(breakdown, 'TWIST')
  if (late > 0) lines.push(`The late-goals twist paid off: +${late} from goals after the 75th minute.`)
  const cap = sumKind(breakdown, 'CAPTAIN')
  if (cap > 0) lines.push(`Your captain's ×2 added +${cap}.`)
  const hero = sumKind(breakdown, 'HOME_HERO')
  if (hero > 0) lines.push(`Your Home Hero chipped in +${hero} on top.`)
  if (sub?.incomingPlayerId) {
    const gained = pointsAfter(breakdown, sub.incomingPlayerId, sub.effectiveAt)
    const incoming = shortName(players.get(sub.incomingPlayerId)?.name ?? 'your sub')
    lines.push(gained === 0 ? `${incoming} came on but the match ran out before he could score.` : `Bringing on ${incoming} earned ${gained > 0 ? '+' : ''}${gained} after the swap.`)
  }
  if (result?.finalRank) lines.push(`You finished #${result.finalRank}${total ? ` of ${total}` : ''}.`)
  return lines.join(' ')
}

export function badges({ result, breakdown, sub }) {
  const out = []
  if (sub?.incomingPlayerId && pointsAfter(breakdown, sub.incomingPlayerId, sub.effectiveAt) >= 3) out.push({ icon: '⚡', title: 'Super Sub', text: 'Your substitute delivered after coming on' })
  if (sumKind(breakdown, 'HOME_HERO') > 0) out.push({ icon: '★', title: 'Patriot', text: 'Your Home Hero scored or assisted' })
  if (sumKind(breakdown, 'TWIST') > 0) out.push({ icon: '⏱', title: 'Late Show', text: 'A goal after 75\' doubled' })
  if (result?.finalRank === 1) out.push({ icon: '👑', title: 'Round Winner', text: 'Top of the table at full time' })
  return out
}
