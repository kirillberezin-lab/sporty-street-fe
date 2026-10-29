<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './components/Icon.vue'
import ToastHost from './components/ToastHost.vue'
import { lockReminder } from './lib/liveDiff.js'
import { applyUpdate, pwa } from './lib/pwa.js'
import { demo, loadDemo } from './stores/demo.js'
import { closeAllLive, watchLiveRounds } from './stores/live.js'
import { handleAlerts, initNotify, loadInbox, syncPush } from './stores/notify.js'
import { loadRounds, resetRounds, rounds } from './stores/rounds.js'
import { resetRewards } from './stores/rewards.js'
import { boot, session } from './stores/session.js'
import { toast } from './stores/ui.js'

const router = useRouter()
const transition = ref('fade')
const updateDismissed = ref(false)
let lastPosition = window.history.state?.position ?? 0

router.afterEach((to, from) => {
  const position = window.history.state?.position ?? 0
  transition.value = to.meta.tab && from.meta?.tab ? 'fade' : position < lastPosition ? 'pop' : from.matched.length ? 'push' : 'fade'
  lastPosition = position
})

function hideSplash() {
  const el = document.getElementById('boot-splash')
  if (!el) return
  el.classList.add('hide')
  setTimeout(() => el.remove(), 400)
}

// Lock reminders while the app is open (the push relay covers the closed app).
const reminded = new Set()
function checkLockReminders() {
  for (const r of rounds.list) {
    if (reminded.has(r.id)) continue
    const alert = lockReminder(r, rounds.teams[r.id])
    if (alert) {
      reminded.add(r.id)
      handleAlerts([alert])
    }
  }
}

async function start() {
  await boot()
  if (session.status !== 'ready') {
    hideSplash()
    return
  }
  loadDemo()
  await initNotify()
  await router.isReady()
  hideSplash()
  loadRounds()
}

watch(() => rounds.list.map((r) => `${r.id}:${r.status}:${Boolean(rounds.teams[r.id])}`).join(','), () => {
  watchLiveRounds()
  checkLockReminders()
})

watch(() => session.epoch, async () => {
  closeAllLive()
  resetRounds()
  resetRewards()
  loadDemo()
  loadInbox()
  syncPush().catch(() => {})
  await loadRounds()
})

let timers = []
onMounted(() => {
  start()
  timers.push(setInterval(checkLockReminders, 60_000))
  // Responsible play: gentle nudge after an hour in the app (Settings → Daily time reminder).
  timers.push(setTimeout(() => demo.timeReminder && toast({ title: "You've played for an hour", body: 'Time for a break? Your squad keeps running.', duration: 8000 }), 3600_000))
  if (pwa.swSupported) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate' && e.data.url) router.push(e.data.url)
    })
  }
})
onBeforeUnmount(() => timers.forEach((t) => clearInterval(t)))
</script>

<template>
  <div id="sheets" />
  <template v-if="session.status === 'ready'">
    <RouterView v-slot="{ Component, route }">
      <Transition :name="transition">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </template>
  <div v-else-if="session.status === 'error'" class="screen on-red boot-error">
    <div class="col g16 items-center tc" style="padding: 32px 24px; margin: auto">
      <div class="mark">S5</div>
      <span class="disp" style="font-size: 34px">Can't reach the game server</span>
      <span class="sm" style="opacity: .9; line-height: 1.5">{{ session.error?.message }}<br />Start the backend (<code>npm run backend</code>) or run <code>npm run dev:mock</code>.</span>
      <button class="btn wht" style="width: 220px" @click="start"><Icon name="refresh" :size="18" />Try again</button>
    </div>
  </div>

  <ToastHost />
  <Transition name="toast">
    <div v-if="pwa.needRefresh && !updateDismissed" class="update-bar">
      <span class="sm b f1">A new version of SportyStreet is ready</span>
      <button class="btn xs wht" @click="applyUpdate">Reload</button>
      <button class="icon-btn" aria-label="Later" style="margin: -8px -4px -8px 0" @click="updateDismissed = true"><Icon name="close" :size="18" /></button>
    </div>
  </Transition>
</template>

<style>
#sheets { position: absolute; inset: 0; pointer-events: none; z-index: 60; }
#sheets > * { pointer-events: auto; }
.boot-error .mark { width: 88px; height: 88px; border-radius: 26px; background: #fff; color: var(--red); display: flex; align-items: center; justify-content: center; font: 900 italic 48px 'Barlow Condensed', sans-serif; }
.boot-error code { background: rgba(0, 0, 0, .2); border-radius: 6px; padding: 1px 5px; font-size: 12px; }
.update-bar {
  position: absolute; left: 12px; right: 12px; top: calc(64px + var(--safe-top)); z-index: 55; display: flex; align-items: center; gap: 10px;
  background: var(--ink); color: #fff; border-radius: 16px; padding: 10px 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
}
</style>
