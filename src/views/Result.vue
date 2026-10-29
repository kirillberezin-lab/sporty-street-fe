<script setup>
// Round result (design 5.1): score, rank, RP earned, points per player in plain words.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import { backOr } from '../lib/nav.js'
import { lineKind } from '../lib/liveDiff.js'
import { shortName } from '../lib/players.js'
import { playerRows, playersMap, pointsAfter, sumKind } from '../lib/recap.js'
import { rankLine as formatRank, shareRecap as shareRecapCard } from '../lib/shareRecap.js'
import { demo, recordShare } from '../stores/demo.js'
import { loadMyTeam, loadParticipants, loadResult, loadRound, nextOpenRound, rounds } from '../stores/rounds.js'
import { loadWallet } from '../stores/rewards.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const loading = ref(true)
const sharing = ref(false)

onMounted(async () => {
  try {
    await Promise.all([rounds.byId[id] ? null : loadRound(id), rounds.teams[id] ? null : loadMyTeam(id), loadResult(id), loadParticipants(id)])
    loadWallet().catch(() => {}) // README: refresh the wallet on settlement
  } catch (e) {
    toastError(e)
  } finally {
    loading.value = false
  }
})

const round = computed(() => rounds.byId[id])
const team = computed(() => rounds.teams[id])
const result = computed(() => rounds.results[id])
const breakdown = computed(() => result.value?.breakdown)
const players = computed(() => playersMap(team.value))
const rows = computed(() => playerRows(breakdown.value, players.value))
const total = computed(() => rounds.participants[id])
const heroBonus = computed(() => sumKind(breakdown.value, 'HOME_HERO'))
// Whoever earned the bonus — after a sub the current Home Hero can be someone else.
const heroNames = computed(() =>
  [...new Set((breakdown.value?.timeline ?? []).filter((l) => lineKind(l) === 'HOME_HERO').map((l) => shortName(players.value.get(l.playerId)?.name ?? '')))].filter(Boolean).join(', '),
)
const sub = computed(() => (rounds.teams[id]?.subsUsed ? demo.subs[id] ?? null : null))
const subGain = computed(() => (sub.value ? pointsAfter(breakdown.value, sub.value.incomingPlayerId, sub.value.effectiveAt) : null))
const rival = computed(() => demo.challenges.find((c) => c.roundId === id))
const next = computed(() => nextOpenRound(id))
const rankLine = computed(() => formatRank(result.value, total.value))

async function shareRecap() {
  sharing.value = true
  try {
    const res = await shareRecapCard({ roundName: round.value?.name ?? '', result: result.value, total: total.value, rows: rows.value })
    if (res === 'saved') toast({ title: 'Recap image saved', body: 'Caption copied — post it anywhere.' })
    if (res !== 'cancelled') recordShare()
  } catch (e) {
    toastError(e, 'Could not share')
  } finally {
    sharing.value = false
  }
}

function rematch() {
  if (next.value) {
    toast({ title: `Rematch ${rival.value?.name ?? ''}`.trim(), body: `Build your five for ${next.value.name}, then send the challenge link.` })
    router.push(`/rounds/${next.value.id}/build`)
  } else {
    router.push('/play')
  }
}
</script>

