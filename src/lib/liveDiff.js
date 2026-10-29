// Turns consecutive live snapshots into "tactical alerts" (design screen 4.1):
// points events, sub moments, substitution activation, lock reminders and full-time recaps.
// Shared by the app (in-app toasts / local notifications) and server/push-relay.mjs (Web Push),
// so it must stay free of browser APIs.
import { shortName } from './players.js'

export const ALERT_PREF = {
  points: 'tactical',
  sub_moment: 'tactical',
  sub_active: 'tactical',
  kickoff: 'tactical',
  halftime: 'tactical',
  twist: 'tactical',
  rank: 'tactical',
  lock: 'lock',
  result: 'recaps',
}

const PRIMARY = ['GOAL', 'ASSIST', 'RED_CARD', 'YELLOW_CARD', 'OWN_GOAL', 'APPEARANCE']

/**
 * Maps a score component to a stable kind. The backend emits BASE (event type in `explanation`),
 * LATE_GOAL_BONUS, CAPTAIN_BONUS and HOME_HERO_BONUS; other spellings are tolerated too.
 */
export function componentKind(component = '', explanation = '') {
  const c = String(component).toUpperCase()
  if (c === 'BASE' || c === '') return explanation ? componentKind(explanation) : 'OTHER'
  if (c.includes('OWN')) return 'OWN_GOAL'
  if (c.includes('YELLOW')) return 'YELLOW_CARD'
  if (/(^|_)RED($|_)/.test(c)) return 'RED_CARD'
  if (c.includes('ASSIST')) return 'ASSIST'
  if (c.includes('APPEAR')) return 'APPEARANCE'
  if (c.includes('HOME')) return 'HOME_HERO'
  if (c.includes('CAPTAIN')) return 'CAPTAIN'
  if (c.includes('LATE') || c.includes('TWIST') || c.includes('MULTIPL')) return 'TWIST'
  if (c.includes('GOAL')) return 'GOAL'
  return c
}

export const lineKind = (line) => componentKind(line?.component, line?.explanation)

/** Short human label for a bonus line: "Late goal ×2", "Captain ×2", "Home Hero +2". */
export function modifierLabel(line, rules) {
  switch (lineKind(line)) {
    case 'TWIST':
      return String(rules?.twist?.type ?? 'LATE').toUpperCase().includes('LATE') ? `Late goal ×${rules?.twist?.multiplier ?? 2}` : `Twist ×${rules?.twist?.multiplier ?? 2}`
    case 'CAPTAIN':
      return `Captain ×${rules?.captainMultiplier ?? 2}`
    case 'HOME_HERO':
      return `Home Hero +${line.points}`
    default:
      return line.explanation || String(line.component ?? '')
  }
}

export const lineKey = (l) => `${l.eventId ?? `${l.playerId}:${l.matchMinute}`}:${l.component}`

/** Groups score lines into match events: one entry per real-world event with all its modifiers. */
export function groupEvents(lines = []) {
  const groups = new Map()
  for (const line of lines) {
    const kind = lineKind(line)
    const key = line.eventId ?? `${line.playerId}:${line.matchMinute}:${PRIMARY.includes(kind) ? kind : 'MOD'}`
    let g = groups.get(key)
    if (!g) {
      g = { key, playerId: line.playerId, matchMinute: line.matchMinute, occurredAt: line.occurredAt, kind: null, points: 0, lines: [] }
      groups.set(key, g)
    }
    g.lines.push(line)
    g.points += line.points ?? 0
    if (PRIMARY.includes(kind) && (!g.kind || PRIMARY.indexOf(kind) < PRIMARY.indexOf(g.kind))) g.kind = kind
  }
  for (const g of groups.values()) {
    g.kind ??= lineKind(g.lines[0])
    g.modifiers = g.lines.filter((l) => !PRIMARY.includes(lineKind(l)))
  }
  return [...groups.values()].sort((a, b) => (a.matchMinute ?? 0) - (b.matchMinute ?? 0))
}

