import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { sportyDevServer } from './server/vite-plugin.mjs'

const siblingMedia = fileURLToPath(new URL('../sporty-street/src/main/resources/static/media', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const mock = env.MOCK_API === '1' || env.MOCK_API === 'true'
  // Static build (GitHub Pages): the API runs in the browser, see src/api/local.js.
  const isStatic = env.VITE_STATIC === '1'
  // Sub-path of a GitHub Pages project site, e.g. BASE_PATH=/sporty-street-fe/
  const base = `/${(env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
  const mockPort = Number(env.MOCK_API_PORT || 8090)
  const apiTarget = mock ? `http://localhost:${mockPort}` : env.API_TARGET || 'http://localhost:8080'

  // Same-origin proxy: the backend has no CORS config and relies on the session cookie (README).
  // Host is preserved so Spring sees a same-origin request; SSE is streamed without buffering.
  // /media serves the backend's player photos (imageUrl is a same-origin path like /media/players/x.jpg).
  // A hosted backend (API_TARGET=https://….onrender.com) is routed by its Host header, so the
  // origin must be rewritten there; a local backend keeps the browser's Host.
  const remoteTarget = !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(apiTarget)
  const proxy = {
    '/api': { target: apiTarget, changeOrigin: remoteTarget, xfwd: true, secure: true },
    // Photos bundled in public/media (players, avatars, league art) are served first; the rest goes
    // to the backend. Older backends lack avatars/leagues, and the bundle makes no round trip.
    '/media': { target: apiTarget, changeOrigin: remoteTarget, bypass: (req) => (existsSync(fileURLToPath(new URL(`./public${decodeURIComponent(req.url.split('?')[0])}`, import.meta.url))) ? req.url : undefined) },
  }
  // HTTPS tunnels are needed to test the PWA (install + push) on a real phone; Render hosts the demo.
  // More hosts: ALLOWED_HOSTS=a.example.com,.example.org
  const allowedHosts = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.loca.lt', '.onrender.com', ...(env.ALLOWED_HOSTS ?? '').split(',').filter(Boolean)]

  // Link previews (WhatsApp, Telegram) need an absolute og:image URL.
  const absoluteOgImage = {
    name: 'absolute-og-image',
    transformIndexHtml: (html) => html.replace('content="/og-image.png"', `content="${(env.PUBLIC_URL ?? '').replace(/\/$/, '')}${base}og-image.png"`),
  }

  return {
    base,
    plugins: [
      vue(),
      absoluteOgImage,
      !isStatic && sportyDevServer({
        apiTarget,
        mock,
        mockPort,
        minuteMs: Number(env.MOCK_MINUTE_MS || 2000),
        subDelaySeconds: Number(env.MOCK_SUB_DELAY_S || 60),
        // Photos for the mock come from the sibling backend checkout when it is there.
        mediaDir: env.MOCK_MEDIA_DIR || (existsSync(siblingMedia) ? siblingMedia : null),
        pushRelay: env.PUSH_RELAY !== '0',
        vapidSubject: env.VAPID_SUBJECT,
      }),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'prompt',
        injectRegister: false,
        includeManifestIcons: false, // already matched by globPatterns below
        manifest: {
          id: base,
          name: 'SportyStreet',
          short_name: 'SportyStreet',
          description: 'Your five. Your country. Your moment. Five-a-side live fantasy football.',
          lang: 'en',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#E41827',
          background_color: '#E41827',
          categories: ['sports', 'games', 'entertainment'],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Play', url: `${base}play`, icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
            { name: 'Rewards', url: `${base}rewards`, icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          ],
        },
        injectManifest: {
          // App shell + icons + latin font subsets; the OG image is only for link previews.
          globPatterns: ['**/*.{js,css,html,svg,png,ico}', '**/*-latin-[0-9]*.woff2'],
          // Player photos and partner banners are cached at runtime (sw.js), not precached.
          globIgnores: ['og-image.png', 'media/**', 'rewards/**'],
        },
        devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
      }),
    ],
    // The static build has no backend to proxy to; photos come from public/media.
    server: { proxy: isStatic ? undefined : proxy, allowedHosts },
    preview: { proxy: isStatic ? undefined : proxy, allowedHosts },
  }
})
