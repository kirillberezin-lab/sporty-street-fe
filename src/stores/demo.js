// Features from the design that the backend does not implement yet (README: "Intentionally absent:
// leagues, backing managers, missions"). They run on local, per-user demo data so every screen works;
// where possible they use real data (leaderboards for backing, results for missions).
import { reactive, watch } from 'vue'
import { inviteCode, store } from '../lib/util.js'
import { session } from './session.js'

const WEEK = 7 * 86400_000

function seed() {
  return {
    fanPoints: 500,
    weeklyGrantAt: Date.now(),
    backings: [], // { id, roundId, teamId, name, target, rankLimit|null, multiplier, stake, status, payout, createdAt }
    leagues: null, // filled lazily (depends on profile)
    challenges: [], // accepted challenge links: { id, roundId, teamId, name, players, createdAt }
    subs: {}, // roundId -> { outgoingPlayerId, incomingPlayerId, effectiveAt } (TeamSnapshot keeps no sub history)
    claimed: {}, // missionId -> iso
    shares: 0,
    invites: 0,
    streak: { count: 1, last: new Date().toDateString() },
    breakUntil: null,
    timeReminder: true,
  }
}

export const demo = reactive(seed())
let stopWatch = null

export function loadDemo() {
  stopWatch?.()
  Object.assign(demo, seed(), store.get(`demo:${session.username}`, {}))
  touchStreak()
  if (Date.now() - demo.weeklyGrantAt > WEEK) {
    demo.fanPoints += 100
    demo.weeklyGrantAt = Date.now()
  }
  if (!demo.leagues) demo.leagues = seedLeagues()
  stopWatch = watch(demo, (v) => store.set(`demo:${session.username}`, v), { deep: true })
}

function touchStreak() {
  const today = new Date().toDateString()
  if (demo.streak.last === today) return
  const yesterday = new Date(Date.now() - 86400_000).toDateString()
  demo.streak = { count: demo.streak.last === yesterday ? demo.streak.count + 1 : 1, last: today }
}

// ---------- leagues (design 6.x) ----------
const FRIENDS = [
  ['Ada FC', '#7C3AED', 1284, 6], ['Tunde XI', '#0F766E', 1190, 3], ['Folake United', '#DB2777', 1104, 1],
  ["Emeka's Eagles", '#CA8A04', 1032, 1], ['Bolu Bros', '#2563EB', 987, 0], ['Kemi Kickers', '#B45309', 951, 1],
  ['Zainab Strikers', '#0E7490', 903, 0], ['Ikenna FC', '#475569', 880, 0], ['Sade Squad', '#9333EA', 842, 0],
  ['Musa Masters', '#15803D', 815, 0], ['Uche United', '#BE123C', 760, 0],
]

export const CREATORS = [
  { id: 'mr-pundit', name: 'Mr. Pundit', initials: 'MP', bg: 'linear-gradient(135deg,#F59E0B,#DC2626)', fans: 124000, bio: 'Football analyst · 1.2M followers',
    take: 'Late goals ×2? I want finishers who play 90 minutes. Kane is my captain, Gavi my sub-bait.', five: ['Mohamed Salah', 'Harry Kane', 'Pedri', 'Rúben Dias', 'Alisson Becker'] },
  { id: 'kay-football', name: 'Kay Football', initials: 'KF', bg: 'linear-gradient(135deg,#10B981,#065F46)', fans: 88000, bio: 'Tactics breakdowns · 640k followers',
    take: 'Captain the striker with the latest kick-off. Free information is the best edge.', five: ['Kylian Mbappé', 'Jude Bellingham', 'Lamine Yamal', 'Virgil van Dijk', 'Manuel Neuer'] },
  { id: 'samba-tactics', name: 'Samba Tactics', initials: 'ST', bg: 'linear-gradient(135deg,#6366F1,#312E81)', fans: 52000, bio: 'Brazilians in Europe, every weekend',
    take: 'Home Hero first, then build around him. Vinícius as captain + a late goal = 22-point ceiling.', five: ['Vinícius Júnior', 'Erling Haaland', 'Kevin De Bruyne', 'Achraf Hakimi', 'Gianluigi Donnarumma'] },
  { id: 'abi-ballon', name: 'Abi Ballon', initials: 'AB', bg: 'linear-gradient(135deg,#EC4899,#9D174D)', fans: 31000, bio: 'Women in football · weekly Q&A',
    take: 'Defenders who take set pieces are the cheat code.', five: ['Trent Alexander-Arnold', 'Pedri', 'Luka Modrić', 'Mohamed Salah', 'Thibaut Courtois'] },
]

