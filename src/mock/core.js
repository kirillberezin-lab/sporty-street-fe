// Mock of the Sporty Street backend (Java/Spring, profile `local`), free of Node and browser APIs.
// It follows the backend source, not only its OpenAPI: same seed and ids, statuses
// (DRAFT → OPEN → LIVE → SETTLED, auto-start at the deadline), error codes, score components
// (BASE / LATE_GOAL_BONUS / CAPTAIN_BONUS / HOME_HERO_BONUS), event revisions, the scripted
// simulator, settlement, RP ledger, gifts and idempotency — so the app behaves the same on both.
//
// Two ways to run a round:
//  - manual (default, like the backend): Demo controls open/start/simulate/settle the seed rounds;
//  - autopilot (static GitHub Pages build): rounds follow a wall-clock schedule shared by every
//    device — a new round kicks off every `periodMs`, plays a seeded, realistic match script and
//    settles itself. Same ids, same events everywhere, so challenge links work without a server.
//
// Wrapped by server/mock-api.mjs (Node http) and src/api/local.js (in the browser).
import { createCommunity } from './community.js'
import { CLUBS, FRIENDS, HISTORY, PLAYERS, RULES, USERS, seedRounds, uid } from './data.js'
import { REWARD_GIFTS as GIFTS, buildCatalogue } from './rewards.js'

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) + 8) | 0).toString(16))
const iso = (t) => (t == null ? null : new Date(t).toISOString())
const sum = (lines) => lines.reduce((s, l) => s + l.points, 0)
const byName = (a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)

export class ApiError extends Error {
  constructor(status, code, message, fieldErrors = []) {
    super(message)
    Object.assign(this, { status, code, fieldErrors })
  }
}
const rule = (code, message) => new ApiError(422, code, message)
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Resource not found')

// ---------- seeded randomness (autopilot scripts and bot squads) ----------
function hashSeed(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
function prng(seed) {
  let a = typeof seed === 'number' ? seed : hashSeed(seed)
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min, max) => min + Math.floor(next() * (max - min + 1))
  const pick = (list) => list[Math.floor(next() * list.length)]
  const weighted = (list, weight) => {
    const total = list.reduce((s, x) => s + weight(x), 0)
    let r = next() * total
    for (const x of list) if ((r -= weight(x)) < 0) return x
    return list[list.length - 1]
  }
  const shuffle = (list) => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  return { next, int, pick, weighted, shuffle }
}

// ---------- autopilot schedule ----------
const ROUND_NAMES = ['European Superstars', 'Champions Night', 'Super Sunday', 'Derby Day', 'Golden Boot Hour', 'Late Drama', 'Clásico Night', 'Title Race']
const TWIST_FROM = [75, 75, 70, 80]
// Round-robin for six clubs: five matchdays, three fixtures each.
const PAIRINGS = [
  [[0, 5], [1, 4], [2, 3]],
  [[4, 0], [3, 5], [2, 1]],
  [[0, 3], [4, 2], [5, 1]],
  [[2, 0], [1, 3], [5, 4]],
  [[0, 1], [2, 5], [3, 4]],
]
const BOTS = ['Lucas_10', 'Sofia FC', 'Mateo', 'Amara', 'Kenji', 'Chloé', 'Diego R.', 'Nia', 'Oskar', 'Priya', 'Rafa 9', 'Zanele', 'Tomás', 'Leila', 'Jonas', 'Inês', 'Kwame', 'Yara', 'Hugo', 'Mina', 'Sven', 'Aisha', 'Pablo', 'Noor']
const SCORER_WEIGHT = { FWD: 7, MID: 3, DEF: 1, GK: 0 }
const ASSIST_WEIGHT = { FWD: 3, MID: 5, DEF: 1.5, GK: 0.2 }
const CARD_WEIGHT = { FWD: 1, MID: 2, DEF: 3, GK: 0.3 }

