// Social screens (Leagues, Rivalries, Banter, Back a manager) from the backend's community API.
// The data is read-only and simulated (`dataMode: SIMULATED`); joins, new leagues and backings are
// local previews on top. Backends without /leagues yet (older deployments) get the same content
// from the bundled port of CommunityService, so the screens look the same everywhere.
import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ApiError } from '../api/client.js'
import { smartPick } from '../lib/autoPick.js'
import { demo } from './demo.js'
import { session } from './session.js'

export const community = reactive({ mode: null, mine: [], discover: [], loaded: false, error: null })

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

const localLeague = (id) => demo.localLeagues?.find((l) => l.id === id) ?? null

export async function loadLeagues() {
  try {
    const s = await src()
    const [mine, discover] = await Promise.all([s.leagues('MINE'), s.leagues('DISCOVER')])
    const joined = new Set(demo.joinedCreators ?? [])
    const previewJoined = discover.items.filter((l) => joined.has(l.id)).map((l) => ({ ...l, joined: true, myRank: l.memberCount + 1, memberCount: l.memberCount + 1, preview: true }))
    community.mine = [...(demo.localLeagues ?? []), ...mine.items, ...previewJoined]
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
  return (await src()).league(id)
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
  Object.assign(community, { mode: null, mine: [], discover: [], loaded: false, error: null })
}
