// Install prompt, standalone detection and service worker registration.
import { reactive } from 'vue'

const ua = navigator.userAgent
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const iosVersion = (() => {
  const m = ua.match(/OS (\d+)_(\d+)/)
  return m ? Number(m[1]) + Number(m[2]) / 100 : null
})()

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

export const pwa = reactive({
  installed: standalone(),
  canInstall: false,
  isIOS,
  iosVersion,
  isAndroid: /Android/i.test(ua),
  secure: window.isSecureContext,
  swSupported: 'serviceWorker' in navigator,
  registration: null,
  needRefresh: false,
})

let deferredPrompt = null
let updateSW = null

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    pwa.canInstall = true
  })
  window.addEventListener('appinstalled', () => {
    pwa.installed = true
    pwa.canInstall = false
    deferredPrompt = null
  })
  matchMedia('(display-mode: standalone)').addEventListener?.('change', () => (pwa.installed = standalone()))

  if (pwa.swSupported) {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateSW = registerSW({
          immediate: true,
          onNeedRefresh: () => (pwa.needRefresh = true),
          onRegisteredSW: (_url, reg) => (pwa.registration = reg ?? null),
          onRegisterError: (e) => console.warn('Service worker registration failed', e),
        })
      })
      .catch((e) => console.warn('PWA register unavailable', e))
  }
}

/** Native install dialog where supported (Chrome/Edge/Samsung). iOS needs Share → Add to Home Screen. */
export async function promptInstall() {
  if (!deferredPrompt) return null
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  pwa.canInstall = false
  return outcome
}

export function applyUpdate() {
  updateSW?.(true)
}

/** Resolves the active registration, or null when there is none within `ms`. */
export async function swRegistration(ms = 4000) {
  if (!pwa.swSupported) return null
  if (pwa.registration?.active) return pwa.registration
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), ms))])
}
