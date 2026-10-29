// Social screens (Leagues, Rivalries, Banter, Back a manager) from the backend's community API.
// The data is read-only and simulated (`dataMode: SIMULATED`); joins, new leagues and backings are
// local previews on top. Backends without /leagues yet (older deployments) get the same content
// from the bundled port of CommunityService, so the screens look the same everywhere.
import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ApiError } from '../api/client.js'
import { smartPick } from '../lib/autoPick.js'
import { isSettled } from '../lib/liveDiff.js'
import { TASK_LEAGUE } from '../lib/perks.js'
import { demo } from './demo.js'
import { loadResult, loadRounds, rounds } from './rounds.js'
import { session } from './session.js'

export const community = reactive({ mode: null, mine: [], discover: [], loaded: false, error: null, progress: null })

let source = null
let sourceUser = null

async function localSource() {
  const { createCommunity } = await import('../mock/community.js')
  const players = new Map()
  const engine = createCommunity({
    users: session.user ? { [session.user.username]: { displayName: session.user.displayName, avatarUrl: session.user.avatarUrl } } : {},
    fail: (status, code, message) => { throw new ApiError({ status, code, message }) },
    roundOf: (id) => api.round(id),
    autoPick: async (roundId, user) => {
      if (!players.has(roundId)) players.set(roundId, api.players(roundId).then((p) => p.items ?? []))
      const pick = smartPick(await players.get(roundId), { homeCountryId: user.countryId })
      return { starters: pick?.starters ?? [], captainPlayerId: pick?.captainPlayerId ?? null }
    },
    mediaBase: import.meta.env.BASE_URL.replace(/\/$/, ''),
  })
  const me = () => session.user?.id
  return {
    leagues: async (scope) => engine.leagues(me(), scope, 0, 50),
    league: async (id) => engine.detail(id, me()),
    rivalries: async (id) => engine.rivalries(id, me()),
    banter: async (id) => engine.banter(id, me(), 0, 50),
    managers: (roundId, filter) => engine.managers(roundId, me(), filter, 0, 50),
  }
}

/** The backend API when it has /leagues, otherwise the bundled port. */
async function src() {
  if (source && sourceUser === session.username) return source
  sourceUser = session.username
  try {
    await api.leagues('MINE')
    community.mode = 'api'
    source = { leagues: api.leagues, league: api.league, rivalries: api.rivalries, banter: api.banter, managers: api.managers }
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e
    community.mode = 'bundled'
    source = await localSource()
  }
  return source
}

/**
 * The seeded league tables are static, so the rounds you finish on this server are added to your row
 * of the task league (points and wins), and the table is re-ranked. Rewards tasks read this standing.
 */
export function myRoundsTotals() {
  let points = 0
  let wins = 0
  for (const r of rounds.list) {
    const result = rounds.results[r.id]
    if (!isSettled(r.status) || !rounds.teams[r.id] || !result) continue
    points += result.finalScore ?? 0
    if (result.finalRank === 1) wins += 1
  }
  return { points, wins }
}
/** Results of my finished rounds, which feed the task league (they load lazily elsewhere). */
async function loadMyResults() {
  await loadRounds().catch(() => null)
  await Promise.all(rounds.list.filter((r) => isSettled(r.status) && rounds.teams[r.id] && !rounds.results[r.id]).map((r) => loadResult(r.id).catch(() => null)))
}
function withMyRounds(detail) {
  if (detail?.league?.slug !== TASK_LEAGUE.slug) return detail
  const { points, wins } = myRoundsTotals()
  if (!points && !wins) return detail
  const members = detail.members
    .map((m) => (m.profile.isYou ? { ...m, score: m.score + points, wins: m.wins + wins } : m))
    .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id))
  members.forEach((m, i) => (m.rank = i > 0 && members[i - 1].score === m.score ? members[i - 1].rank : i + 1))
  const me = members.find((m) => m.profile.isYou)
  return { ...detail, league: { ...detail.league, myRank: me?.rank ?? detail.league.myRank }, members }
}

/** Your standing in the task league (rank, score, wins, who is ahead) for the Rewards tasks. */
export async function loadTaskProgress() {
  try {
    const s = await src()
    const card = (await s.leagues('ALL')).items.find((l) => l.slug === TASK_LEAGUE.slug)
    if (!card) return (community.progress = null)
    await loadMyResults()
    const { members, league } = withMyRounds(await s.league(card.id))
    const me = members.find((m) => m.profile.isYou)
    const ahead = me && me.rank > 1 ? members.slice(0, members.indexOf(me)).reverse().find((m) => m.rank < me.rank) : null
    community.progress = me
      ? { leagueId: league.id, name: league.name, member: true, rank: me.rank, score: me.score, wins: me.wins, size: members.length, ahead: ahead ? { name: ahead.profile.displayName, score: ahead.score } : null }
      : { leagueId: league.id, name: league.name, member: false }
  } catch {
    community.progress = null
  }
  return community.progress
}

const localLeague = (id) => demo.localLeagues?.find((l) => l.id === id) ?? null

export async function loadLeagues() {
  try {
    const s = await src()
    const [mine, discover] = await Promise.all([s.leagues('MINE'), s.leagues('DISCOVER')])
    const joined = new Set(demo.joinedCreators ?? [])
    const previewJoined = discover.items.filter((l) => joined.has(l.id)).map((l) => ({ ...l, joined: true, myRank: l.memberCount + 1, memberCount: l.memberCount + 1, preview: true }))
    const progress = await loadTaskProgress()
    const items = mine.items.map((l) => (l.slug === TASK_LEAGUE.slug && progress?.rank ? { ...l, myRank: progress.rank } : l))
    community.mine = [...(demo.localLeagues ?? []), ...items, ...previewJoined]
    community.discover = discover.items.filter((l) => !joined.has(l.id))
    community.loaded = true
    community.error = null
  } catch (e) {
    community.error = e
  }
  return community.mine
}

export async function leagueDetail(id) {
  const local = localLeague(id)
  if (local) return { dataMode: 'LOCAL', readOnly: false, league: local, members: local.members }
  const detail = await (await src()).league(id)
  if (detail?.league?.slug === TASK_LEAGUE.slug) await loadMyResults()
  return withMyRounds(detail)
}
export async function leagueRivalries(id) {
  if (localLeague(id)) return { items: [], challenges: [] }
  return (await src()).rivalries(id)
}
export async function leagueBanter(id) {
  if (localLeague(id)) return { messages: { items: [] }, quickMessages: [] }
  return (await src()).banter(id)
}
export async function backingManagers(roundId, filter) {
  return (await src()).managers(roundId, filter)
}
/** Creator leagues are addressed by slug (/leagues/creator/mr-pundit). */
export async function leagueBySlug(slug) {
  const all = await (await src()).leagues('ALL')
  return all.items.find((l) => l.slug === slug) ?? null
}

export function resetCommunity() {
  source = null
  Object.assign(community, { mode: null, mine: [], discover: [], loaded: false, error: null, progress: null })
}