export function teamPlayers(team) {
  const map = new Map()
  for (const s of team?.starters ?? []) if (s?.player) map.set(s.player.id, s.player)
  if (team?.bench?.player) map.set(team.bench.player.id, team.bench.player)
  return map
}

const roundUrl = (roundId, page) => `/rounds/${roundId}/${page}`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const signedPts = (n) => `${n >= 0 ? '+' : ''}${n} pts`

function subWindowOpen(round, now) {
  if (!round?.subWindowOpensAt || !round?.subWindowClosesAt) return true
  return now >= Date.parse(round.subWindowOpensAt) && now < Date.parse(round.subWindowClosesAt)
}

function nameList(names, max = 3) {
  const unique = [...new Set(names)]
  return unique.length <= max ? unique.join(', ') : `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`
}

/**
 * Alerts for what changed between two snapshots. Events that land in the same snapshot are
 * grouped into one alert (the simulator scores for every player at once), and the sub moment
 * is sent once per round, so the lock screen never gets a burst.
 * @param prev {{round, team, timeline, minute?, leaderboard?}} | null  previous state (null = baseline, no alerts)
 * @param next {{round, team, timeline, result, minute?, leaderboard?}}  minute/leaderboard drive the
 *   match-flow alerts (kick-off, half-time, twist, rank) when the stream provides a clock
 */
