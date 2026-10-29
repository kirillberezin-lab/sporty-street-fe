<script setup>
// Opt-in for tactical alerts. Shows the lock-screen preview from design 4.1 and asks for
// permission only after a tap (required by iOS/Chrome), with platform-specific guidance.
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { capability, enableAlerts, notify } from '../stores/notify.js'
import { pwa, promptInstall } from '../lib/pwa.js'
import { toast } from '../stores/ui.js'

defineProps({ open: Boolean })
const emit = defineEmits(['close', 'enabled'])

const cap = computed(() => capability())
const result = ref(null)

const SAMPLES = [
  { title: 'Sub moment ⚡', body: 'Your midfielder was booked and may come off. Your bench player is ready — swap now?', when: 'now', o: 0.92 },
  { title: '+20 pts · Your striker scored!', body: "Late goal ×2 · Captain ×2. You're up to #3.", when: '9m ago', o: 0.8 },
  { title: 'Squads lock in 30 min', body: 'Last chance to tweak your five.', when: '14:30', o: 0.68 },
]

async function turnOn() {
  result.value = await enableAlerts()
  if (result.value === 'granted') {
    toast({ title: 'Alerts on', body: notify.pushActive ? 'You will get them even with the app closed.' : 'You will get them while SportyStreet is open.', tone: 'success' })
    emit('enabled')
    emit('close')
  }
}

async function install() {
  const outcome = await promptInstall()
  if (outcome === 'accepted') toast({ title: 'Installed', body: 'Open SportyStreet from your home screen and turn alerts on.' })
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <div class="lock-preview">
      <div class="col items-center" style="gap: 0; color: #fff">
        <span class="xs b" style="opacity: .8">{{ new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
        <span class="clock">{{ new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }}</span>
      </div>
      <div class="col g6 stagger">
        <div v-for="s in SAMPLES" :key="s.title" class="lp-note" :style="{ background: `rgba(245,245,247,${s.o})` }">
          <span class="lp-ic">S5</span>
          <span class="col g2 f1">
            <span class="row between"><b class="sm">{{ s.title }}</b><span class="xs m">{{ s.when }}</span></span>
            <span class="sm" style="line-height: 1.3">{{ s.body }}</span>
          </span>
        </div>
      </div>
    </div>

    <div class="col g4">
      <span class="h2">Tactical alerts</span>
      <span class="t">Only when a decision matters: lock reminders, sub moments and your points. About three per round, never spam.</span>
    </div>

    <div v-if="cap.level === 'ios-install'" class="note" style="background: var(--blue-50); color: #1E3A8A">
      <Icon name="phone" :size="18" />
      <span>On iPhone tap <b>Share</b> <Icon name="external" :size="12" style="display: inline" /> → <b>Add to Home Screen</b>, open SportyStreet from there and turn alerts on. iOS only delivers web alerts to installed apps (iOS 16.4+).</span>
    </div>
    <div v-else-if="cap.level !== 'ok'" class="note"><Icon name="info" :size="16" /><span>{{ cap.text }}</span></div>
    <div v-else-if="result && result !== 'granted'" class="note"><Icon name="info" :size="16" /><span>Permission was not granted. You can allow notifications later in your browser settings.</span></div>

    <button v-if="cap.level === 'ok'" class="btn" :disabled="notify.busy" @click="turnOn">
      <span v-if="notify.busy" class="spin" />
      <Icon v-else name="bell" :size="20" />
      Turn on alerts
    </button>
    <button v-else-if="pwa.canInstall" class="btn" @click="install"><Icon name="download" :size="20" />Install the app</button>
    <button class="btn ghost md" @click="emit('close')">Not now</button>
  </BottomSheet>
</template>

<style scoped>
.lock-preview {
  border-radius: 22px; padding: 16px 12px 14px; display: flex; flex-direction: column; gap: 14px;
  background: linear-gradient(170deg, #0E3B22 0%, #14171C 55%, #3A0A10 100%);
}
.clock { font-size: 54px; font-weight: 700; letter-spacing: -2px; line-height: 1.05; }
.lp-note { color: var(--ink); border-radius: 18px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; }
.lp-ic { width: 34px; height: 34px; border-radius: 9px; background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; font: 900 italic 16px 'Barlow Condensed', sans-serif; flex: none; }
</style>
