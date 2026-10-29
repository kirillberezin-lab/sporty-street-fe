// Human copy for the round rules returned by the backend (Rules schema).
import { humanize } from './format.js'

const EVENT_COPY = {
  APPEARANCE: 'Appearance', GOAL: 'Goal', ASSIST: 'Assist', YELLOW_CARD: 'Yellow card', RED_CARD: 'Red card', OWN_GOAL: 'Own goal',
}
const ORDER = ['APPEARANCE', 'GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD', 'OWN_GOAL']

export function scoringRows(rules) {
  const base = rules?.base ?? {}
  return Object.keys(base)
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    .map((k) => ({ key: k, label: EVENT_COPY[k] ?? humanize(k), points: base[k] }))
}

/** { title: "Late goals ×2", short: "Late goals ×2 (75'+)", detail } */
export function twistCopy(rules) {
  const t = rules?.twist
  if (!t) return null
  const mult = t.multiplier ?? 2
  const goal = rules?.base?.GOAL ?? 5
  const type = String(t.type ?? '').toUpperCase()
  if (type.includes('LATE') || t.fromMatchMinute != null) {
    const from = t.fromMatchMinute ?? 75
    return {
      title: `Late goals ×${mult}`,
      short: `Late goals ×${mult} (${from}'+)`,
      from,
      detail: `Goals from the ${from}th minute are worth ${goal * mult} instead of ${goal}, before the captain multiplier.`,
    }
  }
  return { title: `${humanize(type)} ×${mult}`, short: `${humanize(type)} ×${mult}`, from: null, detail: 'Announced before entry, applies to every squad.' }
}

export function homeHeroCopy(rules) {
  const hh = rules?.homeHero
  const goal = hh?.GOAL ?? 2
  const assist = hh?.ASSIST ?? goal
  const pts = goal === assist ? `+${goal} per goal or assist` : `+${goal} per goal, +${assist} per assist`
  return { pts, bonus: goal, outside: hh?.multiplied === false }
}

/** Worked example from the README: a home captain's late goal 5×2×2+2 = 22. */
export function bestCaseExample(rules) {
  const goal = rules?.base?.GOAL ?? 5
  const late = rules?.twist?.multiplier ?? 2
  const cap = rules?.captainMultiplier ?? 2
  const hh = rules?.homeHero?.GOAL ?? 2
  return { formula: `${goal}×${late}×${cap}+${hh}`, total: goal * late * cap + hh }
}