<template>
  <div class="screen on-dark">
    <header class="head">
      <div class="top">
        <button class="icon-btn" aria-label="Close" @click="backOr(router, '/')"><Icon name="close" :stroke="2.2" /></button>
        <span class="navt">Full time</span>
        <button class="icon-btn" aria-label="Share recap" :disabled="!result" @click="shareRecap"><Icon name="share" :size="22" /></button>
      </div>
    </header>

    <main v-if="result" class="ct" style="gap: 14px">
      <div class="col items-center tc" style="gap: 4px">
        <span class="xs b up" style="color: #FF5A66">{{ round?.name }}</span>
        <span class="disp score"><AnimatedNumber :value="result.finalScore" :from="0" :duration="1200" /></span>
        <span class="sm soft-w">points · <b style="color: #fff">{{ rankLine }}</b></span>
      </div>
      <div class="row g6">
        <div class="tile"><span class="xs" style="color: #9AA0A9">Final rank</span><b>#{{ result.finalRank }}</b></div>
        <div class="tile"><span class="xs" style="color: #9AA0A9">Players</span><b>{{ total ?? '—' }}</b></div>
        <div class="tile gold-tile"><span class="xs b">Earned</span><b>+{{ result.totalAwardedRp }} RP</b></div>
      </div>

      <div class="card dark2" style="padding: 4px 14px">
        <div v-for="r in rows" :key="r.playerId" class="li dk" style="padding: 10px 0">
          <Avatar :player="r.player" name="?" size="sm" />
          <span class="sm b f1 ellipsis">{{ shortName(r.player?.name ?? 'Player') }}<span v-if="r.captain" class="pill rr" style="height: 18px; margin-left: 6px">C</span><span v-if="sub && r.playerId === sub.incomingPlayerId" class="xs" style="color: #9AA0A9"> (sub)</span></span>
          <span class="xs ellipsis" style="color: #9AA0A9; max-width: 42%">{{ r.reason }}</span>
          <b :class="r.total >= 0 ? 'grn' : 'gold'">{{ r.total }}</b>
        </div>
        <div v-if="heroBonus" class="li dk" style="padding: 10px 0">
          <span class="badge hh inl" style="width: 32px; height: 32px">★</span>
          <span class="sm b f1">Home Hero bonus</span>
          <span class="xs" style="color: #9AA0A9">{{ heroNames }}</span>
          <b class="grn">+{{ heroBonus }}</b>
        </div>
      </div>

      <div v-if="sub" class="card dark2 row" style="padding: 10px 12px">
        <span class="pill" :class="subGain > 0 ? 'g' : 'o'">{{ subGain > 0 ? 'Smart sub' : 'Sub' }}</span>
        <span class="sm f1">{{ shortName(players.get(sub.incomingPlayerId)?.name ?? '') }} added <b>{{ subGain >= 0 ? '+' : '' }}{{ subGain }}</b> after replacing {{ shortName(players.get(sub.outgoingPlayerId)?.name ?? '') }}</span>
      </div>
      <RouterLink :to="`/rounds/${id}/recap`" class="card dark2 row" style="padding: 10px 12px">
        <Icon name="clock" :size="20" /><span class="sm b f1">Your recap · how the round unfolded</span><Icon name="chevron" :size="18" />
      </RouterLink>
    </main>
    <main v-else class="ct">
      <div v-if="loading" class="col g8"><div class="skel" style="height: 140px; opacity: .2" /><div class="skel" style="height: 200px; opacity: .2" /></div>
      <div v-else class="empty" style="color: #B9BEC6">
        <div class="ico" style="background: var(--dark2); border-color: #33373F; color: #fff"><Icon name="clock" /></div>
        <b style="color: #fff">The result isn't ready yet</b>
        <span class="sm">Results appear once the round is settled.</span>
        <RouterLink :to="`/rounds/${id}/live`" class="btn sm">Back to live</RouterLink>
      </div>
    </main>

    <footer v-if="result" class="foot">
      <div class="row g6">
        <button class="btn md f1 ghost on-dark-b" :disabled="sharing" @click="shareRecap"><span v-if="sharing" class="spin" />Share recap</button>
        <button class="btn md f1 wht" @click="rematch">{{ rival ? `Rematch ${rival.name}` : 'Rematch friends' }}</button>
      </div>
      <RouterLink :to="next ? `/rounds/${next.id}` : '/play'" class="btn">Play next round</RouterLink>
    </footer>
  </div>
</template>

<style scoped>
.score { font-size: 96px; }
.tile { flex: 1; display: flex; flex-direction: column; gap: 2px; background: var(--dark2); border-radius: 14px; padding: 10px 12px; }
.gold-tile { background: linear-gradient(135deg, #F5B400, #E08A00); color: var(--ink); }
</style>
