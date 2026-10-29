<script setup>
// Rounds list / Play tab (design 2.2).
import { computed, onMounted, ref } from 'vue'
import Icon from '../components/Icon.vue'
import RoundCard from '../components/RoundCard.vue'
import TabBar from '../components/TabBar.vue'
import { loadRounds, phaseOf, rounds } from '../stores/rounds.js'

const seg = ref('today')
const kind = ref('all')

onMounted(async () => {
  await loadRounds({ force: true })
  // Land on the first tab that has something to show.
  if (!byDay('today').length) seg.value = byDay('week').length || !byDay('results').length ? 'week' : 'results'
})

const sameDay = (iso, offsetDays = 0) => new Date(iso).toDateString() === new Date(Date.now() + offsetDays * 86400_000).toDateString()

function byDay(which) {
  return rounds.list.filter((r) => {
    const phase = phaseOf(r)
    if (which === 'results') return phase === 'settled'
    if (phase === 'settled') return false
    if (phase === 'live') return true
    const t = Date.parse(r.entryDeadline)
    if (which === 'today') return sameDay(r.entryDeadline) || t < Date.now()
    return t - Date.now() < 7 * 86400_000
  })
}

// The backend sends format (QUICK / MATCHDAY / SPECIAL); older ones: one match = quick.
const kindOf = (r) => (r.format ? r.format.toLowerCase() : (r.fixtures?.length ?? 0) <= 1 ? 'quick' : 'matchday')
const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'quick', label: 'Quick' },
  { id: 'matchday', label: 'Matchday' },
  { id: 'special', label: 'Special' },
]
const inSeg = computed(() => byDay(seg.value))
const counts = computed(() => {
  const c = { all: inSeg.value.length, quick: 0, matchday: 0, special: 0 }
  for (const r of inSeg.value) c[kindOf(r)] = (c[kindOf(r)] ?? 0) + 1
  return c
})
const list = computed(() => (kind.value === 'all' ? inSeg.value : inSeg.value.filter((r) => kindOf(r) === kind.value)))
// The filter hides everything this tab has: say so instead of "nothing here".
const filteredOut = computed(() => kind.value !== 'all' && !list.value.length && inSeg.value.length > 0)
const kindName = computed(() => ({ quick: 'quick (1 match)', matchday: 'matchday', special: 'special' })[kind.value])

function refresh() {
  loadRounds({ force: true })
}
</script>

<template>
  <div class="screen">
    <header class="head" style="background: #fff">
      <div class="top">
        <span class="h1">Play</span>
        <div class="row g6">
          <button class="icon-btn" aria-label="Refresh" @click="refresh"><Icon name="refresh" :size="20" :class="{ spinning: rounds.loading }" /></button>
          <RouterLink to="/rules" class="pill o lg">Rules</RouterLink>
        </div>
      </div>
      <div class="col g12" style="padding: 0 16px 12px">
        <div class="seg">
          <button :class="{ on: seg === 'today' }" @click="seg = 'today'">Today</button>
          <button :class="{ on: seg === 'week' }" @click="seg = 'week'">This week</button>
          <button :class="{ on: seg === 'results' }" @click="seg = 'results'">Results</button>
        </div>
        <div class="chips">
          <button v-for="k in KINDS" :key="k.id" class="chip" :class="{ on: kind === k.id }" :aria-pressed="kind === k.id" @click="kind = k.id">
            {{ k.label }}<span v-if="rounds.loaded" class="count">{{ counts[k.id] }}</span>
          </button>
        </div>
      </div>
    </header>
    <main class="ct">
      <template v-if="rounds.error && !rounds.list.length">
        <div class="empty">
          <div class="ico"><Icon name="info" /></div>
          <b style="color: var(--ink)">Can't load rounds</b>
          <span class="sm">{{ rounds.error.message }}</span>
          <button class="btn sm" @click="refresh">Try again</button>
        </div>
      </template>
      <template v-else-if="!rounds.loaded">
        <div v-for="i in 3" :key="i" class="skel" style="height: 150px; border-radius: 18px" />
      </template>
      <div v-else-if="list.length" class="col g12 stagger">
        <RoundCard v-for="r in list" :key="r.id" :round="r" />
      </div>
      <div v-else-if="filteredOut" class="empty">
        <div class="ico"><Icon name="ball" /></div>
        <b style="color: var(--ink)">No {{ kindName }} rounds {{ seg === 'today' ? 'today' : seg === 'week' ? 'this week' : 'finished yet' }}</b>
        <span class="sm">{{ counts.all }} {{ counts.all === 1 ? 'round' : 'rounds' }} of another format {{ counts.all === 1 ? 'is' : 'are' }} here.</span>
        <button class="btn sm sec" @click="kind = 'all'">Show all</button>
      </div>
      <div v-else class="empty">
        <div class="ico"><Icon name="ball" /></div>
        <b style="color: var(--ink)">{{ seg === 'results' ? 'No finished rounds yet' : 'Nothing here right now' }}</b>
        <span class="sm">{{ seg === 'today' ? 'Check this week for the next rounds.' : 'New rounds are announced with their twist.' }}</span>
        <button v-if="seg === 'today'" class="btn sm sec" @click="seg = 'week'">This week</button>
      </div>
    </main>
    <TabBar />
  </div>
</template>

<style scoped>
.spinning { animation: spin .8s linear infinite; }
.count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; background: var(--bg); color: var(--mute); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.chip.on .count { background: rgba(255, 255, 255, .18); color: #fff; }
</style>
