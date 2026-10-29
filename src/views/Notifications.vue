<script setup>
// Notifications inbox (design 9.2): every alert from live play and push, grouped by day.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AlertsSheet from '../components/AlertsSheet.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { ago } from '../lib/format.js'
import { markAllRead, markRead, notify } from '../stores/notify.js'

const router = useRouter()
const alertsOpen = ref(false)

const groups = computed(() => {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400_000).toDateString()
  const out = { Today: [], Yesterday: [], Earlier: [] }
  for (const a of notify.inbox) {
    const d = new Date(a.createdAt).toDateString()
    out[d === today ? 'Today' : d === yesterday ? 'Yesterday' : 'Earlier'].push(a)
  }
  return Object.entries(out).filter(([, v]) => v.length)
})

const LOOK = {
  sub_moment: { icon: 'swap', bg: 'var(--red)', fg: '#fff' },
  sub_active: { icon: 'bolt', bg: 'var(--green-50)', fg: 'var(--green)' },
  points: { icon: 'ball', bg: 'var(--green-50)', fg: 'var(--green)' },
  lock: { icon: 'clock', bg: 'var(--blue-50)', fg: 'var(--blue)' },
  result: { icon: 'gift', bg: 'var(--gold-50)', fg: 'var(--gold-d)' },
  test: { icon: 'bell', bg: 'var(--bg)', fg: 'var(--ink2)' },
}
const look = (a) => LOOK[a.type] ?? LOOK.test

function open(a) {
  markRead(a.id)
  if (a.url) router.push(a.url)
}
</script>

<template>
  <div class="screen white">
    <TopBar back="/" title="Notifications">
      <template #right><button v-if="notify.inbox.some((a) => !a.read)" class="xs b red" @click="markAllRead">Read all</button></template>
    </TopBar>
    <main class="ct" style="padding-top: 4px; gap: 4px">
      <button v-if="notify.permission !== 'granted'" class="card soft row" style="margin-bottom: 8px" @click="alertsOpen = true">
        <Icon name="bell" :size="20" class="red" />
        <span class="col g2 f1"><b class="sm">Turn on tactical alerts</b><span class="xs m">Get these on your lock screen too.</span></span>
        <Icon name="chevron" :size="18" class="m" />
      </button>
      <div v-if="!notify.inbox.length" class="empty">
        <div class="ico"><Icon name="bell" /></div>
        <b style="color: var(--ink)">No alerts yet</b>
        <span class="sm">Sub moments, your goals, lock reminders and results land here.</span>
      </div>
      <template v-for="[label, items] in groups" :key="label">
        <span class="xs b m up" style="margin: 8px 0 4px">{{ label }}</span>
        <button v-for="a in items" :key="a.id" class="li note-row" :class="{ unread: !a.read }" @click="open(a)">
          <div class="ibox" :style="{ background: look(a).bg, color: look(a).fg }"><Icon :name="look(a).icon" :size="20" /></div>
          <div class="col g2 f1" style="text-align: left">
            <b class="sm">{{ a.title }}</b>
            <span class="xs m">{{ a.body }} · {{ ago(a.createdAt) }}</span>
          </div>
          <span v-if="!a.read" class="dot" />
        </button>
      </template>
    </main>
    <AlertsSheet :open="alertsOpen" @close="alertsOpen = false" />
  </div>
</template>

<style scoped>
.note-row { margin: 0 -16px; padding: 12px 16px; width: calc(100% + 32px); transition: background .3s; }
.note-row.unread { background: var(--red-50); }
</style>
