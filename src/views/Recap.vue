<script setup>
// Match recap (design 5.2): the story of the round, points timeline, decisive events, badges.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { signed } from '../lib/format.js'
import { groupEvents, modifierLabel } from '../lib/liveDiff.js'
import { shortName } from '../lib/players.js'
import { badges, playerRows, playersMap, story, timelineBuckets } from '../lib/recap.js'
import { shareRecap } from '../lib/shareRecap.js'
import { demo, recordShare } from '../stores/demo.js'
import { toast, toastError } from '../stores/ui.js'
import { loadMyTeam, loadParticipants, loadResult, rounds } from '../stores/rounds.js'

const route = useRoute()
const id = route.params.id

onMounted(() => {
  loadResult(id).catch(() => {})
  loadParticipants(id)
  if (!rounds.teams[id]) loadMyTeam(id).catch(() => {})
})

const result = computed(() => rounds.results[id])
const breakdown = computed(() => result.value?.breakdown)
const players = computed(() => playersMap(rounds.teams[id]))
const sub = computed(() => (rounds.teams[id]?.subsUsed ? demo.subs[id] ?? null : null))
const rows = computed(() => playerRows(breakdown.value, players.value))
const text = computed(() => story({ result: result.value, breakdown: breakdown.value, players: players.value, sub: sub.value, rows: rows.value, total: rounds.participants[id] }))
const buckets = computed(() => timelineBuckets(breakdown.value))
const maxCum = computed(() => Math.max(1, ...buckets.value.map((b) => b.cumulative)))
const events = computed(() => {
  const list = groupEvents(breakdown.value?.timeline ?? []).filter((e) => e.kind !== 'APPEARANCE')
  if (sub.value) list.push({ key: 'sub', kind: 'SUB', matchMinute: null, points: null, playerId: sub.value.incomingPlayerId })
  return list
})
const earned = computed(() => badges({ result: result.value, breakdown: breakdown.value, sub: sub.value }))
const sharing = ref(false)

async function share() {
  sharing.value = true
  try {
    const res = await shareRecap({ roundName: rounds.byId[id]?.name ?? '', result: result.value, total: rounds.participants[id], rows: rows.value })
    if (res === 'saved') toast({ title: 'Recap image saved', body: 'Caption copied — post it anywhere.' })
    if (res !== 'cancelled') recordShare()
  } catch (e) {
    toastError(e, 'Could not share')
  } finally {
    sharing.value = false
  }
}

function barColor(b) {
  if (b.kinds.has('TWIST')) return 'var(--green)'
  if (b.kinds.has('GOAL') || b.kinds.has('ASSIST')) return 'var(--red)'
  return '#D5D8DD'
}
function describe(ev) {
  const name = shortName(players.value.get(ev.playerId)?.name ?? 'Player')
  if (ev.kind === 'SUB') return { bold: 'Sub:', rest: ` ${shortName(players.value.get(sub.value.outgoingPlayerId)?.name ?? '')} → ${name}` }
  const mods = ev.modifiers.map((m) => modifierLabel(m, rounds.byId[id]?.rules)).join(' · ')
  const what = { GOAL: 'goal', ASSIST: 'assist', YELLOW_CARD: 'yellow card', RED_CARD: 'red card', OWN_GOAL: 'own goal' }[ev.kind] ?? ev.kind
  return { bold: name, rest: ` ${what}${mods ? ` · ${mods}` : ''}` }
}
</script>

<template>
  <div class="screen white">
    <TopBar :back="`/rounds/${id}/result`" title="Your recap" />
    <main class="ct" style="padding-top: 4px">
      <template v-if="result">
        <div class="card soft col g6 rise">
          <span class="xs b red up">The story of your round</span>
          <span class="sm" style="line-height: 1.5">{{ text }}</span>
        </div>
        <span class="xs b m up">Points timeline</span>
        <div class="chart">
          <div v-for="b in buckets" :key="b.from" class="f1 bar" :title="`${b.from}'–${b.to}': ${signed(b.points)}`" :style="{ height: `${Math.max(4, (b.cumulative / maxCum) * 100)}%`, background: barColor(b) }" />
        </div>
        <div class="row between xs m b" style="margin-top: -6px"><span>0'</span><span>45'</span><span>90'</span></div>
        <div class="col g2">
          <div v-for="ev in events" :key="ev.key" class="li">
            <span class="xs b m" style="width: 28px">{{ ev.matchMinute != null ? `${ev.matchMinute}'` : '' }}</span>
            <span class="sm f1"><b>{{ describe(ev).bold }}</b>{{ describe(ev).rest }}</span>
            <span v-if="ev.kind === 'SUB'" class="pill g">Sub</span>
            <b v-else :class="ev.points >= 0 ? 'grn' : 'gold'">{{ signed(ev.points) }}</b>
          </div>
        </div>
        <div v-for="b in earned" :key="b.title" class="card row pop-in">
          <div class="ibox" style="background: var(--gold-50); font-size: 20px">{{ b.icon }}</div>
          <div class="col g2 f1"><b class="sm">Badge unlocked: {{ b.title }}</b><span class="xs m">{{ b.text }}</span></div>
        </div>
      </template>
      <div v-else class="empty"><div class="ico"><Icon name="clock" /></div><b style="color: var(--ink)">Recap appears after full time</b></div>
    </main>
    <footer v-if="result" class="foot">
      <button class="btn" :disabled="sharing" @click="share"><span v-if="sharing" class="spin" />Share my recap</button>
    </footer>
  </div>
</template>

<style scoped>
.chart { display: flex; align-items: flex-end; gap: 4px; height: 110px; padding: 0 4px; border-bottom: 1.5px solid var(--line); }
.bar { border-radius: 4px 4px 0 0; animation: grow .7s var(--ease) both; transform-origin: bottom; }
@keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
</style>
