// Showcase matchdays for demos. When the backend has fewer than three open rounds (the hosted demo
// backend can sit on one LIVE round for hours), the Play list is topped up with these rounds so the
// squad builder always has something to build for. They borrow players and rules from a real round,
// never reach the server (no entries, no scoring): the builder saves them as practice squads.
const DEFS = [
  { id: '5c0a5e00-0000-4000-8000-000000000001', name: 'Champions Night', clubs: null, hoursAhead: 2, twistFrom: 75 },
  { id: '5c0a5e00-0000-4000-8000-000000000002', name: 'Spanish Heroes', clubs: ['Real Madrid', 'FC Barcelona'], hoursAhead: 5, twistFrom: 70 },
  { id: '5c0a5e00-0000-4000-8000-000000000003', name: 'Premier Power', clubs: ['Manchester City', 'Liverpool'], hoursAhead: 26, twistFrom: 75 },
  { id: '5c0a5e00-0000-4000-8000-000000000004', name: 'Euro Giants', clubs: ['Bayern Munich', 'Paris Saint-Germain'], hoursAhead: 50, twistFrom: 80 },
]
const MIN_OPEN = 3

export const isShowcaseId = (id) => DEFS.some((d) => d.id === id)

const registry = new Map() // id -> { round, sourceId, clubIds }

/** Builds the showcase rounds missing from `list` (backend rounds). Returns them. */
export function showcaseRounds(list) {
  const open = list.filter((r) => r.status === 'OPEN')
  if (open.length >= MIN_OPEN) return []
  // Players and rules come from the real round with the most fixtures.
  const source = [...list].filter((r) => r.fixtures?.length).sort((a, b) => b.fixtures.length - a.fixtures.length)[0]
  if (!source) return []
  const hour = Math.ceil(Date.now() / 3600_000) * 3600_000
  const out = []
  for (const d of DEFS) {
    if (open.length + out.length >= MIN_OPEN + 1) break
    if (open.some((r) => r.name === d.name)) continue
    const fixtures = source.fixtures.filter((f) => !d.clubs || (d.clubs.includes(f.homeClubName) && d.clubs.includes(f.awayClubName)))
    if (!fixtures.length) continue
    const deadline = new Date(hour + d.hoursAhead * 3600_000).toISOString()
    const round = {
      id: d.id, name: d.name, status: 'OPEN', entryDeadline: deadline, subWindowOpensAt: deadline,
      subWindowClosesAt: new Date(Date.parse(deadline) + 6 * 3600_000).toISOString(),
      rules: { ...source.rules, twist: { ...(source.rules?.twist ?? {}), fromMatchMinute: d.twistFrom } },
      stateVersion: 0, serverTime: new Date().toISOString(),
      fixtures: fixtures.map((f) => ({ ...f, roundId: d.id, kickoffAt: deadline })),
      format: 'MATCHDAY', matchCount: fixtures.length, participantCount: 0, simulated: true, showcase: true,
    }
    registry.set(d.id, { round, sourceId: source.id, clubIds: new Set(fixtures.flatMap((f) => [f.homeClubId, f.awayClubId])) })
    out.push(round)
  }
  return out
}

/** Registry entry for a showcase id, building it from the backend's rounds when needed. */
export async function showcase(id, loadRounds) {
  if (!registry.has(id)) {
    const [active, settled] = await Promise.all([loadRounds(), loadRounds({ status: 'SETTLED' }).catch(() => ({ items: [] }))])
    showcaseRounds([...(active.items ?? []), ...(settled.items ?? [])])
  }
  return registry.get(id) ?? null
}