export function createMockCore({ minuteMs = 2000, subDelaySeconds = 60, mediaBase = '', autopilot = false, periodMs = 6 * 60_000, state = null, onChange = () => {}, log = () => {} } = {}) {
  let db
  const matchMs = 90 * minuteMs

  const playerById = (id) => PLAYERS.find((p) => p.id === id)
  const userById = (id) => USERS.find((u) => u.id === id)
  const roundById = (id) => db.rounds.find((r) => r.id === id)
  const bump = (round) => {
    onChange()
    return ++round.stateVersion
  }
  const fixtureOf = (round, player) =>
    round.fixtures.find((f) => f.homeClubId === player.clubId || f.awayClubId === player.clubId)
  const teamName = (t) => t.displayName ?? userById(t.userId)?.displayName ?? 'Manager'
  const media = (url) => (url ? `${mediaBase}${url}` : null)
  const userResponse = (u) => ({ ...u, avatarUrl: media(u.avatarUrl) })

  function emptyDb() {
    return {
      rounds: autopilot ? [] : seedRounds(Date.now(), subDelaySeconds),
      teams: [], // { id, roundId, userId, captainPlayerId, homeCountryId, subsUsed, version, selections, subs, bot?, displayName? }
      events: [], // match_event rows
      results: [], // round_result rows
      wallets: Object.fromEntries(USERS.map((u) => [u.id, 0])),
      ledger: [],
      purchases: [],
      invitations: [], // { id, senderId, recipientId, roundId, status, createdAt, respondedAt }
      idem: new Map(),
    }
  }

  function reset() {
    simReset()
    db = emptyDb()
    if (autopilot) {
      tick()
      return
    }
    for (const username of ['bob', 'carol']) {
      const user = USERS.find((u) => u.username === username)
      const round = db.rounds[0]
      const pick = autoPick(round, user, true)
      createTeam(round, user, { starterPlayerIds: pick.starters.map((p) => p.id), benchPlayerId: pick.bench.id, captainPlayerId: pick.captainPlayerId })
    }
    onChange()
  }

  // ---------- catalogue ----------
  function playerResponse(p, homeCountryId, round) {
    const fixture = fixtureOf(round, p)
    const { clubIndex, playerIndex, ...rest } = p
    return {
      ...rest,
      imageUrl: rest.imageUrl ? `${mediaBase}${rest.imageUrl}` : null,
      displayStats: {},
      fixtureId: fixture?.id ?? null,
      eligible: Boolean(fixture),
      isHomeCountry: Boolean(homeCountryId && homeCountryId === p.countryId),
    }
  }
  const roundPlayers = (round, homeCountryId) =>
    PLAYERS.filter((p) => fixtureOf(round, p)).map((p) => playerResponse(p, homeCountryId, round)).sort(byName)

  function roundResponse(r) {
    return {
      id: r.id, name: r.name, status: r.status, entryDeadline: iso(r.entryDeadline),
      subWindowOpensAt: iso(r.subWindowOpensAt), subWindowClosesAt: iso(r.subWindowClosesAt),
      rules: r.rules, stateVersion: r.stateVersion, serverTime: iso(Date.now()),
      fixtures: r.fixtures.map((f) => ({ ...f, kickoffAt: iso(f.kickoffAt) })),
      // V6 round_presentation + counts
      format: r.format ?? (r.fixtures.length === 1 ? 'QUICK' : 'MATCHDAY'),
      matchCount: r.fixtures.length,
      participantCount: db.teams.filter((t) => t.roundId === r.id).length,
      simulated: true,
    }
  }
  function requireRound(id) {
    const round = roundById(id)
    if (!round) throw notFound()
    return round
  }

  // ---------- teams ----------
  function autoPick(round, user, preferHome) {
    const pool = roundPlayers(round, user.countryId).filter((p) => p.eligible)
    if (preferHome) pool.sort((a, b) => Number(b.isHomeCountry) - Number(a.isHomeCountry))
    const countries = new Set()
    const starters = []
    for (const p of pool) if (starters.length < 5 && !countries.has(p.countryId)) { countries.add(p.countryId); starters.push(p) }
    const bench = pool.find((p) => !starters.includes(p))
    if (starters.length !== 5 || !bench) throw rule('AUTO_PICK_IMPOSSIBLE', 'Need five starter countries and a sixth player')
    return {
      starters, bench, captainPlayerId: starters[0].id,
      explanation: 'Five different countries; first starter is captain; home player prioritized when requested.',
    }
  }

  function validate(round, lineup) {
    const starters = lineup.starterPlayerIds
    if (!Array.isArray(starters) || starters.length !== 5) throw rule('WRONG_SQUAD_SIZE', 'Exactly five starters required')
    const ids = [...starters, lineup.benchPlayerId]
    if (new Set(ids).size !== 6) throw rule('DUPLICATE_PLAYER', 'Six distinct players required')
    const selected = roundPlayers(round, null).filter((p) => ids.includes(p.id) && p.eligible)
    if (selected.length !== 6) throw rule('PLAYER_INELIGIBLE', 'All players must be eligible for this round')
    if (!starters.includes(lineup.captainPlayerId)) throw rule('CAPTAIN_NOT_STARTER', 'Captain must be a starter')
    if (new Set(selected.filter((p) => starters.includes(p.id)).map((p) => p.countryId)).size !== 5)
      throw rule('DUPLICATE_COUNTRY', 'Starters must represent five countries')
  }

  const findTeam = (roundId, userId) => db.teams.find((t) => t.roundId === roundId && t.userId === userId)
  function selectionsFor(lineup, from) {
    return [
      ...lineup.starterPlayerIds.map((playerId) => ({ playerId, role: 'STARTER', from, to: null })),
      { playerId: lineup.benchPlayerId, role: 'BENCH', from, to: null },
    ]
  }
  function insertTeam(round, { id = uuid(), userId, homeCountryId, lineup, ...extra }) {
    const team = {
      id, roundId: round.id, userId, captainPlayerId: lineup.captainPlayerId,
      homeCountryId, subsUsed: 0, version: 0, selections: selectionsFor(lineup, round.entryDeadline), subs: [], ...extra,
    }
    db.teams.push(team)
    return team
  }

  function createTeam(round, user, lineup) {
    if (round.status !== 'OPEN') throw rule('ROUND_NOT_OPEN', 'Round is not open')
    if (Date.now() >= round.entryDeadline) throw rule('ROUND_LOCKED', 'Entry deadline has passed')
    if (findTeam(round.id, user.id)) throw new ApiError(409, 'TEAM_ALREADY_EXISTS', 'One team per round')
    validate(round, lineup)
    const team = insertTeam(round, { userId: user.id, homeCountryId: user.countryId, lineup })
    bump(round)
    return snapshot(team)
  }

  function teamOf(user, teamId) {
    const team = db.teams.find((t) => t.id === teamId)
    if (!team) throw notFound()
    if (team.userId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'Team belongs to another user')
    return team
  }
  const checkVersion = (team, expected) => {
    if (team.version !== expected) throw new ApiError(409, 'VERSION_CONFLICT', 'Reload the current team version')
  }

  function updateLineup(team, body) {
    const round = roundById(team.roundId)
    checkVersion(team, body.expectedVersion)
    if (round.status !== 'OPEN' || Date.now() >= round.entryDeadline) throw rule('ROUND_LOCKED', 'Lineup is locked')
    validate(round, body)
    team.selections = selectionsFor(body, round.entryDeadline)
    team.captainPlayerId = body.captainPlayerId
    team.version += 1
    bump(round)
    return snapshot(team)
  }

  function substitute(team, body) {
    const round = roundById(team.roundId)
    checkVersion(team, body.expectedVersion)
    if (round.status !== 'LIVE') throw rule('ROUND_NOT_LIVE', 'Round is not live')
    if (team.subsUsed > 0) throw rule('SUBSTITUTION_USED', 'One substitution per round')
    const now = Date.now()
    if (now < round.subWindowOpensAt || now >= round.subWindowClosesAt) throw rule('SUBSTITUTION_WINDOW_CLOSED', 'Substitution window is closed')
    const current = snapshot(team, now)
    if (!current.bench || current.bench.player.id !== body.incomingPlayerId || !current.starters.some((s) => s.player.id === body.outgoingPlayerId))
      throw rule('INVALID_SUBSTITUTION', 'Swap one active starter for the bench player')
    if (!current.bench.player.eligible) throw rule('PLAYER_INELIGIBLE', 'Bench player is ineligible')
    const countries = new Set(current.starters.filter((s) => s.player.id !== body.outgoingPlayerId).map((s) => s.player.countryId))
    if (countries.has(current.bench.player.countryId)) throw rule('DUPLICATE_COUNTRY', 'Swap would duplicate a starter country')
    const cutoff = now + round.rules.subActivationDelaySeconds * 1000
    for (const s of team.selections) if (s.to == null && (s.playerId === body.outgoingPlayerId || s.playerId === body.incomingPlayerId)) s.to = cutoff
    team.selections.push({ playerId: body.outgoingPlayerId, role: 'BENCH', from: cutoff, to: null })
    team.selections.push({ playerId: body.incomingPlayerId, role: 'STARTER', from: cutoff, to: null })
    team.subs.push({ outgoingPlayerId: body.outgoingPlayerId, incomingPlayerId: body.incomingPlayerId, acceptedAt: now, effectiveAt: cutoff })
    team.subsUsed = 1
    team.version += 1
    bump(round)
    return snapshot(team, now)
  }

  // ---------- events & scoring ----------
  function latestEvents(round) {
    const fixtureIds = new Set(round.fixtures.map((f) => f.id))
    const newest = new Map()
    for (const e of db.events) {
      if (!fixtureIds.has(e.fixtureId)) continue
      const prev = newest.get(e.providerEventId)
      if (!prev || e.revision > prev.revision) newest.set(e.providerEventId, e)
    }
    const appearances = new Set()
    return [...newest.values()]
      .filter((e) => !e.voided)
      .sort((a, b) => a.occurredAt - b.occurredAt || a.providerEventId.localeCompare(b.providerEventId))
      .filter((e) => e.eventType !== 'APPEARANCE' || !appearances.has(`${e.fixtureId}:${e.playerId}`) && appearances.add(`${e.fixtureId}:${e.playerId}`))
  }

  const activeAt = (s, t) => s.role === 'STARTER' && t >= s.from && (s.to == null || t < s.to)

  /** ScoringEngine.score for every event of the round. */
  function contributions(team, round, events = latestEvents(round)) {
    const rules = round.rules
    const lines = []
    for (const e of events) {
      const sel = team.selections.find((s) => s.playerId === e.playerId && activeAt(s, e.occurredAt))
      if (!sel) continue
      const add = (component, points, explanation) => {
        if (points !== 0) lines.push({ playerId: e.playerId, eventId: e.id, component, points, explanation, matchMinute: e.matchMinute, occurredAt: iso(e.occurredAt), fixtureId: e.fixtureId })
      }
      const base = rules.base[e.eventType]
      add('BASE', base, e.eventType)
      const late = e.eventType === 'GOAL' && e.matchMinute >= rules.twist.fromMatchMinute ? base * (rules.twist.multiplier - 1) : 0
      add('LATE_GOAL_BONUS', late, `Goal from minute ${rules.twist.fromMatchMinute}`)
      if (e.playerId === team.captainPlayerId) add('CAPTAIN_BONUS', (base + late) * (rules.captainMultiplier - 1), 'Captain multiplier')
      if (team.homeCountryId && team.homeCountryId === playerById(e.playerId).countryId) {
        const bonus = e.eventType === 'GOAL' ? rules.homeHero.GOAL : e.eventType === 'ASSIST' ? rules.homeHero.ASSIST : 0
        add('HOME_HERO_BONUS', bonus, 'Home Hero (fixed bonus)')
      }
    }
    return lines.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId) || a.component.localeCompare(b.component))
  }

  function breakdown(team, events) {
    const lines = contributions(team, roundById(team.roundId), events)
    const byPlayer = new Map()
    for (const l of lines) (byPlayer.get(l.playerId) ?? byPlayer.set(l.playerId, []).get(l.playerId)).push(l)
    return {
      teamId: team.id,
      total: sum(lines),
      players: [...byPlayer].map(([playerId, components]) => ({ playerId, total: sum(components), components })),
      timeline: lines,
    }
  }

  function standings(round) {
    const events = latestEvents(round)
    const rows = db.teams
      .filter((t) => t.roundId === round.id)
      .map((t) => ({ teamId: t.id, displayName: teamName(t), score: breakdown(t, events).total, avatarUrl: media(userById(t.userId)?.avatarUrl) }))
      .sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId))
    rows.forEach((row, i) => (row.rank = i > 0 && row.score === rows[i - 1].score ? rows[i - 1].rank : i + 1))
    return rows.map(({ teamId, displayName, rank, score, avatarUrl }) => ({ teamId, displayName, rank, score, avatarUrl }))
  }

  function snapshot(team, now = Date.now(), rows = null) {
    const round = roundById(team.roundId)
    const b = breakdown(team)
    const points = new Map(b.players.map((p) => [p.playerId, p.total]))
    const current = team.selections.filter((s) => round.status === 'OPEN' || (now >= s.from && (s.to == null || now < s.to)))
    const state = (s) => ({ player: playerResponse(playerById(s.playerId), team.homeCountryId, round), points: points.get(s.playerId) ?? 0 })
    const starters = current.filter((s) => s.role === 'STARTER').map(state)
    const bench = current.filter((s) => s.role === 'BENCH').map(state)[0] ?? null
    const pending = team.subs.find((s) => s.effectiveAt > now)
    return {
      id: team.id, roundId: team.roundId, starters, bench, captainPlayerId: team.captainPlayerId, homeCountryId: team.homeCountryId,
      homeHeroPlayerId: starters.find((s) => s.player.isHomeCountry)?.player.id ?? null,
      pendingSubstitution: pending ? { outgoingPlayerId: pending.outgoingPlayerId, incomingPlayerId: pending.incomingPlayerId, effectiveAt: iso(pending.effectiveAt) } : null,
      subsUsed: team.subsUsed, subsRemaining: 1 - team.subsUsed, score: b.total,
      rank: (rows ?? standings(round)).find((e) => e.teamId === team.id)?.rank ?? 0,
      version: team.version, stateVersion: round.stateVersion, asOf: iso(now),
    }
  }

  function ingest(round, { key, revision = 1, player, type, minute, occurredAt, voided = false }) {
    const providerEventId = `${round.id}:${key}`
    const prior = db.events.filter((e) => e.providerEventId === providerEventId)
    if (prior.some((e) => e.revision === revision)) return // exact replay
    const applied = !prior.length || revision > Math.max(...prior.map((e) => e.revision))
    db.events.push({ id: uuid(), providerEventId, revision, fixtureId: fixtureOf(round, player).id, playerId: player.id, eventType: type, matchMinute: minute, occurredAt, voided })
    if (applied) bump(round)
  }

  // ---------- lifecycle ----------
  function openRound(round) {
    if (round.status === 'OPEN') return roundResponse(round)
    if (round.status !== 'DRAFT') throw rule('ROUND_NOT_OPEN', 'Only draft rounds can open')
    const deadline = Date.now() + 600_000
    Object.assign(round, { status: 'OPEN', entryDeadline: deadline, subWindowOpensAt: deadline, subWindowClosesAt: deadline + 21_600_000, rules: { ...RULES, subActivationDelaySeconds: subDelaySeconds } })
    bump(round)
    return roundResponse(round)
  }

  function startRound(round, early) {
    if (round.status === 'LIVE') return roundResponse(round)
    if (round.status !== 'OPEN') throw rule('ROUND_NOT_OPEN', 'Round is not open')
    const now = Date.now()
    if (early && now < round.entryDeadline) round.entryDeadline = now
    if (now < round.entryDeadline) throw rule('ROUND_NOT_LIVE', 'Deadline has not arrived')
    Object.assign(round, {
      status: 'LIVE', subWindowOpensAt: round.entryDeadline,
      // Autopilot rounds last one match, so the sub window closes at full time.
      subWindowClosesAt: autopilot ? round.entryDeadline + matchMs - 5000 : round.entryDeadline + 21_600_000,
    })
    for (const f of round.fixtures) f.kickoffAt = round.entryDeadline
    for (const t of db.teams.filter((x) => x.roundId === round.id)) for (const s of t.selections) s.from = round.entryDeadline
    bump(round)
    return roundResponse(round)
  }

  function settle(round) {
    if (sim.running && sim.roundId === round.id) throw new ApiError(409, 'ROUND_BUSY', 'Stop or finish the simulator before settlement')
    const rows = standings(round)
    if (round.status === 'SETTLED') return { roundId: round.id, status: 'SETTLED', participants: rows.length, stateVersion: round.stateVersion }
    if (round.status !== 'LIVE') throw rule('ROUND_NOT_LIVE', 'Only live rounds can settle')
    const now = Date.now()
    if (db.teams.some((t) => t.roundId === round.id && t.subs.some((s) => s.effectiveAt > now)))
      throw new ApiError(409, 'ROUND_BUSY', 'Wait for pending substitutions to activate')
    const { participationRp, winnerBonusRp } = round.rules.rewards
    const credit = (userId, reason, amount) => {
      if (!(userId in db.wallets)) return // bots have no wallet
      if (db.ledger.some((l) => l.userId === userId && l.roundId === round.id && l.reason === reason)) return
      db.ledger.push({ id: uuid(), userId, delta: amount, reason, roundId: round.id, purchaseId: null, createdAt: now })
      db.wallets[userId] += amount
    }
    for (const row of rows) {
      const team = db.teams.find((t) => t.id === row.teamId)
      credit(team.userId, 'PARTICIPATION', participationRp)
      if (row.rank === 1) credit(team.userId, 'WINNER', winnerBonusRp)
      db.results.push({ teamId: row.teamId, roundId: round.id, finalScore: row.score, finalRank: row.rank, participationRp, winnerRp: row.rank === 1 ? winnerBonusRp : 0, settledAt: now })
    }
    Object.assign(round, { status: 'SETTLED', settledAt: now })
    bump(round)
    return { roundId: round.id, status: 'SETTLED', participants: rows.length, stateVersion: round.stateVersion }
  }

  function result(team) {
    const r = db.results.find((x) => x.teamId === team.id)
    if (!r) throw notFound()
    return { ...r, totalAwardedRp: r.participationRp + r.winnerRp, settledAt: iso(r.settledAt), breakdown: breakdown(team) }
  }

  // ---------- simulator (SimulatorService, manual mode) ----------
  let sim
  function simReset() {
    if (sim?.timer) clearInterval(sim.timer)
    sim = { roundId: null, running: false, completed: false, lastError: null, cursor: 0, script: [], cutoffs: new Set(), timer: null }
  }
  const matchMinute = (round, now = Date.now()) => Math.max(0, Math.min(90, Math.floor((now - round.entryDeadline) / minuteMs)))
  const simStatus = () => {
    if (autopilot) {
      const round = db.rounds.find((r) => r.status === 'LIVE')
      return { roundId: round?.id ?? null, running: Boolean(round), completed: false, currentMatchMinute: round ? matchMinute(round) : 0, lastError: null, autopilot: true }
    }
    const round = sim.roundId ? roundById(sim.roundId) : null
    return { roundId: sim.roundId, running: sim.running, completed: sim.completed, currentMatchMinute: round ? matchMinute(round) : 0, lastError: sim.lastError }
  }
  function simStart(roundId) {
    if (autopilot) return simStatus() // rounds play themselves
    if (sim.running) {
      if (roundId !== sim.roundId) throw new ApiError(409, 'ROUND_BUSY', 'Another simulation is running')
      return simStatus()
    }
    const round = requireRound(roundId)
    if (round.status !== 'LIVE') throw rule('ROUND_NOT_LIVE', 'Start round first')
    const players = roundPlayers(round, null)
    const d = (minute, player, type, key, deliveryMinute = minute, revision = 1, voided = false) => ({ deliveryMinute, minute, player, type, key, revision, voided })
    const script = players.map((p) => d(0, p, 'APPEARANCE', `appearance-${p.id}`))
    if (script.length) script.push(script[0])
    for (const minute of [5, 15, 30, 74, 75, 81])
      for (const p of players) script.push(d(minute, p, minute === 15 ? 'ASSIST' : minute === 30 ? 'YELLOW_CARD' : 'GOAL', `event-${minute}-${p.id}`))
    if (players.length) {
      const p = players[0]
      script.push(d(35, p, 'GOAL', 'voided-goal'), d(35, p, 'GOAL', 'voided-goal', 40, 2, true), d(20, p, 'GOAL', 'delayed-goal', 50))
      script.push(d(55, p, 'GOAL', 'corrected-event'), d(55, p, 'ASSIST', 'corrected-event', 56, 3), d(55, p, 'GOAL', 'corrected-event', 57, 2))
    }
    script.sort((a, b) => a.deliveryMinute - b.deliveryMinute)
    Object.assign(sim, { roundId, running: true, completed: false, lastError: null, cursor: 0, script, cutoffs: new Set() })
    clearInterval(sim.timer)
    sim.timer = setInterval(simTick, Math.max(50, Math.min(500, minuteMs / 4)))
    return simStatus()
  }
  function simTick() {
    if (!sim.running) return
    try {
      const round = roundById(sim.roundId)
      if (round.status !== 'LIVE') { sim.running = false; return }
      const now = Date.now()
      let sent = 0
      while (sim.cursor < sim.script.length && sent++ < 10) {
        const e = sim.script[sim.cursor]
        if (round.entryDeadline + e.deliveryMinute * minuteMs > now) break
        ingest(round, { key: e.key, revision: e.revision, player: e.player, type: e.type, minute: e.minute, occurredAt: round.entryDeadline + e.minute * minuteMs, voided: e.voided })
        sim.cursor++
      }
      for (const t of db.teams.filter((x) => x.roundId === round.id)) {
        for (const s of t.subs) {
          const key = `${s.outgoingPlayerId}:${s.incomingPlayerId}:${s.effectiveAt}`
          if (sim.cutoffs.has(key) || now < s.effectiveAt + 2000) continue
          const minuteAt = (t2) => Math.floor((t2 - round.entryDeadline) / minuteMs)
          ingest(round, { key: `cutoff:${key}:out-before`, player: playerById(s.outgoingPlayerId), type: 'GOAL', minute: minuteAt(s.effectiveAt - 1), occurredAt: s.effectiveAt - 1 })
          ingest(round, { key: `cutoff:${key}:in-at`, player: playerById(s.incomingPlayerId), type: 'GOAL', minute: minuteAt(s.effectiveAt), occurredAt: s.effectiveAt })
          sim.cutoffs.add(key)
        }
      }
      if (sim.cursor === sim.script.length && now >= round.entryDeadline + matchMs) {
        Object.assign(sim, { running: false, completed: true })
        clearInterval(sim.timer)
      }
    } catch (e) {
      Object.assign(sim, { running: false, lastError: e.message })
      log(`[mock] simulator failed: ${e.stack}`)
    }
  }

  // ---------- autopilot (static build) ----------
  /** A realistic, seeded match script: the same goals, assists and cards on every device. */
  const scripts = new Map()
  function matchScript(round) {
    if (scripts.has(round.id)) return scripts.get(round.id)
    const rnd = prng(`script:${round.id}`)
    const script = []
    const add = (minute, player, type, key, extra = {}) => script.push({ deliveryMinute: minute, minute, player, type, key, revision: 1, voided: false, ...extra })
    const pos = (p) => p.position
    let lateGoals = 0
    const goalsOf = []
    for (const f of round.fixtures) {
      const sides = [f.homeClubId, f.awayClubId].map((clubId) => PLAYERS.filter((p) => p.clubId === clubId))
      for (const squad of sides) for (const p of squad) add(0, p, 'APPEARANCE', `appearance-${p.id}`)
      sides.forEach((squad, side) => {
        const goals = rnd.pick([0, 1, 1, 2, 2, 2, 3, 3, 4])
        for (let g = 0; g < goals; g++) {
          const minute = rnd.int(3, 90)
          const scorer = rnd.weighted(squad, (p) => SCORER_WEIGHT[pos(p)] ?? 1)
          if (minute >= round.rules.twist.fromMatchMinute) lateGoals++
          goalsOf.push({ squad, side, f })
          add(minute, scorer, 'GOAL', `goal-${f.id}-${side}-${g}`)
          if (rnd.next() < 0.72) {
            const helper = rnd.weighted(squad.filter((p) => p !== scorer), (p) => ASSIST_WEIGHT[pos(p)] ?? 1)
            add(minute, helper, 'ASSIST', `assist-${f.id}-${side}-${g}`)
          }
        }
      })
      const all = sides.flat()
      for (let c = rnd.int(1, 4); c > 0; c--) add(rnd.int(8, 89), rnd.weighted(all, (p) => CARD_WEIGHT[pos(p)] ?? 1), 'YELLOW_CARD', `yellow-${f.id}-${c}`)
      if (rnd.next() < 0.1) add(rnd.int(30, 88), rnd.weighted(all, (p) => CARD_WEIGHT[pos(p)] ?? 1), 'RED_CARD', `red-${f.id}`)
      // Now and then VAR rules a goal out three minutes later (a higher revision voids it).
      if (rnd.next() < 0.25) {
        const minute = rnd.int(20, 70)
        const scorer = rnd.weighted(all, (p) => SCORER_WEIGHT[pos(p)] ?? 1)
        add(minute, scorer, 'GOAL', `var-${f.id}`)
        add(minute, scorer, 'GOAL', `var-${f.id}`, { deliveryMinute: minute + 3, revision: 2, voided: true })
      }
    }
    // Every round keeps its promise: at least two goals land in the twist window.
    for (let i = lateGoals; i < 2; i++) {
      const f = rnd.pick(round.fixtures)
      const squad = PLAYERS.filter((p) => p.clubId === rnd.pick([f.homeClubId, f.awayClubId]))
      add(rnd.int(round.rules.twist.fromMatchMinute, 90), rnd.weighted(squad, (p) => SCORER_WEIGHT[pos(p)] ?? 1), 'GOAL', `late-${f.id}-${i}`)
    }
    script.sort((a, b) => a.deliveryMinute - b.deliveryMinute || a.key.localeCompare(b.key))
    scripts.set(round.id, script)
    return script
  }

  function botLineup(round, rnd) {
    const pool = rnd.shuffle(roundPlayers(round, null).filter((p) => p.eligible))
    const countries = new Set()
    const starters = []
    for (const slot of ['FWD', 'MID', 'MID', 'DEF', 'GK']) {
      const p = pool.find((x) => x.position === slot && !countries.has(x.countryId) && !starters.includes(x))
      if (p) { starters.push(p); countries.add(p.countryId) }
    }
    for (const p of pool) if (starters.length < 5 && !countries.has(p.countryId)) { starters.push(p); countries.add(p.countryId) }
    const bench = pool.find((p) => !starters.includes(p) && !countries.has(p.countryId)) ?? pool.find((p) => !starters.includes(p))
    const captain = starters.find((p) => p.position === 'FWD') ?? starters[0]
    return { lineup: { starterPlayerIds: starters.map((p) => p.id), benchPlayerId: bench.id, captainPlayerId: captain.id }, homeCountryId: rnd.next() < 0.6 ? rnd.pick(starters).countryId : null }
  }

  function scheduledRound(slot) {
    const deadline = slot * periodMs
    const id = uid(`round:slot:${slot}`)
    const clubs = PAIRINGS[slot % PAIRINGS.length].map(([h, a]) => (Math.floor(slot / PAIRINGS.length) % 2 ? [a, h] : [h, a]))
    const round = {
      id, slot, name: ROUND_NAMES[slot % ROUND_NAMES.length], status: 'OPEN',
      entryDeadline: deadline, subWindowOpensAt: deadline, subWindowClosesAt: deadline + matchMs - 5000,
      rules: { ...RULES, subActivationDelaySeconds: subDelaySeconds, twist: { ...RULES.twist, fromMatchMinute: TWIST_FROM[slot % TWIST_FROM.length] } },
      stateVersion: 0, settledAt: null, cursor: 0,
      fixtures: clubs.map(([h, a], f) => ({
        id: uid(`fixture:slot:${slot}:${f}`), roundId: id, provider: 'simulator',
        homeClubId: CLUBS[h].id, homeClubName: CLUBS[h].name, awayClubId: CLUBS[a].id, awayClubName: CLUBS[a].name, kickoffAt: deadline,
      })),
    }
    db.rounds.push(round)
    const rnd = prng(`bots:${id}`)
    for (const name of BOTS.slice(0, 16 + (slot % 9))) {
      const { lineup, homeCountryId } = botLineup(round, rnd)
      insertTeam(round, { id: uid(`team:${id}:${name}`), userId: uid(`bot:${name}`), displayName: name, bot: true, homeCountryId, lineup })
    }
    return round
  }

  // A friend's squad from a challenge link: same events everywhere, so it scores as on their phone.
  function addGhost({ roundId, teamId, name, playerIds = [], captainId }) {
    const round = requireRound(roundId)
    if (db.teams.some((t) => t.id === teamId)) return { added: false }
    if (round.status === 'SETTLED') throw rule('ROUND_NOT_OPEN', 'Round is over')
    const players = roundPlayers(round, null)
    const picked = playerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean)
    const starters = picked.slice(0, 5)
    const countries = new Set(starters.map((p) => p.countryId))
    const bench = picked[5] ?? players.find((p) => !starters.includes(p) && !countries.has(p.countryId))
    const lineup = { starterPlayerIds: starters.map((p) => p.id), benchPlayerId: bench?.id, captainPlayerId: starters.some((p) => p.id === captainId) ? captainId : starters[0]?.id }
    validate(round, lineup)
    insertTeam(round, { id: teamId, userId: uid(`ghost:${teamId}`), displayName: name || 'Friend', bot: true, ghost: true, homeCountryId: null, lineup })
    bump(round)
    return { added: true }
  }

  function tick(now = Date.now()) {
    if (!autopilot) {
      // RoundScheduler.startDue: OPEN rounds go LIVE once the deadline passes.
      for (const r of db.rounds) if (r.status === 'OPEN' && r.entryDeadline <= now) startRound(r, false)
      return
    }
    const current = Math.floor(now / periodMs)
    for (let slot = current - 2; slot <= current + 2; slot++) if (!db.rounds.some((r) => r.slot === slot)) scheduledRound(slot)
    for (const round of db.rounds) {
      if (round.status === 'OPEN' && round.entryDeadline <= now) startRound(round, false)
      if (round.status !== 'LIVE') continue
      const script = matchScript(round)
      while (round.cursor < script.length) {
        const e = script[round.cursor]
        if (round.entryDeadline + e.deliveryMinute * minuteMs > now) break
        ingest(round, { key: e.key, revision: e.revision, player: e.player, type: e.type, minute: e.minute, occurredAt: round.entryDeadline + e.minute * minuteMs, voided: e.voided })
        round.cursor++
      }
      const pendingSub = db.teams.some((t) => t.roundId === round.id && t.subs.some((s) => s.effectiveAt > now))
      if (round.cursor >= script.length && now >= round.entryDeadline + matchMs + 4000 && !pendingSub) settle(round)
    }
    // Forget old rounds nobody on this device played.
    const keep = new Set(db.teams.filter((t) => !t.bot).map((t) => t.roundId))
    const stale = db.rounds.filter((r) => r.slot < current - 4 && !keep.has(r.id)).map((r) => r.id)
    if (stale.length) {
      const gone = new Set(stale)
      const fixtures = new Set(db.rounds.filter((r) => gone.has(r.id)).flatMap((r) => r.fixtures.map((f) => f.id)))
      db.rounds = db.rounds.filter((r) => !gone.has(r.id))
      db.teams = db.teams.filter((t) => !gone.has(t.roundId))
      db.results = db.results.filter((x) => !gone.has(x.roundId))
      db.events = db.events.filter((e) => !fixtures.has(e.fixtureId))
      stale.forEach((id) => scripts.delete(id))
      onChange()
    }
  }

  // ---------- live extras (not in the backend contract yet) ----------
  /** Match clock and live scores for the stream; see the stream notes in the README. */
  function matchesOf(round, events) {
    const live = round.status === 'LIVE'
    const minute = round.status === 'OPEN' ? null : round.status === 'SETTLED' ? 90 : matchMinute(round)
    return {
      clock: { matchMinute: minute, phase: round.status === 'OPEN' ? 'PRE' : round.status === 'SETTLED' || minute >= 90 ? 'FT' : minute >= 45 && minute < 46 ? 'HT' : 'LIVE' },
      matches: round.fixtures.map((f) => {
        const own = events.filter((e) => e.fixtureId === f.id && e.eventType !== 'APPEARANCE')
        const goals = (clubId) => own.filter((e) => e.eventType === 'GOAL' && playerById(e.playerId).clubId === clubId).length
        return {
          fixtureId: f.id, homeClubName: f.homeClubName, awayClubName: f.awayClubName,
          homeGoals: goals(f.homeClubId), awayGoals: goals(f.awayClubId), live,
          events: own.slice(-8).reverse().map((e) => ({ id: e.id, minute: e.matchMinute, type: e.eventType, playerId: e.playerId, playerName: playerById(e.playerId).name, side: playerById(e.playerId).clubId === f.homeClubId ? 'HOME' : 'AWAY' })),
        }
      }),
    }
  }

  function envelope(round, user) {
    const team = findTeam(round.id, user.id)
    const events = latestEvents(round)
    const rows = standings(round)
    return {
      eventType: 'ROUND_SNAPSHOT', roundId: round.id, stateVersion: round.stateVersion, asOf: iso(Date.now()),
      payload: {
        round: roundResponse(round),
        myTeam: team ? snapshot(team, Date.now(), rows) : null,
        leaderboard: rows.slice(0, 100),
        result: round.status === 'SETTLED' && team ? result(team) : null,
        ...matchesOf(round, events),
      },
    }
  }

  // ---------- helpers ----------
  function page(items, query, map = (x) => x) {
    const p = Number(query.get('page') ?? 0)
    const size = Number(query.get('size') ?? 20)
    if (!(p >= 0) || !(size >= 1) || size > 100) throw new ApiError(400, 'VALIDATION_FAILED', 'page >= 0 and size 1–100 required')
    return { items: items.slice(p * size, p * size + size).map(map), page: p, size, total: items.length }
  }
  function idempotent(headers, user, methodPath, body, status, out, fn) {
    const key = headers['idempotency-key']
    if (!key || key.length > 200) throw new ApiError(400, 'VALIDATION_FAILED', 'Idempotency-Key must contain 1–200 characters')
    const id = `${user.id}:${key}:${methodPath}`
    const hash = JSON.stringify(body ?? {})
    const saved = db.idem.get(id)
    if (saved) {
      if (saved.hash !== hash) throw rule('IDEMPOTENCY_KEY_REUSED', 'Key already used for a different request')
      out.status = saved.status
      return saved.body
    }
    const result = fn()
    db.idem.set(id, { hash, status, body: result })
    out.status = status
    return result
  }
  function authUser(headers) {
    const cookie = Object.fromEntries((headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0])).dev_user
    const username = headers['x-dev-user'] ?? cookie
    if (!username) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
    const user = USERS.find((u) => u.username === username)
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Unknown demo user')
    return user
  }
  // ShowcaseSeed history: RP from the seeded past rounds, credited once per account.
  function welcome(user) {
    const rp = HISTORY[user.username]?.rp ?? 0
    if (!rp || db.ledger.some((l) => l.userId === user.id && l.reason === 'HISTORY')) return
    db.ledger.push({ id: uuid(), userId: user.id, delta: rp, reason: 'HISTORY', roundId: null, purchaseId: null, createdAt: Date.now() - 86400_000 })
    db.wallets[user.id] = (db.wallets[user.id] ?? 0) + rp
    onChange()
  }

  // ---------- profile, overall leaderboard (ProfileService) ----------
  const resultsOf = (userId) => db.results.filter((x) => db.teams.find((t) => t.id === x.teamId)?.userId === userId)
  function rankings() {
    const rows = USERS.map((u) => {
      const h = HISTORY[u.username] ?? { points: 0, rounds: 0 }
      const mine = resultsOf(u.id)
      return { userId: u.id, username: u.username, displayName: u.displayName, avatarUrl: media(u.avatarUrl), points: h.points + mine.reduce((s, x) => s + x.finalScore, 0), roundsPlayed: h.rounds + mine.length }
    }).sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId))
    rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1))
    return rows.map(({ userId, username, displayName, avatarUrl, points, rank, roundsPlayed }) => ({ userId, username, displayName, avatarUrl, points, rank, roundsPlayed }))
  }
  const ranking = (userId) => rankings().find((r) => r.userId === userId)
  function history(userId) {
    return db.teams.filter((t) => t.userId === userId)
      .map((t) => ({ t, r: roundById(t.roundId), res: db.results.find((x) => x.teamId === t.id) }))
      .filter((x) => x.r)
      .sort((a, b) => b.r.entryDeadline - a.r.entryDeadline || a.r.id.localeCompare(b.r.id))
      .map(({ t, r, res }) => ({ roundId: r.id, name: r.name, status: r.status, startsAt: iso(r.entryDeadline), score: res?.finalScore ?? breakdown(t).total, rank: res?.finalRank ?? null, earnedRp: res ? res.participationRp + res.winnerRp : 0 }))
  }
  function profile(user) {
    const rank = ranking(user.id)
    const h = HISTORY[user.username] ?? { wins: 0 }
    const mine = resultsOf(user.id)
    const teams = db.teams.filter((t) => t.userId === user.id)
    const wins = h.wins + mine.filter((x) => x.finalRank === 1).length
    const smart = teams.filter((t) => t.subs.some((sub) => contributions(t, roundById(t.roundId)).some((l) => l.playerId === sub.incomingPlayerId && Date.parse(l.occurredAt) >= sub.effectiveAt && l.points > 0))).length
    const heroes = new Map()
    for (const t of teams) for (const l of contributions(t, roundById(t.roundId))) if (l.component === 'HOME_HERO_BONUS') heroes.set(l.playerId, (heroes.get(l.playerId) ?? 0) + l.points)
    const top = [...heroes].sort((a, b) => b[1] - a[1])[0]
    const days = new Set(mine.map((x) => new Date(x.settledAt).toISOString().slice(0, 10)))
    let streak = 0
    for (let d = Date.now(); days.has(new Date(d).toISOString().slice(0, 10)); d -= 86400_000) streak++
    const xp = rank.roundsPlayed * 100 + rank.points
    const accepted = db.invitations.some((i) => i.senderId === user.id && i.status === 'ACCEPTED')
    const hist = history(user.id)
    return {
      user: userResponse(user), bio: 'Football fan · Building my world five',
      joinedAt: rank.roundsPlayed ? iso(Date.now() - 45 * 86400_000) : null,
      stats: { roundsPlayed: rank.roundsPlayed, averagePoints: rank.roundsPlayed ? Math.round((rank.points * 10) / rank.roundsPlayed) / 10 : 0, bestFinish: wins ? 1 : mine.length ? Math.min(...mine.map((x) => x.finalRank)) : null, wins, substitutions: teams.reduce((s, t) => s + t.subsUsed, 0), smartSubs: smart, streakDays: streak },
      progress: { xp, level: 1 + Math.floor(xp / 1000), xpInLevel: xp % 1000, xpForNextLevel: 1000, title: xp >= 5000 ? 'All-Star' : xp >= 2000 ? 'Playmaker' : 'Rookie' },
      leaderboard: rank,
      badges: [
        { code: 'SUPER_SUB', name: 'Super Sub', unlocked: smart > 0 }, { code: 'STREAK', name: '7-day streak', unlocked: streak >= 7 },
        { code: 'PATRIOT', name: 'Home Hero', unlocked: Boolean(top) }, { code: 'RECRUITER', name: 'Team Player', unlocked: accepted },
        { code: 'WINNER', name: 'Winner', unlocked: wins > 0 },
      ],
      topHomeHero: top ? { playerId: top[0], name: playerById(top[0]).name, imageUrl: media(playerById(top[0]).imageUrl), bonusPoints: top[1] } : null,
      roundHistory: { items: hist.slice(0, 10), page: 0, size: 10, total: hist.length },
    }
  }

  // ---------- friends & round invitations (FriendService) ----------
  const userByName = (name) => USERS.find((u) => u.username === name)
  function friend(u) {
    return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: media(u.avatarUrl), leaderboardPoints: ranking(u.id).points }
  }
  function invitation(i) {
    const round = roundById(i.roundId)
    const expired = i.status === 'PENDING' && (!round || round.status !== 'OPEN' || Date.now() >= round.entryDeadline)
    return { id: i.id, sender: friend(userById(i.senderId)), recipient: friend(userById(i.recipientId)), roundId: i.roundId, roundName: round?.name ?? 'Round', status: expired ? 'EXPIRED' : i.status, createdAt: iso(i.createdAt), respondedAt: iso(i.respondedAt) }
  }
  function invite(sender, friendId, roundId) {
    const round = requireRound(roundId)
    if (round.status !== 'OPEN' || Date.now() >= round.entryDeadline) throw rule('ROUND_LOCKED', 'Invitations require an open round')
    const recipient = userById(friendId)
    if (!recipient || !(FRIENDS[sender.username] ?? []).includes(recipient.username)) throw rule('NOT_FRIENDS', 'Invite someone from your friends list')
    let i = db.invitations.find((x) => x.senderId === sender.id && x.recipientId === recipient.id && x.roundId === roundId)
    if (!i) {
      i = { id: uuid(), senderId: sender.id, recipientId: recipient.id, roundId, status: 'PENDING', createdAt: Date.now(), respondedAt: null }
      db.invitations.push(i)
    }
    return invitation(i)
  }
  function respond(viewer, id, accept) {
    const i = db.invitations.find((x) => x.id === id)
    if (!i) throw notFound()
    if (i.recipientId !== viewer.id) throw new ApiError(403, 'FORBIDDEN', 'Only the recipient can respond')
    const current = invitation(i)
    const wanted = accept ? 'ACCEPTED' : 'DECLINED'
    if (current.status === wanted) return current
    if (current.status !== 'PENDING') throw new ApiError(409, 'INVITATION_CLOSED', 'Invitation is no longer pending')
    if (accept && !findTeam(i.roundId, viewer.id)) {
      const round = requireRound(i.roundId)
      const pick = autoPick(round, viewer, true)
      createTeam(round, viewer, { starterPlayerIds: pick.starters.map((x) => x.id), benchPlayerId: pick.bench.id, captainPlayerId: pick.captainPlayerId })
    }
    Object.assign(i, { status: wanted, respondedAt: Date.now() })
    onChange()
    return invitation(i)
  }

  // ---------- routing ----------
  const routes = []
  const route = (method, pattern, fn, { auth = true } = {}) =>
    routes.push({ method, re: new RegExp(`^/api/v1${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn, auth })

  route('POST', '/dev/login', ({ query, out }) => {
    const user = USERS.find((u) => u.username === query.get('username'))
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Unknown demo user')
    out.headers['Set-Cookie'] = `dev_user=${user.username}; Path=/api; HttpOnly; SameSite=Lax`
    return userResponse(user)
  }, { auth: false })
  route('GET', '/me', ({ user }) => userResponse(user))
  route('GET', '/rules', () => ({ ...RULES, subActivationDelaySeconds: subDelaySeconds }))
  route('GET', '/rounds', ({ query }) => {
    const status = query.get('status')
    const period = query.get('period')
    const format = query.get('format')
    if (status != null && !['OPEN', 'LIVE', 'SETTLED'].includes(status)) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid round status')
    if (period != null && !['TODAY', 'TOMORROW', 'THIS_WEEK'].includes(period)) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid period')
    if (format != null && !['QUICK', 'MATCHDAY', 'SPECIAL'].includes(format)) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid format')
    const tz = query.get('timeZone') ?? 'UTC'
    let dayOf
    try {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      dayOf = (t) => f.format(new Date(t))
    } catch {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid timeZone')
    }
    const today = dayOf(Date.now())
    const plus = (n) => dayOf(Date.now() + n * 86400_000)
    const inPeriod = (t) => period == null || (period === 'TODAY' ? dayOf(t) === today : period === 'TOMORROW' ? dayOf(t) === plus(1) : dayOf(t) >= today && dayOf(t) <= plus(6))
    const items = db.rounds
      .filter((r) => (status == null ? ['OPEN', 'LIVE'].includes(r.status) : r.status === status))
      .filter((r) => inPeriod(r.entryDeadline) && (format == null || roundResponse(r).format === format))
      .sort((a, b) => Number(a.status !== 'LIVE') - Number(b.status !== 'LIVE') || a.entryDeadline - b.entryDeadline || a.id.localeCompare(b.id))
    if (status === 'SETTLED') items.reverse()
    return page(items, query, roundResponse)
  })
  route('GET', '/rounds/:id', ({ p }) => roundResponse(requireRound(p.id)))
  route('GET', '/rounds/:id/players', ({ p, query, user }) => {
    const round = requireRound(p.id)
    const position = query.get('position')
    const countryId = query.get('countryId')
    const name = (query.get('name') ?? '').toLowerCase()
    return page(roundPlayers(round, user.countryId).filter((pl) =>
      (position == null || pl.position === position) && (countryId == null || pl.countryId === countryId) && pl.name.toLowerCase().includes(name)), query)
  })
  route('GET', '/rounds/:id/players/:playerId', ({ p, user }) => {
    const pl = roundPlayers(requireRound(p.id), user.countryId).find((x) => x.id === p.playerId)
    if (!pl) throw notFound()
    return pl
  })
  route('POST', '/rounds/:roundId/auto-pick', ({ p, body, user }) => autoPick(requireRound(p.roundId), user, Boolean(body?.preferHomeHero)))
  route('POST', '/rounds/:roundId/teams', ({ p, body, user, headers, out }) => {
    const round = requireRound(p.roundId)
    return idempotent(headers, user, `POST /api/v1/rounds/${p.roundId}/teams`, body, 201, out, () => createTeam(round, user, body ?? {}))
  })
  route('GET', '/rounds/:roundId/my-team', ({ p, user }) => {
    requireRound(p.roundId)
    const team = findTeam(p.roundId, user.id)
    if (!team) throw notFound()
    return snapshot(team)
  })
  route('PUT', '/teams/:id/lineup', ({ p, body, user }) => updateLineup(teamOf(user, p.id), body ?? {}))
  route('POST', '/teams/:id/substitutions', ({ p, body, user, headers, out }) => {
    const team = teamOf(user, p.id)
    return idempotent(headers, user, `POST /api/v1/teams/${p.id}/substitutions`, body, 200, out, () => substitute(team, body ?? {}))
  })
  route('GET', '/teams/:id/score-breakdown', ({ p, user }) => breakdown(teamOf(user, p.id)))
  route('GET', '/rounds/:id/leaderboard', ({ p, query }) => {
    const round = requireRound(p.id)
    return { roundId: round.id, stateVersion: round.stateVersion, standings: page(standings(round), query) }
  })
  route('GET', '/rounds/:id/result', ({ p, user }) => {
    const round = requireRound(p.id)
    if (round.status !== 'SETTLED') throw rule('ROUND_NOT_SETTLED', 'Round is not settled')
    const team = findTeam(round.id, user.id)
    if (!team) throw notFound()
    return result(team)
  })
  route('GET', '/rewards/wallet', ({ user }) => {
    welcome(user)
    return { balanceRp: db.wallets[user.id] ?? 0 }
  })
  route('GET', '/rewards/history', ({ user, query }) => {
    welcome(user)
    return page(db.ledger.filter((l) => l.userId === user.id).sort((a, b) => b.createdAt - a.createdAt), query, ({ userId, ...l }) => ({ ...l, createdAt: iso(l.createdAt) }))
  })
  route('GET', '/me/purchases', ({ user, query }) =>
    page(db.purchases.filter((x) => x.userId === user.id).sort((a, b) => b.createdAt - a.createdAt), query, ({ userId, ...x }) => ({ ...x, createdAt: iso(x.createdAt) })))
  route('GET', '/gifts', ({ query }) => {
    const category = query.get('category')
    return page(GIFTS.filter((g) => category == null || g.category === category).map((g) => ({ ...g, imageUrl: media(g.imageUrl) })), query)
  })
  route('POST', '/gifts/:id/purchases', ({ p, user, headers, out, body }) =>
    idempotent(headers, user, `POST /api/v1/gifts/${p.id}/purchases`, body, 201, out, () => {
      const gift = GIFTS.find((g) => g.id === p.id)
      if (!gift) throw rule('GIFT_UNAVAILABLE', 'Gift is unavailable')
      welcome(user)
      if (gift.requiredPoints > ranking(user.id).points) throw rule('REWARD_LOCKED', 'Earn more leaderboard points to unlock this reward')
      if (gift.onePerUser && db.purchases.some((x) => x.userId === user.id && x.giftId === gift.id)) throw new ApiError(409, 'REWARD_ALREADY_CLAIMED', 'This reward has already been claimed')
      const balance = db.wallets[user.id]
      if (balance < gift.priceRp) throw rule('INSUFFICIENT_RP', 'Not enough reward points')
      const now = Date.now()
      const purchase = { id: uuid(), userId: user.id, giftId: gift.id, giftName: gift.name, priceRp: gift.priceRp, voucherCode: `SST-${uuid()}`, createdAt: now }
      db.wallets[user.id] -= gift.priceRp
      db.purchases.push(purchase)
      if (gift.priceRp > 0) db.ledger.push({ id: uuid(), userId: user.id, delta: -gift.priceRp, reason: 'PURCHASE', roundId: null, purchaseId: purchase.id, createdAt: now })
      const { userId, ...pub } = purchase
      return { purchase: { ...pub, createdAt: iso(now) }, balanceRp: db.wallets[user.id] }
    }))
  route('GET', '/rewards/catalogue', ({ user }) => {
    welcome(user)
    return buildCatalogue({ balanceRp: db.wallets[user.id] ?? 0, ranking: ranking(user.id), gifts: GIFTS.map((g) => ({ ...g, imageUrl: media(g.imageUrl) })), claimedGiftIds: db.purchases.filter((x) => x.userId === user.id).map((x) => x.giftId) })
  })
  route('GET', '/me/profile', ({ user }) => profile(user))
  route('GET', '/me/round-history', ({ user, query }) => page(history(user.id), query))
  route('GET', '/leaderboard', ({ query }) => page(rankings(), query))
  route('GET', '/me/friends', ({ user, query }) => page((FRIENDS[user.username] ?? []).map(userByName).filter(Boolean).map(friend), query))
  route('GET', '/me/invitations', ({ user, query }) =>
    page(db.invitations.filter((i) => i.senderId === user.id || i.recipientId === user.id).sort((a, b) => b.createdAt - a.createdAt).map(invitation), query))
  route('POST', '/friends/:friendId/invitations', ({ p, body, user, headers, out }) => {
    if (!body?.roundId) throw new ApiError(400, 'VALIDATION_FAILED', 'roundId is required')
    return idempotent(headers, user, `POST /api/v1/friends/${p.friendId}/invitations`, body, 201, out, () => invite(user, p.friendId, body.roundId))
  })
  route('POST', '/invitations/:id/accept', ({ p, user }) => respond(user, p.id, true))
  route('POST', '/invitations/:id/decline', ({ p, user }) => respond(user, p.id, false))
  route('GET', '/dev/simulator', () => simStatus())
  route('POST', '/dev/simulator/start', ({ body }) => {
    if (!body?.roundId) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid request')
    return simStart(body.roundId)
  })
  route('POST', '/dev/simulator/stop', () => { sim.running = false; return simStatus() })
  route('POST', '/dev/rounds/:id/open', ({ p }) => openRound(requireRound(p.id)))
  route('POST', '/dev/rounds/:id/start', ({ p }) => startRound(requireRound(p.id), true))
  route('POST', '/dev/rounds/:id/settle', ({ p }) => settle(requireRound(p.id)))
  route('POST', '/dev/reset', () => { reset(); return { reset: true } })
  route('POST', '/dev/ghost-teams', ({ body }) => addGhost(body ?? {}))
  // ---------- community (CommunityController, read-only simulated content) ----------
  const community = createCommunity({
    users: Object.fromEntries(USERS.map((u) => [u.username, { displayName: u.displayName, avatarUrl: u.avatarUrl }])),
    fail: (status, code, message) => { throw new ApiError(status, code, message) },
    roundOf: (id) => requireRound(id),
    autoPick: (roundId, user) => {
      const pick = autoPick(requireRound(roundId), user, true)
      return { starters: pick.starters, captainPlayerId: pick.captainPlayerId }
    },
    mediaBase,
  })
  route('GET', '/leagues', ({ user, query }) => community.leagues(user.id, query.get('scope') ?? 'MINE', query.get('page') ?? 0, query.get('size') ?? 20))
  route('GET', '/leagues/:id', ({ p, user }) => community.detail(p.id, user.id))
  route('GET', '/leagues/:id/table', ({ p, user, query }) => community.table(p.id, user.id, query.get('page') ?? 0, query.get('size') ?? 20))
  route('GET', '/leagues/:id/rivalries', ({ p, user }) => community.rivalries(p.id, user.id))
  route('GET', '/leagues/:id/banter', ({ p, user, query }) => community.banter(p.id, user.id, query.get('page') ?? 0, query.get('size') ?? 20))
  route('GET', '/backing/managers', ({ user, query }) => {
    if (!query.get('roundId')) throw new ApiError(400, 'VALIDATION_FAILED', 'roundId is required')
    return community.managers(query.get('roundId'), user.id, query.get('filter') ?? 'ALL', query.get('page') ?? 0, query.get('size') ?? 20)
  })
  route('GET', '/rounds/:roundId/stream', ({ p, user }) => {
    const round = requireRound(p.roundId)
    return { [STREAM]: () => envelope(roundById(round.id) ?? round, user) }
  })

  /**
   * One API call. `headers` keys are lower-case. Returns { status, headers, body } — or, for the SSE
   * route, { status: 200, stream } where stream() builds the next ROUND_SNAPSHOT envelope.
   */
  async function handle({ method, url, headers = {}, body }) {
    const u = new URL(url, 'http://mock.local')
    const out = { status: 200, headers: { 'Content-Type': 'application/json' } }
    try {
      if (!u.pathname.startsWith('/api/v1/')) throw notFound()
      const match = routes.map((r) => ({ r, m: r.method === method && u.pathname.match(r.re) })).find((x) => x.m)
      const user = match?.r.auth === false ? undefined : authUser(headers)
      if (!match) throw notFound()
      const result = await match.r.fn({ p: match.m.groups ?? {}, query: u.searchParams, body, user, headers, out })
      if (result?.[STREAM]) return { status: 200, stream: result[STREAM] }
      if (method !== 'GET') onChange()
      return { ...out, body: result }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500
      if (!(e instanceof ApiError)) log(`[mock] ${method} ${u.pathname} failed: ${e.stack}`)
      return {
        status,
        headers: { 'Content-Type': 'application/json' },
        body: { code: e.code ?? 'INTERNAL_ERROR', message: e instanceof ApiError ? e.message : 'Unexpected server error', fieldErrors: e.fieldErrors ?? [], traceId: uuid().slice(0, 16) },
      }
    }
  }

  /** JSON-safe state for persistence (the browser keeps it in localStorage). */
  function serialize() {
    return { v: STATE_VERSION, autopilot, periodMs, db: { ...db, idem: [...db.idem] } }
  }
  function restore(saved) {
    if (saved?.v !== STATE_VERSION || saved.autopilot !== autopilot || saved.periodMs !== periodMs) return false
    db = { ...emptyDb(), ...saved.db, idem: new Map(saved.db.idem ?? []) }
    for (const u of USERS) db.wallets[u.id] ??= 0
    return true
  }

  simReset()
  if (!restore(state)) reset()
  tick()
  const scheduler = setInterval(() => {
    try {
      tick()
    } catch (e) {
      log(`[mock] scheduler failed: ${e.stack}`)
    }
  }, autopilot ? 500 : 1000)

  return {
    handle,
    reset,
    serialize,
    close() {
      clearInterval(scheduler)
      simReset()
    },
  }
}

const STREAM = Symbol('stream')
const STATE_VERSION = 2 // v2: reward catalogue, invitations
