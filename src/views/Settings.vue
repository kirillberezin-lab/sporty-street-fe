<script setup>
// Settings (design 9.3) + demo tools: switch the seeded user and drive a round through
// the backend's local-profile controls (open → start → simulator → settle).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/index.js'
import AlertsSheet from '../components/AlertsSheet.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Flag from '../components/Flag.vue'
import Icon from '../components/Icon.vue'
import InstallSheet from '../components/InstallSheet.vue'
import Toggle from '../components/Toggle.vue'
import TopBar from '../components/TopBar.vue'
import { longDate } from '../lib/format.js'
import { roundPhase } from '../lib/liveDiff.js'
import { pwa } from '../lib/pwa.js'
import { demo } from '../stores/demo.js'
import { capability, disablePush, notify, savePrefs, syncPush, testAlert } from '../stores/notify.js'
import { loadRounds, rounds } from '../stores/rounds.js'
import { DEMO_USERS, session, switchUser } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const router = useRouter()
const alertsOpen = ref(false)
const installOpen = ref(false)
const usersOpen = ref(false)
const breakOpen = ref(false)
const busy = ref('')
const sim = ref(null)
const devOk = ref(true)
const roundId = ref(null)
// GET /rounds never lists DRAFT rounds, so the seed's second round ("Champions Night") is looked up
// by its deterministic id — DemoSeed.id("round:2") = UUID.nameUUIDFromBytes("round:2").
const SEED_DRAFT_ROUNDS = ['16a8a2a1-351b-31f0-b9c9-291d59ff415c']
const draftRounds = ref([])
async function loadDraftRounds() {
  const found = await Promise.all(SEED_DRAFT_ROUNDS.map((id) => api.round(id).catch(() => null)))
  draftRounds.value = found.filter((r) => r && roundPhase(r.status) === 'scheduled')
  for (const r of draftRounds.value) rounds.byId[r.id] = r
}
const roundOptions = computed(() => [...rounds.list, ...draftRounds.value.filter((d) => !rounds.list.some((r) => r.id === d.id))])

onMounted(async () => {
  await loadRounds()
  roundId.value = rounds.list.find((r) => roundPhase(r.status) === 'live')?.id ?? rounds.list.find((r) => roundPhase(r.status) === 'open')?.id ?? rounds.list[0]?.id
  refreshSim()
  loadDraftRounds().then(() => (roundId.value ??= draftRounds.value[0]?.id ?? null))
})

async function refreshSim() {
  try {
    sim.value = await api.dev.simulator()
  } catch {
    devOk.value = false
  }
}

const cap = computed(() => capability())
const alertsOn = computed(() => notify.permission === 'granted' && notify.prefs.enabled !== false)
const pushLabel = computed(() => {
  if (!alertsOn.value) return cap.value.level === 'ok' ? 'Off' : cap.value.text
  if (notify.pushActive) return `Web Push active${notify.provider === 'dev-relay' ? ' (dev relay)' : ''} · works with the app closed`
  return 'In-app + while the app is open · no push server'
})
const selected = computed(() => rounds.byId[roundId.value])
const phase = computed(() => roundPhase(selected.value?.status))
const onBreak = computed(() => demo.breakUntil && Date.parse(demo.breakUntil) > Date.now())

function setPref(key, v) {
  notify.prefs[key] = v
  savePrefs()
}
async function masterToggle(v) {
  if (v && notify.permission !== 'granted') {
    alertsOpen.value = true
    return
  }
  notify.prefs.enabled = v
  savePrefs()
  if (v) {
    await syncPush({ create: true }).catch((e) => (notify.lastError = e.message))
    toast({ title: 'Alerts on', tone: 'success', duration: 2000 })
  } else {
    await disablePush()
    toast({ title: 'Alerts off', body: 'In-app banners stay on while you play.' })
  }
}
async function test() {
  busy.value = 'test'
  try {
    const res = await testAlert({ title: 'Sub moment ⚡', body: 'Pedri was booked and may come off. Gavi is on your bench — swap now?' })
    toast({
      title: res.via === 'push' ? 'Push sent — lock your phone' : res.via === 'local' ? 'Notification in 5 seconds' : 'Alert shown in-app',
      body: res.via === 'push' ? `Arrives in ~5 s on ${res.scheduled} device(s), even with SportyStreet closed.` : res.via === 'local' ? 'Switch to another app to see it as a system notification.' : 'Turn on alerts to get system notifications.',
      tone: 'success',
    })
  } catch (e) {
    toastError(e, 'Test failed')
  } finally {
    busy.value = ''
  }
}

