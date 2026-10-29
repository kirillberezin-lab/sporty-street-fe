<script setup>
// Landing for challenge links from the share card (design 3.6): the friend sees the five to beat
// and the round, then builds their own; the challenger appears as a rival in live standings.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import { STATIC } from '../api/client.js'
import Icon from '../components/Icon.vue'
import SquadShareCard from '../components/SquadShareCard.vue'
import { decodeChallenge } from '../lib/challenge.js'
import { backOr } from '../lib/nav.js'
import { countdown } from '../lib/format.js'
import { useNow } from '../lib/now.js'
import { twistCopy } from '../lib/rules.js'
import { saveChallenge } from '../stores/demo.js'
import { loadMyTeam, phaseOf, rounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'

const route = useRoute()
const router = useRouter()
const now = useNow()
const ch = decodeChallenge(String(route.params.code ?? ''))
const players = ref([])
const error = ref(null)
const loading = ref(true)

onMounted(async () => {
  if (!ch?.roundId) {
    error.value = 'This challenge link is broken.'
    loading.value = false
    return
  }
  try {
    const round = await api.round(ch.roundId)
    rounds.byId[round.id] = round
    await loadMyTeam(round.id).catch(() => null)
    const list = await Promise.all(ch.playerIds.map((pid) => api.player(ch.roundId, pid).catch(() => null)))
    players.value = list.filter(Boolean)
    if (ch.teamId && rounds.teams[round.id]?.id !== ch.teamId) {
      saveChallenge({ roundId: ch.roundId, teamId: ch.teamId, name: ch.name || 'A friend', playerIds: ch.playerIds })
      // No server in the static build: the friend's five joins this device's round. Every device
      // plays the same seeded events, so it scores exactly as on their phone (except their sub).
      if (STATIC) await api.dev.ghostTeam({ roundId: ch.roundId, teamId: ch.teamId, name: ch.name || 'A friend', playerIds: ch.playerIds, captainId: ch.captainId }).catch(() => null)
    }
  } catch (e) {
    error.value = e.status === 404 ? 'This round no longer exists.' : e.message
  } finally {
    loading.value = false
  }
})

const round = computed(() => rounds.byId[ch?.roundId])
const phase = computed(() => phaseOf(round.value))
const own = computed(() => rounds.teams[ch?.roundId]?.id === ch?.teamId)
const mine = computed(() => rounds.teams[ch?.roundId])
const twist = computed(() => twistCopy(round.value?.rules))
const cardPlayers = computed(() => players.value.map((p) => ({ player: p, captain: p.id === ch.captainId, hero: p.id === ch.heroId })))

function go() {
  if (phase.value === 'open') router.push(`/rounds/${ch.roundId}/build`)
  else if (phase.value === 'live' && mine.value) router.push(`/rounds/${ch.roundId}/live`)
  else router.push(`/rounds/${ch.roundId}/standings`)
}
</script>

<template>
  <div class="screen on-dark">
    <header class="head">
      <div class="top">
        <span class="logo">SportyStreet</span>
        <button class="icon-btn" aria-label="Close" @click="backOr(router, '/')"><Icon name="close" :stroke="2.2" /></button>
      </div>
    </header>
    <main class="ct" style="align-items: center; gap: 16px">
      <template v-if="loading"><div class="skel" style="height: 320px; width: 100%; opacity: .15" /></template>
      <div v-else-if="error" class="empty" style="color: #B9BEC6">
        <div class="ico" style="background: var(--dark2); border-color: #33373F; color: #fff"><Icon name="link" /></div>
        <b style="color: #fff">{{ error }}</b>
        <RouterLink to="/play" class="btn sm">See open rounds</RouterLink>
      </div>
      <template v-else>
        <div class="col g4 items-center tc rise">
          <span class="pill rr">CHALLENGE</span>
          <span class="disp" style="font-size: 36px">{{ own ? 'Your challenge link' : `${ch.name || 'A friend'} challenged you` }}</span>
          <span class="sm soft-w">{{ round?.name }}{{ twist ? ` · ${twist.short}` : '' }}</span>
        </div>
        <SquadShareCard :round-name="round?.name ?? ''" :title="`${ch.name || 'Their'}'s world five`" :players="cardPlayers" :footer="own ? 'Send it to friends' : 'Think you can beat it?'" />
        <div v-if="phase === 'open'" class="pill w lg">Squads lock in {{ countdown(Date.parse(round.entryDeadline) - now) }}</div>
        <span class="xs soft-w tc" style="max-width: 300px">
          Playing as <b style="color: #fff">{{ session.user?.displayName }}</b>.
          {{ own ? 'This is your own squad — share the link with a friend.' : `${ch.name || 'Your friend'} will show up as your rival in the live standings.` }}
        </span>
      </template>
    </main>
    <footer v-if="!loading && !error" class="foot">
      <button class="btn wht" @click="go">
        {{ phase === 'open' ? (mine ? 'Edit my five to beat it' : 'Build my five to beat it') : phase === 'live' ? (mine ? 'Watch the head-to-head' : 'Watch live standings') : 'See final standings' }}
      </button>
    </footer>
  </div>
</template>
