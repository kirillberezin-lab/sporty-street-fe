// Client-side auto-pick. The backend's /auto-pick takes the first five countries in name order
// (no positions, same squad every time), so the app builds a balanced, varied pick itself
// and only falls back to the backend when this can't find five countries.
import { positionCode } from './players.js'

// Matches the empty pitch: FW · MF MF · DF · GK.
const SLOTS = ['FW', 'MF', 'MF', 'DF', 'GK']
const ATTACK = ['FW', 'MF']

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * @param players round player pool (`GET /rounds/{id}/players`)
 * @returns {{ starters, bench, captainPlayerId, explanation } | null}
 */
export function smartPick(players, { homeCountryId = null, previousIds = [] } = {}) {
  // Players from the previous pick go last, so "Re-pick" really changes the squad.
  const before = new Set(previousIds)
  const pool = shuffle(players.filter((p) => p.eligible !== false)).sort((a, b) => before.has(a.id) - before.has(b.id))
  const pos = (p) => positionCode(p.position)
  const slots = [...SLOTS]
  const starters = []
  const countries = new Set()
  const take = (p) => {
    starters.push(p)
    countries.add(p.countryId)
    slots.splice(slots.indexOf(pos(p)), 1)
  }

  // Home Hero first, ideally someone who scores.
  const homers = pool.filter((p) => p.countryId === homeCountryId)
  const hero = homers.find((p) => ATTACK.includes(pos(p))) ?? homers[0]
  if (hero) take(hero)

  for (const slot of [...slots]) {
    const p = pool.find((x) => pos(x) === slot && !countries.has(x.countryId) && !starters.includes(x))
    if (p) take(p)
  }
  // Not enough countries in some position: fill with anyone from a new country.
  while (starters.length < 5) {
    const p = pool.find((x) => !countries.has(x.countryId) && !starters.includes(x))
    if (!p) return null
    starters.push(p)
    countries.add(p.countryId)
  }

  // A bench player from a sixth country can replace any starter during the live sub.
  const rest = pool.filter((p) => !starters.includes(p))
  const bench = rest.find((p) => !countries.has(p.countryId) && ATTACK.includes(pos(p))) ?? rest.find((p) => !countries.has(p.countryId)) ?? rest[0]
  if (!bench) return null

  const captain = (hero && pos(hero) === 'FW' ? hero : null) ?? starters.find((p) => pos(p) === 'FW') ?? starters.find((p) => pos(p) === 'MF') ?? starters[0]
  const explanation = [
    'Balanced five from five countries',
    hero === captain ? `${hero.name} is your Home Hero and captain` : hero ? `${hero.name} is your Home Hero` : null,
    hero === captain ? null : `${captain.name} captains`,
    countries.has(bench.countryId) ? null : 'your bench can replace anyone',
  ].filter(Boolean).join(' · ')
  return { starters, bench, captainPlayerId: captain.id, explanation: `${explanation}.` }
}
