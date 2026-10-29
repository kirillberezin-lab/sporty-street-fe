<script setup>
// Back a manager (design 7.1 / 7.2) for casual fans. Managers are real squads from the live
// leaderboard and backings settle against real final ranks; fan points are a local free
// prediction balance (no cash value), since the backend has no backing service yet.
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { isLive, isSettled } from '../lib/liveDiff.js'
import { CREATORS, back, backingOffer, demo, resolveBackings } from '../stores/demo.js'
import { loadRounds, rounds } from '../stores/rounds.js'
import { toast } from '../stores/ui.js'

const boards = ref({}) // roundId -> entries
const loading = ref(true)
const filter = ref('all')
const sheet = ref(null) // { round, entry, offer }
const stake = ref(100)

onMounted(async () => {
  await loadRounds()
  const ids = new Set([...rounds.list.filter((r) => isLive(r.status)).map((r) => r.id), ...demo.backings.filter((b) => b.status === 'open').map((b) => b.roundId)])
  await Promise.all([...ids].map(async (id) => {
    try {
      const lb = await api.leaderboard(id, { size: 100 })
      boards.value[id] = lb.standings?.items ?? []
      if (isSettled(rounds.byId[id]?.status)) resolveBackings(id, boards.value[id])
    } catch { /* round gone */ }
  }))
  loading.value = false
})

const liveRound = computed(() => rounds.list.find((r) => isLive(r.status) && boards.value[r.id]))
const rivals = computed(() => new Set(demo.challenges.map((c) => c.teamId)))
const managers = computed(() => {
  const r = liveRound.value
  if (!r) return []
  const mine = rounds.teams[r.id]?.id
  const entries = boards.value[r.id].filter((e) => e.teamId !== mine)
  const total = boards.value[r.id].length
  let list = entries.map((e) => ({ entry: e, offer: backingOffer(e, total), backed: demo.backings.find((b) => b.roundId === r.id && b.teamId === e.teamId) }))
  if (filter.value === 'friends') list = list.filter((m) => rivals.value.has(m.entry.teamId))
  if (filter.value === 'top') list = list.slice(0, 3)
  return list
})
const myBackings = computed(() => demo.backings.slice(0, 6))
const outcome = computed(() => (sheet.value ? stake.value * sheet.value.offer.multiplier : 0))

