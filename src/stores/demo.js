// Actions the backend does not implement (its community API is read-only): creating/joining leagues,
// backing managers with fan points, missions, challenges. They run on local, per-user demo data on top
// of the server's content (stores/community.js); results come from real rounds where possible.
import { reactive, watch } from 'vue'
import { inviteCode, store } from '../lib/util.js'
import { session } from './session.js'

const WEEK = 7 * 86400_000

function seed() {
  return {
    fanPoints: 500,
    weeklyGrantAt: Date.now(),
    backings: [], // { id, roundId, teamId, name, target, rankLimit|null, multiplier, stake, status, payout, createdAt }
    localLeagues: [], // created or joined by code on this device, in the API's LeagueCard shape
    joinedCreators: [], // creator league ids joined as a preview
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
  stopWatch = watch(demo, (v) => store.set(`demo:${session.username}`, v), { deep: true })
}

function touchStreak() {
  const today = new Date().toDateString()
  if (demo.streak.last === today) return
  const yesterday = new Date(Date.now() - 86400_000).toDateString()
  demo.streak = { count: demo.streak.last === yesterday ? demo.streak.count + 1 : 1, last: today }
}

// ---------- leagues (design 6.x) ----------
// Creator extras the API does not carry (bio line, the take, the five to copy), keyed by league slug.
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

function me(score = 0) {
  const u = session.user
  return { profile: { id: u?.id ?? 'me', displayName: u?.displayName ?? 'You', teamName: `${u?.displayName ?? 'My'}'s Five`, avatarUrl: u?.avatarUrl ?? null, creator: false, fans: 0, isYou: true }, rank: 1, score, wins: 0 }
}
function localCard({ name, format = 'SEASON', code, members }) {
  members.sort((a, b) => b.score - a.score).forEach((m, i) => (m.rank = i + 1))
  return {
    id: `local-${Date.now()}`, slug: null, name, type: 'FRIENDS', format, inviteCode: code ?? inviteCode(name), imageUrl: null, avatarUrl: null,
    creator: null, description: 'Created on this device', memberCount: members.length, joined: true, myRank: members.find((m) => m.profile.isYou).rank,
    seasonRounds: format === 'SEASON' ? 14 : 0, roundsRemaining: format === 'SEASON' ? 14 : 0, memberPreview: members.slice(0, 4).map((m) => m.profile),
    members, local: true, createdAt: new Date().toISOString(),
  }
}

export function createLeague({ name, format, code }) {
  const league = localCard({ name, format: /round/i.test(format ?? '') ? 'ROUND' : 'SEASON', code, members: [me()] })
  demo.localLeagues.unshift(league)
  return league
}

/** Server leagues are read-only, so a code joins a local preview league. */
export function joinLeague(code, known = []) {
  const clean = code.trim().toUpperCase()
  const existing = [...demo.localLeagues, ...known].find((l) => l.inviteCode === clean)
  if (existing) return { league: existing, already: true }
  const friends = ['Ada', 'Tunde', 'Folake', 'Emeka'].map((n, i) => ({ profile: { id: `f${i}`, displayName: n, teamName: `${n} FC`, avatarUrl: null, creator: false, fans: 0, isYou: false }, rank: 0, score: 120 - i * 25, wins: 2 - Math.min(i, 2) }))
  const league = localCard({ name: `${clean.split('-')[0][0]}${clean.split('-')[0].slice(1).toLowerCase()} League`, code: clean, members: [...friends, me()] })
  demo.localLeagues.unshift(league)
  return { league, already: false }
}

export function joinCreator(leagueId) {
  if (!demo.joinedCreators.includes(leagueId)) demo.joinedCreators.push(leagueId)
}

// ---------- back a manager (design 7.x) ----------
// Targets and multipliers come from the API's manager cards; fan points and backings are local.
export const TARGETS = {
  TOP_HALF: { label: 'Finish top half', share: 0.5 },
  TOP_25_PERCENT: { label: 'Finish top 25%', share: 0.25 },
  TOP_10_PERCENT: { label: 'Finish top 10%', share: 0.1 },
}
export const targetLabel = (t) => TARGETS[t]?.label ?? String(t ?? '').replace(/_/g, ' ').toLowerCase()

export function back({ roundId, manager, stake }) {
  if (stake > demo.fanPoints) throw new Error('Not enough fan points')
  demo.fanPoints -= stake
  const p = manager.profile
  const b = { id: `b-${Date.now()}`, roundId, profileId: p.id, name: p.displayName, avatarUrl: p.avatarUrl, target: manager.target, multiplier: manager.multiplier, stake, status: 'open', payout: 0, createdAt: new Date().toISOString() }
  demo.backings.unshift(b)
  return b
}

function seeded(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/**
 * Called with final standings once a round is settled. Managers who are real players in the round
 * settle on their real rank; community profiles without a squad get a seeded simulated outcome.
 */
export function resolveBackings(roundId, standings) {
  const total = standings.length
  for (const b of demo.backings) {
    if (b.roundId !== roundId || b.status !== 'open') continue
    const share = TARGETS[b.target]?.share ?? 0.5
    const entry = standings.find((e) => e.displayName === b.name)
    const hit = entry && total ? entry.rank <= Math.max(1, Math.ceil(total * share)) : seeded(`${roundId}:${b.profileId}`) < share
    b.status = hit ? 'won' : 'lost'
    b.finalRank = entry?.rank ?? null
    b.simulated = !entry
    b.payout = hit ? Math.round(b.stake * b.multiplier) : 0
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
