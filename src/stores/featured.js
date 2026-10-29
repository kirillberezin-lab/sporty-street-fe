// Real catalogue players by name, for illustrative screens (onboarding, creator fives) that should
// show the same photos as the game. Loaded once from the first round the API lists.
import { reactive } from 'vue'
import { api } from '../api/index.js'

export const featured = reactive({ byName: {}, loaded: false })
let inflight = null

export function loadFeatured() {
  if (featured.loaded) return Promise.resolve(featured.byName)
  inflight ??= (async () => {
    const open = await api.rounds().catch(() => null)
    const round = open?.items?.[0] ?? (await api.rounds({ status: 'SETTLED' }).catch(() => null))?.items?.[0]
    if (!round) return featured.byName
    for (const p of (await api.players(round.id)).items ?? []) featured.byName[p.name] = p
    featured.loaded = true
    return featured.byName
  })()
    .catch(() => featured.byName)
    .finally(() => (inflight = null))
  return inflight
}

/** Catalogue player, or a name-only stand-in so avatars fall back to initials. */
export const featuredPlayer = (name, color) => featured.byName[name] ?? { name, clubName: '', imageUrl: null, ...(color ? { color } : {}) }
