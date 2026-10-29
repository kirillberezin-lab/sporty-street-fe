<script setup>
// Back a manager (design 7.1 / 7.2) for casual fans. Manager cards, targets and multipliers come from
// the community API (GET /backing/managers — simulated preview data, illustrative fives). Backing
// itself is a local free prediction with fan points (no cash value): it settles on the manager's
// real rank when they play the round, otherwise on a seeded simulated outcome.
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { isLive, isOpen, isSettled } from '../lib/liveDiff.js'
import { shortName } from '../lib/players.js'
import { backingManagers } from '../stores/community.js'
import { back, demo, resolveBackings, targetLabel } from '../stores/demo.js'
import { loadRounds, rounds } from '../stores/rounds.js'
import { toast } from '../stores/ui.js'

const FILTERS = [['ALL', 'All'], ['FRIENDS', 'Friends'], ['TOP_FORM', 'Top form'], ['CREATORS', 'Creators']]
const filter = ref('ALL')
const data = ref(null)
const loading = ref(true)
const error = ref(null)
const sheet = ref(null) // manager card
const stake = ref(100)

// Backing opens at lock: the live round first, otherwise the next open one (preview).
const round = computed(() => rounds.list.find((r) => isLive(r.status)) ?? rounds.list.find((r) => isOpen(r.status)) ?? null)
const canBack = computed(() => isLive(round.value?.status))

async function load() {
  if (!round.value) return (loading.value = false)
  loading.value = true
  error.value = null
  try {
    data.value = await backingManagers(round.value.id, filter.value)
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadRounds()
  // Settle open backings of finished rounds against the real final table.
  const open = new Set(demo.backings.filter((b) => b.status === 'open').map((b) => b.roundId))
  await Promise.all([...open].filter((id) => isSettled(rounds.byId[id]?.status)).map(async (id) => {
    const lb = await api.leaderboard(id, { size: 100 }).catch(() => null)
    if (lb) resolveBackings(id, lb.standings?.items ?? [])
  }))
  load()
})
watch(filter, load)

const managers = computed(() => (data.value?.items ?? []).map((m) => ({ ...m, backed: demo.backings.find((b) => b.roundId === round.value?.id && b.profileId === m.profile.id) })))
const myBackings = computed(() => demo.backings.slice(0, 6))
const outcome = computed(() => (sheet.value ? Math.round(stake.value * sheet.value.multiplier) : 0))

function openSheet(m) {
  stake.value = Math.min(100, demo.fanPoints)
  sheet.value = m
}
function confirm() {
  try {
    back({ roundId: round.value.id, manager: sheet.value, stake: stake.value })
    toast({ title: `Backed ${sheet.value.profile.displayName}`, body: `${stake.value} fan points on “${targetLabel(sheet.value.target)}”. Settles at full time.`, tone: 'success' })
    sheet.value = null
  } catch (e) {
    toast({ title: e.message, tone: 'error' })
  }
}
</script>