export function diffLive(prev, next, now = Date.now()) {
  if (!prev?.team || !next?.team) return []
  const alerts = []
  const { round, team } = next
  const rules = round?.rules
  const roundId = team.roundId ?? round?.id
  const players = new Map([...teamPlayers(prev.team), ...teamPlayers(team)])
  const starterIds = new Set((team.starters ?? []).map((s) => s.player?.id))
  const name = (id) => shortName(players.get(id)?.name ?? 'Your player')
  const rankText = team.rank ? ` You're #${team.rank}.` : ''

  // 1. New score lines → points events and sub moments.
  if (prev.timeline && next.timeline) {
    const seen = new Set(prev.timeline.map(lineKey))
    const events = groupEvents(next.timeline.filter((l) => !seen.has(lineKey(l))))
    const scoring = events.filter((e) => e.kind === 'GOAL' || e.kind === 'ASSIST')
    const cards = events.filter((e) => (e.kind === 'YELLOW_CARD' || e.kind === 'RED_CARD') && starterIds.has(e.playerId))
    const mods = (list) => [...new Set(list.flatMap((e) => e.modifiers.map((m) => modifierLabel(m, rules))))]

    if (scoring.length === 1) {
      const [ev] = scoring
      const verb = ev.kind === 'GOAL' ? 'scored' : 'assisted'
      const labels = mods(scoring)
      alerts.push({
        id: `pts:${ev.key}`,
        type: 'points',
        title: `${signedPts(ev.points)} · ${name(ev.playerId)} ${verb}!`,
        body: `${labels.length ? `${labels.join(' · ')}.` : `${ev.matchMinute ?? ''}' ${ev.kind === 'GOAL' ? 'goal' : 'assist'}.`}${rankText}`,
        tag: `pts-${roundId}`,
        url: roundUrl(roundId, 'live'),
      })
    } else if (scoring.length > 1) {
      const goals = scoring.filter((e) => e.kind === 'GOAL')
      const assists = scoring.filter((e) => e.kind === 'ASSIST')
      const what = [goals.length && plural(goals.length, 'goal'), assists.length && plural(assists.length, 'assist')].filter(Boolean).join(' and ')
      const labels = mods(scoring)
      alerts.push({
        id: `pts:${scoring[0].key}`,
        type: 'points',
        title: `${signedPts(scoring.reduce((s, e) => s + e.points, 0))} · ${what} for your five`,
        body: `${nameList(scoring.map((e) => name(e.playerId)))}.${labels.length ? ` ${labels.join(' · ')}.` : ''}${rankText}`,
        tag: `pts-${roundId}`,
        url: roundUrl(roundId, 'live'),
      })
    }

    if (cards.length) {
      const bench = team.bench?.player
      const canSub = (team.subsRemaining ?? 0) > 0 && !team.pendingSubstitution && bench && subWindowOpen(round, now)
      const red = cards.some((e) => e.kind === 'RED_CARD')
      const who = nameList(cards.map((e) => name(e.playerId)))
      if (canSub) {
        alerts.push({
          id: `sub:${roundId}`,
          type: 'sub_moment',
          title: 'Sub moment ⚡',
          body: `${cards.length === 1 ? `${who} ${red ? 'was sent off' : 'was booked and may come off'}` : `${who} were booked`}. ${shortName(bench.name)} is on your bench — swap now?`,
          tag: `sub-${roundId}`,
          url: roundUrl(roundId, 'live?sub=1'),
          requireInteraction: true,
        })
      } else {
        alerts.push({
          id: `card:${cards[0].key}`,
          type: 'points',
          title: `${signedPts(cards.reduce((s, e) => s + e.points, 0))} · ${cards.length === 1 ? `${who} ${red ? 'sent off' : 'booked'}` : plural(cards.length, 'booking')}`,
          body: `${cards.length === 1 ? `${cards[0].matchMinute ?? ''}' card.` : `${who}.`}${rankText}`,
          tag: `pts-${roundId}`,
          url: roundUrl(roundId, 'live'),
        })
      }
    }
  }

  // 2. Match flow: kick-off, half-time, the twist window, big moves in the table.
  if (isOpen(prev.round?.status) && isLive(round?.status)) {
    const captain = team.starters?.find((s) => s.player?.id === team.captainPlayerId)?.player
    alerts.push({
      id: `kickoff:${roundId}`,
      type: 'kickoff',
      title: 'Kick-off! Your five is live ⚽',
      body: `${round.name}: squads are locked${captain ? `, ${shortName(captain.name)} wears the armband` : ''}. Your one sub is ready on the bench.`,
      tag: `flow-${roundId}`,
      url: roundUrl(roundId, 'live'),
    })
  }
  const was = prev.minute
  const min = next.minute
  if (was != null && min != null && isLive(round?.status)) {
    if (was < 45 && min >= 45 && min < 90) {
      alerts.push({
        id: `ht:${roundId}`,
        type: 'halftime',
        title: `Half-time · ${team.score ?? 0} pts`,
        body: `${team.rank ? `You're #${team.rank}. ` : ''}${(team.subsRemaining ?? 0) > 0 ? 'Your sub is still unused — the second half decides it.' : 'Second half coming up.'}`,
        tag: `flow-${roundId}`,
        url: roundUrl(roundId, 'live'),
      })
    }
    const from = rules?.twist?.fromMatchMinute
    if (from != null && was < from && min >= from && min < 90) {
      alerts.push({
        id: `twist:${roundId}`,
        type: 'twist',
        title: `${from}' · Goals now count ×${rules.twist.multiplier ?? 2} 🔥`,
        body: `The late-goal twist is on until full time.${(team.subsRemaining ?? 0) > 0 && team.bench?.player ? ` Last call to bring ${shortName(team.bench.player.name)} on.` : ''}`,
        tag: `flow-${roundId}`,
        url: roundUrl(roundId, (team.subsRemaining ?? 0) > 0 ? 'live?sub=1' : 'live'),
      })
    }
  }
  const before = prev.team.rank
  const after = team.rank
  // Everyone shares 1st at 0 pts before the first event, so only moves once points are on the board.
  if (before && after && before !== after && isLive(round?.status) && (prev.team.score ?? 0) > 0) {
    const board = next.leaderboard ?? []
    const above = board.find((e) => e.rank === after - 1 && e.teamId !== team.id)
    const passer = board.find((e) => e.rank < after && (prev.leaderboard ?? []).find((p) => p.teamId === e.teamId)?.rank > before)
    if (after < before && after <= 3) {
      alerts.push({
        id: `rank:${roundId}:${after}:${team.score}`,
        type: 'rank',
        title: after === 1 ? `You're top of the table! 🏆 ${team.score} pts` : `Up to #${after} ▲`,
        body: after === 1 ? 'Hold on to it until full time.' : above ? `${above.displayName} is next at ${above.score} pts.` : 'Keep climbing.',
        tag: `rank-${roundId}`,
        url: roundUrl(roundId, 'standings'),
      })
    } else if (before === 1 && after > 1) {
      alerts.push({
        id: `rank:${roundId}:${after}:${team.score}`,
        type: 'rank',
        title: `Knocked off the top · #${after}`,
        body: `${passer ? `${passer.displayName} overtook you with ${passer.score} pts.` : 'Someone overtook you.'}${(team.subsRemaining ?? 0) > 0 ? ' Time for your sub?' : ''}`,
        tag: `rank-${roundId}`,
        url: roundUrl(roundId, 'standings'),
      })
    }
  }

  // 3. Pending substitution became active.
  const pending = prev.team.pendingSubstitution
  if (pending && !team.pendingSubstitution && starterIds.has(pending.incomingPlayerId)) {
    alerts.push({
      id: `subon:${roundId}`,
      type: 'sub_active',
      title: `${name(pending.incomingPlayerId)} is on ⚡`,
      body: `${name(pending.outgoingPlayerId)} came off. ${name(pending.incomingPlayerId)} scores from now on.`,
      tag: `sub-${roundId}`,
      url: roundUrl(roundId, 'live'),
    })
  }

  // 4. Full time.
  const wasSettled = isSettled(prev.round?.status)
  if (!wasSettled && isSettled(round?.status)) {
    const result = next.result
    const score = result?.finalScore ?? team.score
    const rank = result?.finalRank ?? team.rank
    const rp = result?.totalAwardedRp
    alerts.push({
      id: `result:${roundId}`,
      type: 'result',
      title: `Full time · ${score} pts`,
      body: `${rank ? `Rank #${rank}` : 'Round settled'}${rp ? ` · +${rp} RP earned` : ''}. Tap for your recap.`,
      tag: `result-${roundId}`,
      url: roundUrl(roundId, 'result'),
    })
  }
  return alerts.map((a) => ({ ...a, roundId, createdAt: new Date(now).toISOString() }))
}