function seedLeagues() {
  const me = `${session.user?.displayName ?? 'My'}'s Five`
  const friends = [...FRIENDS.slice(0, 1), [me, '#5B3A29', 1262, 4, true], ...FRIENDS.slice(1)]
  const list = [
    { id: 'lagos-ballers', type: 'FRIENDS', name: 'Lagos Ballers', code: 'LAGOS-5K', format: 'Season', rounds: 14, members: friends.map(([name, color, pts, wins, me]) => ({ name, color, pts, wins, me: Boolean(me) })) },
    { id: 'office-five', type: 'WORK', name: 'Office Five · Opennet', code: 'OFFICE-7Q', format: 'Every round', rounds: 0, size: 28, myRank: 7 },
    { id: 'mr-pundit', type: 'CREATOR', name: 'Mr. Pundit League', creatorId: 'mr-pundit', size: 124000, myRank: 14800 },
  ]
  if (session.countryName) list.push({ id: 'national', type: 'NATIONAL', name: `${session.countryName} national`, size: 1900000, myTop: 5 })
  return list
}

export function createLeague({ name, format, roundTypes, milestone, code }) {
  const league = {
    id: `l-${Date.now()}`, type: 'FRIENDS', name, code: code ?? inviteCode(name), format, roundTypes, milestone, rounds: 0,
    members: [{ name: `${session.user?.displayName ?? 'My'}'s Five`, color: '#5B3A29', pts: 0, wins: 0, me: true }],
    createdAt: new Date().toISOString(),
  }
  demo.leagues.unshift(league)
  return league
}

export function joinLeague(code) {
  const clean = code.trim().toUpperCase()
  const existing = demo.leagues.find((l) => l.code === clean)
  if (existing) return { league: existing, already: true }
  const league = createLeague({ name: `${clean.split('-')[0][0]}${clean.split('-')[0].slice(1).toLowerCase()} League`, format: 'Season', code: clean })
  league.members.unshift(...FRIENDS.slice(3, 7).map(([name, color, pts, wins]) => ({ name, color, pts: Math.round(pts / 3), wins })))
  league.members.at(-1).pts = 0
  return { league, already: false }
}

export function joinCreator(creatorId) {
  const c = CREATORS.find((x) => x.id === creatorId)
  if (!c || demo.leagues.some((l) => l.creatorId === creatorId)) return
  demo.leagues.push({ id: c.id, type: 'CREATOR', name: `${c.name} League`, creatorId: c.id, size: c.fans + 1, myRank: c.fans + 1 })
}

// ---------- back a manager (design 7.x) ----------
/** Transparent target + multiplier from the manager's current position. */
export function backingOffer(entry, total) {
  if (!entry || !total) return null
  const pct = entry.rank / total
  if (pct <= 0.34 && total >= 3) return { target: 'Win the round', rankLimit: 1, multiplier: 3 }
  return { target: 'Finish top half', rankLimit: Math.max(1, Math.ceil(total / 2)), multiplier: 2 }
}

export function back({ roundId, entry, offer, stake }) {
  if (stake > demo.fanPoints) throw new Error('Not enough fan points')
  demo.fanPoints -= stake
  const b = { id: `b-${Date.now()}`, roundId, teamId: entry.teamId, name: entry.displayName, ...offer, stake, status: 'open', payout: 0, createdAt: new Date().toISOString() }
  demo.backings.unshift(b)
  return b
}

/** Called with final standings once a round is settled. */
export function resolveBackings(roundId, standings) {
  for (const b of demo.backings) {
    if (b.roundId !== roundId || b.status !== 'open') continue
    const entry = standings.find((e) => e.teamId === b.teamId)
    if (!entry) continue
    const hit = entry.rank <= b.rankLimit
    b.status = hit ? 'won' : 'lost'
    b.finalRank = entry.rank
    b.payout = hit ? b.stake * b.multiplier : 0
    if (hit) demo.fanPoints += b.payout
  }
}

// ---------- challenges / rivalries (design 3.6, 6.2) ----------
export function saveChallenge(ch) {
  if (demo.challenges.some((c) => c.roundId === ch.roundId && c.teamId === ch.teamId)) return
  demo.challenges.unshift({ ...ch, createdAt: new Date().toISOString() })
}

export const recordShare = () => (demo.shares += 1)
export const recordInvite = () => (demo.invites += 1)

export function claim(missionId) {
  demo.claimed[missionId] = new Date().toISOString()
}
