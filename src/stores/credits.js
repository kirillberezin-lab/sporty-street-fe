// Attribution for the backend's photos — players, profile avatars, league art (Wikimedia Commons).
// The backend README asks to keep these credits wherever the photos are shown.
import { reactive } from 'vue'
import { asset } from '../lib/url.js'

export const credits = reactive({ list: [], loaded: false, error: null })
let inflight = null

// Players are required; avatars and league art exist from the community update on.
const FILES = ['players', 'avatars', 'leagues']
const fetchList = (dir) => fetch(asset(`media/${dir}/credits.json`)).then((r) => {
  if (!r.ok) throw new Error(`Photo credits unavailable (${r.status})`)
  return r.json()
})

export function loadCredits() {
  if (credits.loaded) return Promise.resolve(credits.list)
  inflight ??= Promise.all(FILES.map((dir, i) => fetchList(dir).then(
    (list) => (Array.isArray(list) ? list : []).map((c) => ({ ...c, kind: dir, title: c.player ?? c.subject ?? c.key })),
    (e) => { if (i === 0) throw e; return [] },
  )))
    .then((lists) => {
      // credits.json lists root paths (/media/…); the app may live under a sub-path.
      credits.list = lists.flat().map((c) => ({ ...c, imageUrl: c.imageUrl?.startsWith('/') ? asset(c.imageUrl) : c.imageUrl }))
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
