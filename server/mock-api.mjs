// Local mock of the Sporty Street backend over HTTP. The logic lives in src/mock/core.js, shared with
// the static (GitHub Pages) build, which runs the same core in the browser.
//
// Standalone: `npm run mock` (port 8090). With Vite: `npm run dev:mock`.
// Player photos: set MOCK_MEDIA_DIR to the backend's src/main/resources/static/media.
// MOCK_AUTOPILOT=1 runs the clock-driven schedule of the static build instead of Demo controls.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createMockCore } from '../src/mock/core.js'

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' }

export function createMockApi({ mediaDir = null, log = () => {}, ...options } = {}) {
  const core = createMockCore({ log, ...options })

  async function readBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return { body: undefined }
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw) return { body: undefined }
    try {
      return { body: JSON.parse(raw) }
    } catch {
      return { error: { code: 'VALIDATION_FAILED', message: 'Malformed or missing request value', fieldErrors: [] } }
    }
  }

  function stream(res, req, next) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const send = () => res.write(`event:ROUND_SNAPSHOT\ndata:${JSON.stringify(next())}\n\n`)
    send()
    const timer = setInterval(send, 2000)
    const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 20_000)
    req.on('close', () => { clearInterval(timer); clearInterval(heartbeat) })
  }

  /** Public player photos and credits (`GET/HEAD /media/players/**`), served from MOCK_MEDIA_DIR. */
  function media(req, res, url) {
    const root = mediaDir && path.resolve(mediaDir)
    const file = root && path.resolve(root, `.${decodeURIComponent(url.pathname.replace(/^\/media/, ''))}`)
    if (!file || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, 'http://mock.local')
    if (url.pathname.startsWith('/media/players/') && (req.method === 'GET' || req.method === 'HEAD')) return media(req, res, url)
    if (!url.pathname.startsWith('/api/v1/')) {
      if (next) return next()
      res.statusCode = 404
      return res.end()
    }
    const { body, error } = await readBody(req)
    const out = error
      ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: error }
      : await core.handle({ method: req.method, url: req.url, headers: req.headers, body })
    if (out.stream) return stream(res, req, out.stream)
    res.statusCode = out.status
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
    res.end(JSON.stringify(out.body))
  }

  return { handler, reset: core.reset, close: core.close }
}

/** Starts the mock on its own port. Resolves to null when the port is taken (already running). */
export function startMockApi({ port = 8090, ...options } = {}) {
  const api = createMockApi(options)
  const server = http.createServer((req, res) => api.handler(req, res))
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        api.close()
        resolve(null)
      } else reject(e)
    })
    server.listen(port, () => resolve({ server, api, close: () => { api.close(); server.close() } }))
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.MOCK_API_PORT || 8090)
  const started = await startMockApi({
    port,
    minuteMs: Number(process.env.MOCK_MINUTE_MS || 2000),
    subDelaySeconds: Number(process.env.MOCK_SUB_DELAY_S || 60),
    autopilot: process.env.MOCK_AUTOPILOT === '1',
    mediaDir: process.env.MOCK_MEDIA_DIR || null,
    log: console.log,
  })
  console.log(started ? `Mock Sporty Street API on http://localhost:${port}/api/v1` : `Port ${port} is busy`)
}