function openSheet(m) {
  stake.value = Math.min(100, demo.fanPoints)
  sheet.value = { round: liveRound.value, ...m }
}
function confirm() {
  try {
    back({ roundId: sheet.value.round.id, entry: sheet.value.entry, offer: sheet.value.offer, stake: stake.value })
    toast({ title: `Backed ${sheet.value.entry.displayName}`, body: `${stake.value} fan points on “${sheet.value.offer.target}”. Settles at full time.`, tone: 'success' })
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
        <button class="chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">All</button>
        <button class="chip" :class="{ on: filter === 'friends' }" @click="filter = 'friends'">Friends</button>
        <button class="chip" :class="{ on: filter === 'top' }" @click="filter = 'top'">Top form</button>
        <button class="chip" :class="{ on: filter === 'creators' }" @click="filter = 'creators'">Creators</button>
      </div>

      <template v-if="filter === 'creators'">
        <div v-for="c in CREATORS.slice(0, 3)" :key="c.id" class="card row" style="padding: 10px 12px; opacity: .8">
          <Avatar :name="c.name" :color="c.bg" size="sm" />
          <div class="col g2 f1"><div class="row g4"><b class="sm">{{ c.name }}</b><span class="pill b" style="height: 18px; font-size: 10px">CREATOR</span></div><span class="xs m">Backing opens when creators play live rounds</span></div>
          <span class="btn xs dis">Soon</span>
        </div>
      </template>
      <template v-else-if="loading">
        <div v-for="i in 2" :key="i" class="skel" style="height: 150px" />
      </template>
      <template v-else-if="!liveRound">
        <div class="empty">
          <div class="ico"><Icon name="lock" /></div>
          <b style="color: var(--ink)">Backing opens at lock</b>
          <span class="sm">Managers can be backed once a round is live and squads are locked — nobody can game it.</span>
          <RouterLink to="/play" class="btn sm">See rounds</RouterLink>
        </div>
      </template>
      <template v-else>
        <span class="xs b m up">{{ liveRound.name }} · live</span>
        <div v-if="!managers.length" class="empty"><span class="sm">No managers to back in this filter yet.</span></div>
        <div v-for="m in managers" :key="m.entry.teamId" class="card col g12">
          <div class="row g12">
            <Avatar :name="m.entry.displayName" size="md" />
            <div class="col g2 f1"><b>{{ m.entry.displayName }}</b><span class="xs m">Rank #{{ m.entry.rank }} · {{ m.entry.score }} pts now</span></div>
            <span v-if="rivals.has(m.entry.teamId)" class="pill y">Rival</span>
            <span v-else-if="m.entry.rank === 1" class="pill g">Hot</span>
          </div>
          <div class="row g6">
            <div class="stat"><b style="font-size: 15px">{{ m.offer.target }}</b><span>Target</span></div>
            <div class="stat" style="flex: .6"><b style="font-size: 15px">×{{ m.offer.multiplier.toFixed(1) }}</b><span>If they hit</span></div>
          </div>
          <div class="row between">
            <span class="xs m">🔒 Squad locked · same rules for everyone</span>
            <span v-if="m.backed" class="pill g">Backed {{ m.backed.stake }}</span>
            <button v-else class="btn sm" :disabled="demo.fanPoints < 10" @click="openSheet(m)">Back</button>
          </div>
        </div>
      </template>

      <template v-if="myBackings.length">
        <span class="xs b m up" style="margin-top: 4px">My backings</span>
        <div class="card flat">
          <div v-for="b in myBackings" :key="b.id" class="li">
            <Avatar :name="b.name" size="sm" />
            <div class="col g2 f1"><b class="sm">{{ b.name }} · {{ b.target }}</b><span class="xs m">{{ rounds.byId[b.roundId]?.name ?? 'Round' }} · {{ b.stake }} fan pts</span></div>
            <span class="pill" :class="b.status === 'won' ? 'g' : b.status === 'lost' ? 'r' : 'o'">{{ b.status === 'won' ? `+${b.payout}` : b.status === 'lost' ? 'Missed' : 'Live' }}</span>
          </div>
        </div>
      </template>
    </main>

    <BottomSheet :open="!!sheet" @close="sheet = null">
      <template v-if="sheet">
        <div class="row g12">
          <Avatar :name="sheet.entry.displayName" size="lg" />
          <div class="col g2 f1"><span class="h2">Back {{ sheet.entry.displayName }}</span><span class="sm m">{{ sheet.round.name }} · now #{{ sheet.entry.rank }}</span></div>
        </div>
        <div class="note"><Icon name="lock" :size="16" /><span>Their five is locked and private until full time — you're backing the manager, not copying the squad.</span></div>
        <div class="col g6">
          <span class="xs b m up">Fan points to back with</span>
          <div class="row g6">
            <button v-for="v in [50, 100, 250]" :key="v" class="chip f1" :class="{ on: stake === v }" :disabled="v > demo.fanPoints" @click="stake = v">{{ v }}</button>
            <button class="chip f1" :class="{ on: stake === demo.fanPoints }" @click="stake = demo.fanPoints">Max</button>
          </div>
        </div>
        <div class="card row" style="background: var(--green-50); border-color: #BFE6D0">
          <div class="col g2 f1"><span class="xs m b">If {{ sheet.entry.displayName }} {{ sheet.offer.target.toLowerCase() }}</span><span class="disp grn" style="font-size: 28px">+{{ outcome }} fan pts</span></div>
          <div class="col g2 items-end"><span class="xs m b">If not</span><span class="sm b">−{{ stake }}</span></div>
        </div>
        <div class="note"><Icon name="info" :size="16" /><span>Free prediction · fan points have no cash value and can't be bought or converted to reward points.</span></div>
        <button class="btn" :disabled="!stake || stake > demo.fanPoints" @click="confirm">Back with {{ stake }} fan points</button>
      </template>
    </BottomSheet>
  </div>
</template>
