// The app can live under a sub-path (GitHub Pages project site: /<repo>/), so links and public
// files go through these helpers instead of hard-coded "/…" paths.
export const BASE = import.meta.env.BASE_URL

/** Public file: asset('pwa-192x192.png') → '/<base>/pwa-192x192.png' */
export const asset = (path) => `${BASE}${String(path).replace(/^\//, '')}`

/** Absolute link to an app route, for sharing: appUrl('/c/abc') → 'https://host/<base>/c/abc' */
export const appUrl = (path = '/') => `${location.origin}${asset(path)}`
