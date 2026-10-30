<script setup>
// Round card for the Play tab (design 2.2) and the Home carousel (2.1).
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { compact, countdown, dayTime, timeLeft } from '../lib/format.js'
import { twistCopy } from '../lib/rules.js'
import { clubColor, clubShort } from '../lib/players.js'
import { useNow } from '../lib/now.js'
import { loadParticipants, phaseOf, rounds } from '../stores/rounds.js'

const props = defineProps({ round: { type: Object, required: true }, mini: Boolean })
const router = useRouter()
const now = useNow()

const phase = computed(() => phaseOf(props.round))
const team = computed(() => rounds.teams[props.round.id])
const result = computed(() => rounds.results[props.round.id])
const twist = computed(() => twistCopy(props.round.rules))
const fixtures = computed(() => props.round.fixtures ?? [])
// Backend format (QUICK / MATCHDAY / SPECIAL) when sent; older backends: one match = quick.
const kind = computed(() => {
  const n = fixtures.value.length
  const format = props.round.format ?? (n <= 1 ? 'QUICK' : 'MATCHDAY')
  return { label: `${format} · ${n} match${n === 1 ? '' : 'es'}`, cls: 'b' }
})
const left = computed(() => Date.parse(props.round.entryDeadline) - now.value)
const players = computed(() => rounds.participants[props.round.id])

onMounted(() => loadParticipants(props.round.id))

const cta = computed(() => {
  switch (phase.value) {
    case 'live':
      return team.value ? { label: 'Go to live tactics', to: `/rounds/${props.round.id}/live`, cls: 'sec' } : { label: 'Watch live standings', to: `/rounds/${props.round.id}/standings`, cls: 'ghost' }
    case 'open':
      return team.value ? { label: 'Edit my five', to: `/rounds/${props.round.id}/build`, cls: 'sec' } : { label: 'Build my five', to: `/rounds/${props.round.id}/build`, cls: '' }
    case 'settled':
      return team.value ? { label: 'See my result', to: `/rounds/${props.round.id}/result`, cls: 'ghost' } : { label: 'Final standings', to: `/rounds/${props.round.id}/standings`, cls: 'ghost' }
    default:
      return null
  }
})

const miniCta = computed(() => {
  if (phase.value === 'open') return team.value ? 'Edit →' : 'Build →'
  if (phase.value === 'live') return team.value ? 'Live →' : 'Watch →'
  if (phase.value === 'settled') return 'Result →'
  return 'Details →'
})

function open() {
  router.push(`/rounds/${props.round.id}`)
}
</script>

<template>
  <div v-if="mini" class="card col g6 press round-mini" role="button" tabindex="0" @click="open" @keydown.enter="open">
    <div class="row between">
      <span class="pill" :class="kind.cls">{{ kind.label.split(' · ')[0] }} · {{ fixtures.length }}</span>
      <span v-if="team" class="pill g">✓ In</span>
      <span v-else class="xs m b">Free</span>
    </div>
    <b class="sm ellipsis">{{ round.name }}</b>
    <div v-if="fixtures.length === 1" class="row g6">
      <span class="av xs" :style="{ background: clubColor(fixtures[0].homeClubName) }">{{ clubShort(fixtures[0].homeClubName) }}</span>
      <span class="xs b">v</span>
      <span class="av xs" :style="{ background: clubColor(fixtures[0].awayClubName) }">{{ clubShort(fixtures[0].awayClubName) }}</span>
      <span class="xs m">{{ dayTime(fixtures[0].kickoffAt) }}</span>
    </div>
    <span v-else class="xs m">{{ fixtures.length }} matches · from {{ dayTime(fixtures[0]?.kickoffAt) }}</span>
    <span v-if="twist" class="pill y" style="align-self: flex-start">{{ twist.title }}</span>
    <div class="row between">
      <span v-if="phase === 'open'" class="xs m">Locks in <b style="color: var(--ink)">{{ timeLeft(left) }}</b></span>
      <span v-else-if="phase === 'live'" class="xs red b">● Live now</span>
      <span v-else-if="phase === 'settled'" class="xs m">Full time</span>
      <span v-else class="xs m">Not open yet</span>
      <span class="xs red b">{{ miniCta }}</span>
    </div>
  </div>

  <div v-else class="card col g12" :style="phase === 'live' ? 'border:2px solid var(--red)' : ''">
    <button class="col g12" style="text-align: left" @click="open">
      <div class="row between">
        <span v-if="phase === 'live'" class="pill r"><span class="dot live" />LIVE</span>
        <span v-else-if="phase === 'settled'" class="pill k">FULL TIME</span>
        <span v-else class="pill" :class="kind.cls">{{ kind.label }}</span>
        <span class="xs m">{{ phase === 'live' ? `${fixtures.length} matches · ` : '' }}{{ players != null ? `${compact(players)} players` : '' }}</span>
      </div>
      <div class="row between">
        <b>{{ round.name }}</b>
        <span v-if="team && phase !== 'settled'" class="pill g">✓ Squad in</span>
        <span v-else-if="result" class="pill y">+{{ result.totalAwardedRp }} RP</span>
      </div>
      <div v-if="fixtures.length === 1" class="row g6">
        <span class="av xs" :style="{ background: clubColor(fixtures[0].homeClubName) }">{{ clubShort(fixtures[0].homeClubName) }}</span>
        <b class="sm">{{ fixtures[0].homeClubName }} v {{ fixtures[0].awayClubName }}</b>
      </div>
      <div class="row between">
        <span v-if="twist" class="pill" :class="phase === 'live' ? 'k' : 'y'">{{ twist.short }}</span>
        <span v-if="phase === 'open'" class="xs m">Locks in <b style="color: var(--ink)" class="num">{{ countdown(left) }}</b></span>
        <span v-else-if="phase === 'live'" class="xs m">{{ team ? `${team.score} pts · #${team.rank ?? '—'}` : 'Squads locked' }}</span>
        <span v-else-if="phase === 'settled' && result" class="xs m">{{ result.finalScore }} pts · #{{ result.finalRank }}</span>
        <span v-else-if="phase === 'scheduled'" class="xs m">Not open for entries yet</span>
      </div>
    </button>
    <RouterLink v-if="cta" :to="cta.to" class="btn md" :class="cta.cls">{{ cta.label }}</RouterLink>
    <div v-else class="btn md dis"><Icon name="clock" :size="18" />Entries open soon</div>
  </div>
</template>

<style scoped>
.round-mini { width: 236px; }
</style>
