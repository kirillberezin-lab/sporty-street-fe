// Who is playing. The backend only has mock auth in the local profile (README), and the sign-in
// screens (design 1.3–1.5) were dropped, so the app signs in a seeded demo user automatically.
import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ApiError, onUnauthorized } from '../api/client.js'
import { store } from '../lib/util.js'

// Seeded users of the backend's local profile (DemoSeed): home countries drive the Home Hero.
export const DEMO_USERS = [
  { username: 'alice', note: 'Brazil' },
  { username: 'bob', note: 'France · rival team in round 1' },
  { username: 'carol', note: 'England · rival team in round 1' },
  { username: 'dave', note: 'Spain' },
  { username: 'eve', note: 'Argentina' },
  { username: 'frank', note: 'Germany' },
  { username: 'grace', note: 'No home country' },
  { username: 'henry', note: 'No home country' },
]

export const session = reactive({
  status: 'idle', // idle | loading | ready | error
  error: null,
  user: null,
  rules: null,
  countryName: null,
  username: store.get('demoUser', import.meta.env.VITE_DEMO_USER || 'alice'),
  onboarded: store.get('onboarded', false),
  epoch: 0, // bumps when the user changes so stores reload
})

onUnauthorized(() => login(session.username))

export async function login(username) {
  const user = await api.login(username)
  session.user = user
  session.username = user.username
  store.set('demoUser', user.username)
  return user
}

export async function boot() {
  session.status = 'loading'
  session.error = null
  try {
    try {
      session.user = await api.me()
      if (session.user.username !== session.username) await login(session.username)
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e
      await login(session.username)
    }
    session.rules = await api.rules().catch(() => null)
    session.status = 'ready'
  } catch (e) {
    session.error = e
    session.status = 'error'
  }
}

export async function switchUser(username) {
  await login(username)
  session.countryName = null
  session.epoch += 1
}

export function finishOnboarding() {
  session.onboarded = true
  store.set('onboarded', true)
}

/** Key prefix for per-user local data. */
export const userKey = (name) => `${session.username}:${name}`