/** "Squads lock in 30 min" — once per round when the deadline gets close. */
export function lockReminder(round, team, now = Date.now(), withinMinutes = 30) {
  if (!round || !isOpen(round.status) || !round.entryDeadline) return null
  const left = Date.parse(round.entryDeadline) - now
  if (left <= 0 || left > withinMinutes * 60_000) return null
  const mins = Math.max(1, Math.round(left / 60_000))
  const captain = team?.starters?.find((s) => s.player?.id === team.captainPlayerId)?.player
  return {
    type: 'lock',
    title: `Squads lock in ${mins} min`,
    body: team
      ? `${round.name}: ${captain ? `${shortName(captain.name)} is your captain. ` : ''}Last chance to tweak your five.`
      : `${round.name} starts soon — build your five before it locks.`,
    tag: `lock-${round.id}`,
    url: team ? `/rounds/${round.id}/build` : `/rounds/${round.id}`,
    roundId: round.id,
    id: `lock:${round.id}`,
    createdAt: new Date(now).toISOString(),
  }
}

export function roundPhase(status = '') {
  const s = String(status).toUpperCase()
  if (['SETTLED', 'COMPLETED', 'FINISHED', 'CLOSED', 'FINAL'].includes(s)) return 'settled'
  if (['LIVE', 'IN_PLAY', 'RUNNING', 'STARTED', 'LOCKED', 'IN_PROGRESS'].includes(s)) return 'live'
  if (['OPEN', 'UPCOMING', 'ENTRY_OPEN'].includes(s)) return 'open'
  return 'scheduled'
}
export const isSettled = (s) => roundPhase(s) === 'settled'
export const isOpen = (s) => roundPhase(s) === 'open'
export const isLive = (s) => roundPhase(s) === 'live'
