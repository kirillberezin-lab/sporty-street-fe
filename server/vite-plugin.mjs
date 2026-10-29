// Wires the dev-only backend helpers into `vite` and `vite preview`:
//  - MOCK_API=1 starts server/mock-api.mjs on its own port and /api is proxied to it;
//  - the push relay answers /api/v1/push/* until the backend implements Web Push itself.
// Both live for the whole Node process: Vite re-imports this file on every config restart,
// so the instances are kept on globalThis instead of being tied to one server.
import { startMockApi } from './mock-api.mjs'
import { createPushRelay } from './push-relay.mjs'

const shared = (globalThis.__sportyDev ??= { mock: null, relay: null, relayBase: null })

export function sportyDevServer({ apiTarget, mock, mockPort, minuteMs, subDelaySeconds, mediaDir, pushRelay = true, vapidSubject }) {
  async function setup(server) {
    const log = (msg) => server.config.logger.info(msg, { timestamp: true })
    if (mock && !shared.mock) {
      shared.mock = startMockApi({ port: mockPort, minuteMs, subDelaySeconds, mediaDir, log }).then((handle) => {
        log(handle ? `[mock] Sporty Street mock API on ${apiTarget}` : `[mock] port ${mockPort} is busy, using the running instance`)
        return handle
      })
    }
    await shared.mock
    if (pushRelay) {
      if (shared.relay && shared.relayBase !== apiTarget) {
        shared.relay.close()
        shared.relay = null
      }
      shared.relay ??= createPushRelay({ apiBase: apiTarget, log, ...(vapidSubject ? { subject: vapidSubject } : {}) })
      shared.relayBase = apiTarget
      // Registered before Vite's proxy, so /api/v1/push/* is answered here and the rest goes to the backend.
      const relay = shared.relay
      server.middlewares.use((req, res, next) => relay.middleware(req, res, next))
    }
  }

  return {
    name: 'sporty-dev-server',
    configureServer: setup,
    configurePreviewServer: setup,
  }
}