async function pickUser(u) {
  usersOpen.value = false
  if (u === session.username) return
  try {
    await switchUser(u)
    toast({ title: `Playing as ${session.user.displayName}`, tone: 'success' })
    router.replace('/')
  } catch (e) {
    toastError(e, 'Could not switch user')
  }
}

function takeBreak(days) {
  demo.breakUntil = days ? new Date(Date.now() + days * 86400_000).toISOString() : null
  breakOpen.value = false
  toast({ title: days ? `Break until ${longDate(demo.breakUntil)}` : 'Break cancelled', body: days ? 'New entries are paused. Your data is safe.' : 'Welcome back!' })
}

async function dev(kind) {
  busy.value = kind
  try {
    const id = roundId.value
    if (kind === 'open') await api.dev.openRound(id)
    if (kind === 'start') await api.dev.startRound(id)
    if (kind === 'sim') await api.dev.simulatorStart(id)
    if (kind === 'stop') await api.dev.simulatorStop()
    if (kind === 'settle') await api.dev.settleRound(id)
    if (kind === 'reset') {
      await api.dev.reset()
      Object.keys(demo.subs).forEach((k) => delete demo.subs[k])
    }
    await Promise.all([loadRounds({ force: true }), refreshSim(), loadDraftRounds()])
    if (kind === 'reset') roundId.value = rounds.list.find((r) => roundPhase(r.status) === 'open')?.id ?? rounds.list[0]?.id
    toast({ title: { open: 'Round opened', start: 'Round is live', sim: 'Simulator running', stop: 'Simulator stopped', settle: 'Round settled', reset: 'Demo data reset' }[kind], tone: 'success', duration: 2000 })
  } catch (e) {
    toastError(e, 'Demo control failed')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="screen">
    <TopBar back="/profile" title="Settings" />
    <main class="ct">
      <span class="xs b m up">Alerts</span>
      <div class="card flat">
        <div class="li">
          <div class="col g2 f1"><b class="sm">Tactical alerts</b><span class="xs m">{{ pushLabel }}</span></div>
          <Toggle :model-value="alertsOn" label="Tactical alerts" :disabled="notify.busy" @update:model-value="masterToggle" />
        </div>
        <template v-if="alertsOn">
          <div class="li"><div class="col g2 f1"><b class="sm">Sub moments &amp; points</b><span class="xs m">Bookings on your five, your goals, sub coming on</span></div><Toggle :model-value="notify.prefs.tactical" label="Tactical" @update:model-value="setPref('tactical', $event)" /></div>
          <div class="li"><div class="col g2 f1"><b class="sm">Lock reminders</b><span class="xs m">30 min before squads lock</span></div><Toggle :model-value="notify.prefs.lock" label="Lock reminders" @update:model-value="setPref('lock', $event)" /></div>
          <div class="li"><div class="col g2 f1"><b class="sm">Match recaps</b><span class="xs m">Your result at full time</span></div><Toggle :model-value="notify.prefs.recaps" label="Recaps" @update:model-value="setPref('recaps', $event)" /></div>
          <div class="li"><div class="col g2 f1"><b class="sm">Friends &amp; challenges</b></div><Toggle :model-value="notify.prefs.social" label="Social" @update:model-value="setPref('social', $event)" /></div>
          <div class="li"><div class="col g2 f1"><b class="sm">Quiet hours</b><span class="xs m">23:00 – 08:00</span></div><Toggle :model-value="notify.prefs.quietHours" label="Quiet hours" @update:model-value="setPref('quietHours', $event)" /></div>
        </template>
        <div class="li">
          <div class="col g2 f1"><b class="sm">Send a test alert</b><span class="xs m">{{ notify.pushActive ? 'Arrives in 5 s — lock the phone to see it on the lock screen' : 'Shows how alerts look' }}</span></div>
          <button class="btn xs" :disabled="busy === 'test'" @click="test"><span v-if="busy === 'test'" class="spin" />Test</button>
        </div>
      </div>
      <div v-if="notify.lastError" class="note"><Icon name="info" :size="16" /><span>Push subscription: {{ notify.lastError }}</span></div>

      <span class="xs b m up">App</span>
      <div class="card flat">
        <button class="li" @click="installOpen = true">
          <b class="sm f1" style="text-align: left">Install SportyStreet</b>
          <span class="pill" :class="pwa.installed ? 'g' : 'o'">{{ pwa.installed ? 'Installed' : pwa.canInstall ? 'Available' : pwa.isIOS ? 'Add to Home Screen' : 'Browser menu' }}</span>
        </button>
        <RouterLink to="/rules" class="li"><b class="sm f1">Rules &amp; scoring · Help</b><Icon name="chevron" :size="18" class="m" /></RouterLink>
        <RouterLink to="/credits" class="li"><b class="sm f1">Photo credits</b><span class="sm m">Wikimedia Commons</span><Icon name="chevron" :size="18" class="m" /></RouterLink>
      </div>

      <span class="xs b m up">Account</span>
      <div class="card flat">
        <div class="li"><b class="sm f1">Home country</b><template v-if="session.countryName"><Flag :country="session.countryName" /><span class="sm m">{{ session.countryName }}</span></template><span v-else class="sm m">Not set</span></div>
        <div class="li"><b class="sm f1">Language</b><span class="sm m">English</span></div>
        <button class="li" @click="usersOpen = true"><b class="sm f1" style="text-align: left">Demo account</b><span class="pill g">{{ session.user?.displayName }}</span><Icon name="chevron" :size="18" class="m" /></button>
      </div>

      <span class="xs b m up">Play responsibly</span>
      <div class="card flat">
        <div class="li"><div class="col g2 f1"><b class="sm">Daily time reminder</b><span class="xs m">Nudge after 60 min in-app</span></div><Toggle v-model="demo.timeReminder" label="Time reminder" /></div>
        <button class="li" @click="breakOpen = true"><b class="sm f1" style="text-align: left">Take a break</b><span class="sm m">{{ onBreak ? `Until ${longDate(demo.breakUntil)}` : 'Pause 7 / 30 days' }}</span></button>
      </div>

      <template v-if="devOk">
        <span class="xs b m up">Demo controls · local backend</span>
        <div class="card col g12">
          <div class="row g6">
            <select v-model="roundId" class="input sm f1" style="height: 40px; font-size: 14px">
              <option v-for="r in roundOptions" :key="r.id" :value="r.id">{{ r.name }} · {{ r.status }}</option>
            </select>
          </div>
          <div class="row g6 wrap">
            <button class="btn xs sec" :disabled="!!busy || phase === 'settled'" @click="dev('open')">Open</button>
            <button class="btn xs sec" :disabled="!!busy || phase !== 'open'" @click="dev('start')">Start (lock)</button>
            <button class="btn xs" :disabled="!!busy || phase !== 'live' || sim?.running" @click="dev('sim')"><Icon name="play" :size="14" />Simulator</button>
            <button class="btn xs dark" :disabled="!!busy || !sim?.running" @click="dev('stop')"><Icon name="stop" :size="14" />Stop</button>
            <button class="btn xs sec" :disabled="!!busy || phase !== 'live'" @click="dev('settle')">Settle</button>
          </div>
          <span class="xs m">Simulator: {{ sim ? (sim.running ? `running · ${sim.currentMatchMinute}'` : sim.completed ? 'finished' : 'stopped') : '—' }}{{ sim?.lastError ? ` · ${sim.lastError}` : '' }}. Open sets a 10-minute entry deadline and the round goes live by itself when it passes (Start does it now). 90 match minutes take ~3 min. Settle once the simulator has finished and the sub is on.</span>
          <button class="btn xs ghost" :disabled="!!busy" @click="dev('reset')"><Icon name="refresh" :size="14" />Reset demo data</button>
        </div>
      </template>
      <span class="xs m tc">SportyStreet · demo build · free to play · 18+</span>
    </main>

    <AlertsSheet :open="alertsOpen" @close="alertsOpen = false" />
    <InstallSheet :open="installOpen" @close="installOpen = false" />
    <BottomSheet :open="usersOpen" @close="usersOpen = false">
      <span class="h2">Play as…</span>
      <span class="t">Seeded users of the local backend. Sign-in screens are not part of this build.</span>
      <div class="col g6">
        <button v-for="u in DEMO_USERS" :key="u.username" class="opt" :class="{ on: u.username === session.username }" @click="pickUser(u.username)">
          <span class="col g2 f1" style="text-align: left"><b class="sm">{{ u.username[0].toUpperCase() + u.username.slice(1) }}</b><span class="xs m">{{ u.note }}</span></span>
          <span class="check" :class="{ on: u.username === session.username }"><Icon v-if="u.username === session.username" name="check" :size="13" :stroke="3.2" /></span>
        </button>
      </div>
    </BottomSheet>
    <BottomSheet :open="breakOpen" @close="breakOpen = false">
      <span class="h2">Take a break</span>
      <span class="t">Pause new entries. Live rounds you're in keep running.</span>
      <button class="btn ghost" @click="takeBreak(7)">Pause 7 days</button>
      <button class="btn ghost" @click="takeBreak(30)">Pause 30 days</button>
      <button v-if="onBreak" class="btn" @click="takeBreak(0)">End my break</button>
    </BottomSheet>
  </div>
</template>
