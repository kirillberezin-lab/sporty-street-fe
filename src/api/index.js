// Endpoints from the backend OpenAPI snapshot (Sporty Street demo API v1).
import { API_BASE, request, withIdempotency } from './client.js'

const qs = (params = {}) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  // auth (local profile only)
  login: (username) => request('POST', `/dev/login${qs({ username })}`),
  me: () => request('GET', '/me'),

  // rules & rounds
  rules: () => request('GET', '/rules'),
  rounds: (params) => request('GET', `/rounds${qs({ size: 50, ...params })}`),
  round: (id) => request('GET', `/rounds/${id}`),
  // The backend caps page size at 100; a round has 60 players, so one page holds them all.
  players: (roundId, params) => request('GET', `/rounds/${roundId}/players${qs({ size: 100, ...params })}`),
  player: (roundId, playerId) => request('GET', `/rounds/${roundId}/players/${playerId}`),
  leaderboard: (roundId, params) => request('GET', `/rounds/${roundId}/leaderboard${qs({ size: 100, ...params })}`),
  result: (roundId) => request('GET', `/rounds/${roundId}/result`),
  streamUrl: (roundId) => `${API_BASE}/rounds/${roundId}/stream`,

  // teams
  autoPick: (roundId, preferHomeHero = true) => request('POST', `/rounds/${roundId}/auto-pick`, { body: { preferHomeHero } }),
  myTeam: (roundId) => request('GET', `/rounds/${roundId}/my-team`),
  createTeam: (roundId, lineup) =>
    withIdempotency((key) => request('POST', `/rounds/${roundId}/teams`, { body: lineup, idempotencyKey: key })),
  updateLineup: (teamId, lineup) => request('PUT', `/teams/${teamId}/lineup`, { body: lineup }),
  substitute: (teamId, sub) =>
    withIdempotency((key) => request('POST', `/teams/${teamId}/substitutions`, { body: sub, idempotencyKey: key })),
  breakdown: (teamId) => request('GET', `/teams/${teamId}/score-breakdown`),

  // rewards
  wallet: () => request('GET', '/rewards/wallet'),
  history: (params) => request('GET', `/rewards/history${qs({ size: 50, ...params })}`),
  gifts: (params) => request('GET', `/gifts${qs({ size: 50, ...params })}`),
  purchase: (giftId) => withIdempotency((key) => request('POST', `/gifts/${giftId}/purchases`, { body: {}, idempotencyKey: key })),
  purchases: (params) => request('GET', `/me/purchases${qs({ size: 50, ...params })}`),

  // push (served by the dev relay until the backend implements it)
  pushConfig: () => request('GET', '/push/config'),
  pushSubscribe: (subscription, prefs) => request('POST', '/push/subscriptions', { body: { subscription, prefs } }),
  pushUnsubscribe: (endpoint) => request('DELETE', '/push/subscriptions', { body: { endpoint } }),
  pushTest: (payload) => request('POST', '/push/test', { body: payload }),

  // demo controls (local profile)
  dev: {
    reset: () => request('POST', '/dev/reset'),
    openRound: (id) => request('POST', `/dev/rounds/${id}/open`),
    startRound: (id) => request('POST', `/dev/rounds/${id}/start`),
    settleRound: (id) => request('POST', `/dev/rounds/${id}/settle`),
    simulator: () => request('GET', '/dev/simulator'),
    simulatorStart: (roundId) => request('POST', '/dev/simulator/start', { body: { roundId } }),
    simulatorStop: () => request('POST', '/dev/simulator/stop'),
  },
}
