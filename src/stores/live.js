// Live round state from the backend SSE stream (named ROUND_SNAPSHOT events every 2s).
// README: replace state instead of adding deltas; for equal stateVersion accept a newer asOf;
// reconnect immediately gets the current state. One shared connection per round.
import { onBeforeUnmount, reactive } from 'vue'
import { api } from '../api/index.js'
import { diffLive, isLive, isSettled } from '../lib/liveDiff.js'
import { handleAlerts } from './notify.js'
import { patchRound, rounds } from './rounds.js'

const channels = new Map()

function createChannel(roundId) {
  const state = reactive({
    roundId,
    status: 'connecting', // connecting | open | error
    round: rounds.byId[roundId] ?? null,
    team: rounds.teams[roundId] ?? null,
    leaderboard: [],
    result: null,
    timeline: null,
    stateVersion: -1,
    asOf: 0,
    minute: null,
    simulator: null,
    prevRanks: {},
    updatedAt: 0,
  })
  let es = null
  let refs = 0
  let closeTimer = null
  let reconnectTimer = null
  let minuteTimer = null
  let devMinute = true
  let breakdownSeq = 0

  async function refreshBreakdown(team) {
    const seq = ++breakdownSeq
    try {
      const b = await api.breakdown(team.id)
      if (seq === breakdownSeq) state.timeline = b.timeline ?? []
    } catch {
      /* keep the last known timeline */
    }
  }

  async function onSnapshot(envelope) {
    const asOf = Date.parse(envelope.asOf) || Date.now()
    if (envelope.stateVersion < state.stateVersion) return
    if (envelope.stateVersion === state.stateVersion && asOf <= state.asOf) return
    const { round, myTeam, leaderboard = [], result = null } = envelope.payload ?? {}
    const prev = state.team ? { round: state.round, team: state.team, timeline: state.timeline } : null
    const scoreChanged = !state.team || state.team.score !== myTeam?.score || state.team.stateVersion !== myTeam?.stateVersion

    // Rank movement arrows for the standings (design 4.4).
    const ranks = {}
    for (const e of state.leaderboard) ranks[e.teamId] = e.rank
    if (Object.keys(ranks).length) state.prevRanks = { ...state.prevRanks, ...ranks }

    state.stateVersion = envelope.stateVersion
    state.asOf = asOf
    state.round = round ?? state.round
    state.team = myTeam ?? null
    state.leaderboard = leaderboard
    state.result = result
    state.updatedAt = Date.now()
    if (round) patchRound(round)
    rounds.teams[roundId] = myTeam ?? null
    if (result) rounds.results[roundId] = result

    if (myTeam && scoreChanged) await refreshBreakdown(myTeam)
    if (prev) handleAlerts(diffLive(prev, { round: state.round, team: state.team, timeline: state.timeline, result }))
    syncMinutePolling()
  }

  async function pollMinute() {
    if (!devMinute) return
    try {
      const sim = await api.dev.simulator()
      state.simulator = sim
      if (sim?.roundId === roundId) state.minute = sim.currentMatchMinute
    } catch {
      devMinute = false // not the local profile
    }
  }

  function syncMinutePolling() {
    const want = isLive(state.round?.status) && refs > 0 && devMinute
    if (want && !minuteTimer) {
      pollMinute()
      minuteTimer = setInterval(pollMinute, 2000)
    } else if (!want && minuteTimer) {
      clearInterval(minuteTimer)
      minuteTimer = null
    }
  }

  function connect() {
    clearTimeout(reconnectTimer)
    es?.close()
    state.status = 'connecting'
    es = new EventSource(api.streamUrl(roundId), { withCredentials: true })
    es.addEventListener('open', () => (state.status = 'open'))
    es.addEventListener('ROUND_SNAPSHOT', (e) => {
      state.status = 'open'
      try {
        onSnapshot(JSON.parse(e.data))
      } catch (err) {
        console.warn('Bad snapshot', err)
      }
    })
    es.addEventListener('error', () => {
      state.status = 'error'
      if (es.readyState === EventSource.CLOSED) reconnectTimer = setTimeout(connect, 3000)
    })
  }

  function close() {
    es?.close()
    es = null
    clearTimeout(reconnectTimer)
    clearInterval(minuteTimer)
    minuteTimer = null
    channels.delete(roundId)
  }

  return {
    state,
    retain() {
      refs += 1
      clearTimeout(closeTimer)
      if (!es) connect()
      syncMinutePolling()
    },
    release() {
      refs = Math.max(0, refs - 1)
      syncMinutePolling()
      if (refs === 0) closeTimer = setTimeout(close, 4000)
    },
    reconnect: connect,
    refreshBreakdown: () => state.team && refreshBreakdown(state.team),
    close,
  }
}

function channel(roundId) {
  if (!channels.has(roundId)) channels.set(roundId, createChannel(roundId))
  return channels.get(roundId)
}

/** Component-scoped access to a live round; the connection closes shortly after the last user leaves. */
export function useLive(roundId) {
  const ch = channel(roundId)
  ch.retain()
  onBeforeUnmount(() => ch.release())
  return { live: ch.state, reconnect: ch.reconnect, refreshBreakdown: ch.refreshBreakdown }
}

/** App-level watcher so alerts fire on any screen while a round with my team is live. */
const background = new Map()
export function watchLiveRounds() {
  const wanted = new Set(
    rounds.list
      .filter((r) => (isLive(r.status) || (isSettled(r.status) && background.has(r.id))) && rounds.teams[r.id])
      .map((r) => r.id),
  )
  for (const id of wanted) {
    if (!background.has(id)) {
      const ch = channel(id)
      ch.retain()
      background.set(id, ch)
    }
  }
  for (const [id, ch] of background) {
    const r = rounds.byId[id]
    if (!wanted.has(id) || (isSettled(r?.status) && ch.state.result)) {
      ch.release()
      background.delete(id)
    }
  }
}

/** Used when the demo user changes: the stream is owner-scoped, so drop every connection. */
export function closeAllLive() {
  background.clear()
  for (const ch of [...channels.values()]) ch.close()
}