<template>
  <div class="screen">
    <TopBar back="/leagues" title="Back a manager">
      <template #right><RouterLink to="/rules" class="icon-btn" aria-label="Rules"><Icon name="info" :size="22" /></RouterLink></template>
    </TopBar>
    <main class="ct">
      <div class="card soft row">
        <div class="ibox" style="background: #fff; color: var(--red)"><Icon name="trophy" :size="22" /></div>
        <div class="col g2 f1"><span class="xs m b">Your fan points</span><span class="disp" style="font-size: 30px">{{ demo.fanPoints }}</span></div>
        <span class="xs m tr-a" style="width: 110px">+100 free every week</span>
      </div>
      <div class="chips">
        <button v-for="[id, label] in FILTERS" :key="id" class="chip" :class="{ on: filter === id }" @click="filter = id">{{ label }}</button>
      </div>

      <template v-if="loading">
        <div v-for="i in 2" :key="i" class="skel" style="height: 190px" />
      </template>
      <div v-else-if="!round" class="empty">
        <div class="ico"><Icon name="lock" /></div>
        <b style="color: var(--ink)">No round to back right now</b>
        <span class="sm">Managers can be backed once a round is live and squads are locked.</span>
        <RouterLink to="/play" class="btn sm">See rounds</RouterLink>
      </div>
      <div v-else-if="error" class="empty"><b style="color: var(--ink)">Managers unavailable</b><span class="sm">{{ error.message }}</span><button class="btn sm" @click="load">Try again</button></div>
      <template v-else>
        <span class="xs b m up">{{ round.name }} · {{ canBack ? 'live' : 'opens at lock' }}</span>
        <div v-if="!managers.length" class="empty"><span class="sm">No managers in this filter.</span></div>
        <div v-for="m in managers" :key="m.profile.id" class="card col g12">
          <div class="row g12">
            <Avatar :name="m.profile.displayName" :src="m.profile.avatarUrl" size="md" />
            <div class="col g2 f1" style="min-width: 0">
              <div class="row g4"><b class="ellipsis">{{ m.profile.displayName }}</b><span v-if="m.profile.creator" class="pill b" style="height: 18px; font-size: 10px">CREATOR</span></div>
              <span class="xs m">{{ m.averagePoints.toFixed(0) }} avg pts · top finishes {{ m.topFinishes }}/{{ m.recentRounds }}</span>
            </div>
            <span v-if="m.friend" class="pill y">Friend</span>
            <span v-else-if="m.topForm" class="pill g">Hot</span>
          </div>
          <div class="row g4">
            <span class="xs m" style="margin-right: 4px">Form</span>
            <span v-for="(f, i) in m.recentForm" :key="i" class="pill" :class="f === 'W' ? 'g' : f === 'L' ? 'r' : 'o'" style="height: 18px">{{ f }}</span>
          </div>
          <div class="row g6 five">
            <div v-for="p in m.squadPreview" :key="p.id" class="col g2 f1 items-center" style="min-width: 0">
              <Avatar :player="p" size="sm" :captain="p.id === m.captainPlayerId" />
              <span class="xs ellipsis" style="max-width: 100%">{{ shortName(p.name) }}</span>
            </div>
          </div>
          <div class="row g6">
            <div class="stat"><b style="font-size: 15px">{{ targetLabel(m.target) }}</b><span>Target</span></div>
            <div class="stat" style="flex: .6"><b style="font-size: 15px">×{{ m.multiplier.toFixed(1) }}</b><span>If they hit</span></div>
          </div>
          <div class="row between">
            <span class="xs m">{{ canBack ? '🔒 Squad locked · same rules for everyone' : 'Backing opens when squads lock' }}</span>
            <span v-if="m.backed" class="pill g">Backed {{ m.backed.stake }}</span>
            <button v-else class="btn sm" :disabled="!canBack || demo.fanPoints < 10" @click="openSheet(m)">Back</button>
          </div>
        </div>
        <span class="xs m tc">Illustrative fives and form · simulated preview data. Fans' real squads stay private.</span>
      </template>

      <template v-if="myBackings.length">
        <span class="xs b m up" style="margin-top: 4px">My backings</span>
        <div class="card flat">
          <div v-for="b in myBackings" :key="b.id" class="li">
            <Avatar :name="b.name" :src="b.avatarUrl" size="sm" />
            <div class="col g2 f1"><b class="sm">{{ b.name }} · {{ targetLabel(b.target) }}</b><span class="xs m">{{ rounds.byId[b.roundId]?.name ?? 'Round' }} · {{ b.stake }} fan pts{{ b.simulated ? ' · simulated result' : '' }}</span></div>
            <span class="pill" :class="b.status === 'won' ? 'g' : b.status === 'lost' ? 'r' : 'o'">{{ b.status === 'won' ? `+${b.payout}` : b.status === 'lost' ? 'Missed' : 'Live' }}</span>
          </div>
        </div>
      </template>
    </main>

    <BottomSheet :open="!!sheet" @close="sheet = null">
      <template v-if="sheet">
        <div class="row g12">
          <Avatar :name="sheet.profile.displayName" :src="sheet.profile.avatarUrl" size="lg" />
          <div class="col g2 f1"><span class="h2">Back {{ sheet.profile.displayName }}</span><span class="sm m">{{ round?.name }} · {{ targetLabel(sheet.target) }}</span></div>
        </div>
        <div class="note"><Icon name="lock" :size="16" /><span>Squads are locked — you're backing the manager, not copying the squad.</span></div>
        <div class="col g6">
          <span class="xs b m up">Fan points to back with</span>
          <div class="row g6">
            <button v-for="v in [50, 100, 250]" :key="v" class="chip f1" :class="{ on: stake === v }" :disabled="v > demo.fanPoints" @click="stake = v">{{ v }}</button>
            <button class="chip f1" :class="{ on: stake === demo.fanPoints }" @click="stake = demo.fanPoints">Max</button>
          </div>
        </div>
        <div class="card row" style="background: var(--green-50); border-color: #BFE6D0">
          <div class="col g2 f1"><span class="xs m b">If they {{ targetLabel(sheet.target).toLowerCase() }}</span><span class="disp grn" style="font-size: 28px">+{{ outcome }} fan pts</span></div>
          <div class="col g2 items-end"><span class="xs m b">If not</span><span class="sm b">−{{ stake }}</span></div>
        </div>
        <div class="note"><Icon name="info" :size="16" /><span>Free prediction · fan points have no cash value and can't be bought or converted to reward points.</span></div>
        <button class="btn" :disabled="!stake || stake > demo.fanPoints" @click="confirm">Back with {{ stake }} fan points</button>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.five { background: var(--bg); border-radius: 12px; padding: 8px 6px; }
</style>
