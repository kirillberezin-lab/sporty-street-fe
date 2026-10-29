// Squad being built for a round (design 3.1–3.5). Kept locally until it is locked in.
import { reactive, watch } from 'vue'
import { store } from '../lib/util.js'
import { byPosition } from '../lib/players.js'
import { session } from './session.js'

const drafts = reactive({})

const key = (roundId) => `draft:${session.username}:${roundId}`

function blank() {
  return { starters: [], bench: null, captainId: null, explanation: null, fromTeamVersion: null }
}

export function useDraft(roundId) {
  const k = key(roundId)
  if (!drafts[k]) {
    drafts[k] = { ...blank(), ...store.get(k, {}) }
    watch(() => drafts[k], (v) => store.set(k, v), { deep: true })
  }
  return drafts[k]
}

export function clearDraft(roundId) {
  Object.assign(useDraft(roundId), blank())
}

/** Starts the draft from a saved team so it can be edited before the deadline. */
export function draftFromTeam(roundId, team) {
  const d = useDraft(roundId)
  Object.assign(d, {
    starters: team.starters.map((s) => s.player),
    bench: team.bench?.player ?? null,
    captainId: team.captainPlayerId,
    explanation: null,
    fromTeamVersion: team.version,
  })
  return d
}

export function draftFromAutoPick(roundId, pick) {
  const d = useDraft(roundId)
  Object.assign(d, {
    starters: [...pick.starters].sort(byPosition),
    bench: pick.bench ?? null,
    captainId: pick.captainPlayerId,
    explanation: pick.explanation ?? null,
  })
  return d
}

export function addStarter(d, player, { replaceId, max = 5 } = {}) {
  removeEverywhere(d, player.id)
  const i = replaceId ? d.starters.findIndex((p) => p.id === replaceId) : -1
  if (i >= 0) {
    if (d.captainId === replaceId) d.captainId = player.id
    d.starters.splice(i, 1, player)
  } else if (d.starters.length < max) {
    d.starters.push(player)
  } else {
    return false
  }
  d.starters.sort(byPosition)
  if (!d.captainId || !d.starters.some((p) => p.id === d.captainId)) d.captainId = d.starters[0]?.id ?? null
  return true
}

export function setBench(d, player) {
  removeEverywhere(d, player.id)
  d.bench = player
}

export function removePlayer(d, playerId) {
  removeEverywhere(d, playerId)
  if (d.captainId === playerId) d.captainId = d.starters[0]?.id ?? null
}

function removeEverywhere(d, playerId) {
  d.starters = d.starters.filter((p) => p.id !== playerId)
  if (d.bench?.id === playerId) d.bench = null
}

/** Client-side checks mirroring the backend rules; the backend stays the source of truth. */
export function validate(d, rules, homeCountryId) {
  const need = rules?.starterCount ?? 5
  const errors = []
  const countries = new Map()
  for (const p of d.starters) countries.set(p.countryId, (countries.get(p.countryId) ?? 0) + 1)
  const dupes = [...countries.entries()].filter(([, n]) => n > 1)
  if (d.starters.length < need) errors.push(`Pick ${need - d.starters.length} more starter${need - d.starters.length > 1 ? 's' : ''}`)
  if ((rules?.distinctStarterCountries ?? true) && dupes.length) errors.push('Each starter must be from a different country')
  if (!d.bench) errors.push('Pick a bench player')
  if (d.starters.some((p) => p.eligible === false) || d.bench?.eligible === false) errors.push('A picked player is not in this round')
  const hero = homeCountryId ? d.starters.find((p) => p.countryId === homeCountryId) ?? null : null
  return {
    ok: errors.length === 0,
    errors,
    missing: Math.max(0, need - d.starters.length) + (d.bench ? 0 : 1),
    need,
    hero,
    countryIds: [...countries.keys()],
  }
}

export function lineupBody(d) {
  return {
    starterPlayerIds: d.starters.map((p) => p.id),
    benchPlayerId: d.bench?.id,
    captainPlayerId: d.captainId,
  }
}
