// Thin fetch wrapper for the Sporty Street API (same-origin /api, cookie session).
import { uuid } from '../lib/util.js'

export const API_BASE = '/api/v1'
// Static build: no server, the API runs in the page (src/api/local.js). Tree-shaken otherwise.
export const STATIC = import.meta.env.VITE_STATIC === '1'
const local = STATIC ? import('./local.js') : null

/** EventSource for the round stream — the in-page one in the static build. */
export async function openEventSource(url) {
  if (local) return new (await local).LocalEventSource(url)
  return new EventSource(url, { withCredentials: true })
}

// Stable backend error codes (ApiException / TeamService / RewardService) → copy for players.
const FRIENDLY = {
  VERSION_CONFLICT: 'Your team changed in the meantime. We reloaded it — please review and try again.',
  NETWORK: 'No connection to the game server. Check the backend is running.',
  ROUND_LOCKED: 'Squads are locked — the round has started.',
  ROUND_NOT_OPEN: 'This round is not open for entries.',
  ROUND_NOT_LIVE: 'The round is not live yet.',
  ROUND_BUSY: 'The round is still being played or a substitution is pending — try again in a moment.',
  TEAM_ALREADY_EXISTS: 'You already have a team in this round.',
  DUPLICATE_COUNTRY: 'Each starter must come from a different country — and the sub can only replace your starter from the bench player’s country.',
  DUPLICATE_PLAYER: 'Pick six different players.',
  WRONG_SQUAD_SIZE: 'Pick exactly five starters.',
  CAPTAIN_NOT_STARTER: 'Your captain must be one of the five starters.',
  PLAYER_INELIGIBLE: 'One of the players is not playing in this round.',
  SUBSTITUTION_USED: 'You already used your one substitution.',
  SUBSTITUTION_WINDOW_CLOSED: 'The substitution window is closed.',
  INVALID_SUBSTITUTION: 'Only your bench player can replace one of your current starters.',
  AUTO_PICK_IMPOSSIBLE: 'Auto-pick could not find five countries in this round.',
  INSUFFICIENT_RP: 'Not enough reward points for this gift yet.',
  GIFT_UNAVAILABLE: 'This gift is no longer available.',
  ROUND_NOT_SETTLED: 'The result appears once the round is settled.',
}

export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN', message = 'Something went wrong', fieldErrors = [], traceId = null } = {}) {
    super(FRIENDLY[code] ?? message)
    Object.assign(this, { status, code, fieldErrors, traceId, raw: message })
  }
}

let reauth = null
/** The session store registers how to re-login when the cookie session expires. */
export function onUnauthorized(fn) {
  reauth = fn
}

export async function request(method, path, { body, headers = {}, idempotencyKey, signal, retry = true } = {}) {
  const init = {
    method,
    credentials: 'same-origin',
    signal,
    headers: { Accept: 'application/json', ...headers },
  }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  if (idempotencyKey) init.headers['Idempotency-Key'] = idempotencyKey
  let res
  try {
    res = local ? await (await local).localFetch(`${API_BASE}${path}`, init) : await fetch(`${API_BASE}${path}`, init)
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError({ code: 'NETWORK', message: e.message })
  }
  if (res.status === 401 && retry && reauth && !path.startsWith('/dev/login')) {
    await reauth()
    return request(method, path, { body, headers, idempotencyKey, signal, retry: false })
  }
  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    if (res.status >= 502 && res.status <= 504 && !data) throw new ApiError({ status: res.status, code: 'NETWORK', message: 'Backend unavailable' })
    throw new ApiError({ status: res.status, ...(data ?? {}), message: data?.message ?? `${res.status} ${res.statusText}` })
  }
  return data
}

/**
 * Runs a mutating call with one Idempotency-Key reused across network retries,
 * so a timeout never creates a second team, sub or purchase (README: identical retry, no second debit).
 */
export async function withIdempotency(fn, attempts = 2) {
  const key = uuid()
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(key)
    } catch (e) {
      lastError = e
      if (!(e instanceof ApiError) || e.code !== 'NETWORK') throw e
    }
  }
  throw lastError
}
