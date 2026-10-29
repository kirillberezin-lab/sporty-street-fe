// Attribution for the backend's player photos (Wikimedia Commons, mostly CC BY-SA).
// The backend README asks to keep these credits wherever the photos are shown.
import { reactive } from 'vue'

export const credits = reactive({ list: [], loaded: false, error: null })
let inflight = null

export function loadCredits() {
  if (credits.loaded) return Promise.resolve(credits.list)
  inflight ??= fetch('/media/players/credits.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Photo credits unavailable (${r.status})`)
      return r.json()
    })
    .then((list) => {
      credits.list = Array.isArray(list) ? list : []
      credits.loaded = true
      return credits.list
    })
    .catch((e) => {
      credits.error = e
      inflight = null
      return []
    })
  return inflight
}

export const creditFor = (imageUrl) => (imageUrl ? credits.list.find((c) => c.imageUrl === imageUrl) ?? null : null)
