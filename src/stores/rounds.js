import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ApiError } from '../api/client.js'
import { roundPhase } from '../lib/liveDiff.js'
import { session } from './session.js'

export const rounds = reactive({
  list: [],
  loaded: false,
  loading: false,
  error: null,
  byId: {},
  teams: {}, // roundId -> TeamSnapshot | null (null = no team)
  results: {}, // roundId -> Result | null
  participants: {}, // roundId -> number
})

export const phaseOf = (round) => roundPhase(round?.status)

const PHASE_ORDER = { live: 0, open: 1, scheduled: 2, settled: 3 }
function sortRounds(list) {
  return [...list].sort((a, b) => {
    const pa = PHASE_ORDER[phaseOf(a)]
    const pb = PHASE_ORDER[phaseOf(b)]
    if (pa !== pb) return pa - pb
    const da = Date.parse(a.entryDeadline ?? 0)
    const db = Date.parse(b.entryDeadline ?? 0)
    return pa === 3 ? db - da : da - db
  })
}

const notFound = (e) => e instanceof ApiError && e.status === 404
// /result answers 422 ROUND_NOT_SETTLED until settlement — that just means "no result yet".
const noResultYet = (e) => notFound(e) || (e instanceof ApiError && e.code === 'ROUND_NOT_SETTLED')

export async function loadMyTeam(roundId) {
  try {
    rounds.teams[roundId] = await api.myTeam(roundId)
  } catch (e) {
    if (!notFound(e)) throw e
    rounds.teams[roundId] = null
  }
  return rounds.teams[roundId]
}

let inflight = null

/** Concurrent callers share one request, so nobody gets a half-loaded list. */
export function loadRounds({ force = false } = {}) {
  if (inflight) return inflight
  if (rounds.loaded && !force) return Promise.resolve(rounds.list)
  inflight = fetchRounds().finally(() => (inflight = null))
  return inflight
}

async function fetchRounds() {
  rounds.loading = true
  rounds.error = null
  try {
    // GET /rounds lists only OPEN and LIVE rounds; settled ones need status=SETTLED (DRAFT is never listed).
    const [active, settled] = await Promise.all([api.rounds(), api.rounds({ status: 'SETTLED' }).catch(() => ({ items: [] }))])
    rounds.list = sortRounds([...(active.items ?? []), ...(settled.items ?? [])])
    for (const r of rounds.list) rounds.byId[r.id] = r
    // Scheduled rounds cannot have entries yet; skip their guaranteed 404s.
    for (const r of rounds.list) if (phaseOf(r) === 'scheduled') rounds.teams[r.id] = null
    await Promise.all(rounds.list.filter((r) => phaseOf(r) !== 'scheduled').map((r) => loadMyTeam(r.id).catch(() => null)))
    rounds.loaded = true
    resolveCountryName()
  } catch (e) {
    rounds.error = e
  } finally {
    rounds.loading = false
  }
  return rounds.list
}

export async function loadRound(id) {
  const round = await api.round(id)
  rounds.byId[id] = round
  const i = rounds.list.findIndex((r) => r.id === id)
  if (i >= 0) rounds.list[i] = round
  return round
}

/** Applies a round coming from SSE without refetching. */
export function patchRound(round) {
  if (!round?.id) return
  const prev = rounds.byId[round.id]
  rounds.byId[round.id] = round
  const i = rounds.list.findIndex((r) => r.id === round.id)
  if (i >= 0) rounds.list[i] = round
  else rounds.list = sortRounds([...rounds.list, round])
  if (prev && phaseOf(prev) !== phaseOf(round)) rounds.list = sortRounds(rounds.list)
}

export async function loadResult(roundId) {
  if (rounds.results[roundId]) return rounds.results[roundId]
  try {
    rounds.results[roundId] = await api.result(roundId)
  } catch (e) {
    if (!noResultYet(e)) throw e
    rounds.results[roundId] = null
  }
  return rounds.results[roundId]
}

/** Team count of a round. Always refetched: it grows while entries are open (cached value shows meanwhile). */
export async function loadParticipants(roundId) {
  try {
    const lb = await api.leaderboard(roundId, { size: 1 })
    rounds.participants[roundId] = lb.standings?.total ?? 0
  } catch {
    rounds.participants[roundId] ??= 0
  }
  return rounds.participants[roundId]
}

/** /me only has countryId; the name comes from any player of that country. */
async function resolveCountryName() {
  const countryId = session.user?.countryId
  if (!countryId || session.countryName) return
  for (const r of rounds.list) {
    const team = rounds.teams[r.id]
    const fromTeam = [...(team?.starters ?? []), team?.bench].find((s) => s?.player?.countryId === countryId)
    if (fromTeam) {
      session.countryName = fromTeam.player.countryName
      return
    }
  }
  const r = rounds.list[0]
  if (!r) return
  const page = await api.players(r.id, { countryId, size: 1 }).catch(() => null)
  session.countryName = page?.items?.[0]?.countryName ?? null
}

export function resetRounds() {
  inflight = null
  Object.assign(rounds, { list: [], loaded: false, loading: false, error: null, byId: {}, teams: {}, results: {}, participants: {} })
}

export const liveRounds = () => rounds.list.filter((r) => phaseOf(r) === 'live')
export const openRounds = () => rounds.list.filter((r) => phaseOf(r) === 'open')
export const nextOpenRound = (exceptId) => openRounds().find((r) => r.id !== exceptId) ?? null
