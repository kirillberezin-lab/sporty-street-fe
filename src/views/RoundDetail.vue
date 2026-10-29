<script setup>
// Round detail (design 2.3): countdown to lock, twist, timeline, fixtures, prize table.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { clock, dayTime, num, pad2, parts } from '../lib/format.js'
import { useNow } from '../lib/now.js'
import { clubColor, clubShort } from '../lib/players.js'
import { homeHeroCopy, twistCopy } from '../lib/rules.js'
import { canShare, copyText, shareNative } from '../lib/share.js'
import { demo } from '../stores/demo.js'
import { loadMyTeam, loadParticipants, loadRound, phaseOf, rounds } from '../stores/rounds.js'
import { toast, toastError } from '../stores/ui.js'
import { appUrl } from '../lib/url.js'

const route = useRoute()
const id = route.params.id
const now = useNow()
const loading = ref(!rounds.byId[id])

onMounted(async () => {
  try {
    await Promise.all([loadRound(id), loadMyTeam(id), loadParticipants(id)])
  } catch (e) {
    toastError(e, 'Round not available')
  } finally {
    loading.value = false
  }
})

const round = computed(() => rounds.byId[id])
const team = computed(() => rounds.teams[id])
const phase = computed(() => phaseOf(round.value))
const twist = computed(() => twistCopy(round.value?.rules))
const hh = computed(() => homeHeroCopy(round.value?.rules))
const left = computed(() => parts(Date.parse(round.value?.entryDeadline) - now.value))
const fixtures = computed(() => [...(round.value?.fixtures ?? [])].sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt)))
const onBreak = computed(() => demo.breakUntil && Date.parse(demo.breakUntil) > now.value)
const kindLabel = computed(() => (fixtures.value.length <= 1 ? 'QUICK · 1 match' : `MATCHDAY · ${fixtures.value.length} matches`))

const cta = computed(() => {
  if (!round.value) return null
  if (phase.value === 'open') {
    if (onBreak.value) return { label: 'On a break', disabled: true }
    return team.value ? { label: 'Edit my five', to: `/rounds/${id}/build`, secondary: { label: 'Squad card', to: `/rounds/${id}/locked` } } : { label: 'Build my five', to: `/rounds/${id}/build` }
  }
  if (phase.value === 'live') return team.value ? { label: 'Go to live tactics', to: `/rounds/${id}/live` } : { label: 'Watch live standings', to: `/rounds/${id}/standings` }
  if (phase.value === 'settled') return team.value ? { label: 'See my result', to: `/rounds/${id}/result` } : { label: 'Final standings', to: `/rounds/${id}/standings` }
  return { label: 'Entries open soon', disabled: true }
})

async function share() {
  const url = appUrl(`/rounds/${id}`)
  const text = `${round.value.name} on SportyStreet — ${twist.value?.short ?? ''}. Pick five and play with me!`
  const res = await shareNative({ title: round.value.name, text, url })
  if (res === 'unsupported' && (await copyText(`${text} ${url}`))) toast({ title: 'Link copied', body: url })
}
</script>

<template>
  <div class="screen">
    <TopBar back="/play" tone="dark" class="hero-head">
      <template #right>
        <button class="icon-btn" aria-label="Share" @click="share"><Icon :name="canShare() ? 'share' : 'link'" :size="22" /></button>
      </template>
      <div v-if="round" class="col g12" style="padding: 0 16px 18px">
        <span class="pill" style="background: rgba(37, 99, 235, .25); color: #9CC0FF; align-self: flex-start">{{ kindLabel }}</span>
        <div class="disp" style="font-size: 40px">{{ round.name }}</div>
        <div v-if="phase === 'open'" class="row g6">
          <div v-if="left.d" class="cd"><b class="disp">{{ pad2(left.d) }}</b><span>DAYS</span></div>
          <div class="cd"><b class="disp">{{ pad2(left.h) }}</b><span>HRS</span></div>
          <div class="cd"><b class="disp">{{ pad2(left.m) }}</b><span>MIN</span></div>
          <div v-if="!left.d" class="cd"><b class="disp">{{ pad2(left.s) }}</b><span>SEC</span></div>
          <span class="sm soft-w" style="margin-left: 6px">{{ left.total > 0 ? 'until squads lock' : 'locking now' }}</span>
        </div>
        <div v-else-if="phase === 'live'" class="row g6"><span class="pill rr"><span class="dot live" style="background: #fff" />LIVE NOW</span><span class="sm soft-w">Squads locked · sub window open</span></div>
        <div v-else-if="phase === 'settled'" class="row g6"><span class="pill w">FULL TIME</span><span class="sm soft-w">Results are final</span></div>
        <div v-else class="row g6"><span class="pill w">OPENS SOON</span><span class="sm soft-w">Entries are not open yet</span></div>
      </div>
    </TopBar>

    <main v-if="round" class="ct">
      <div v-if="twist" class="card row items-start rise" style="border: 2px solid var(--red)">
        <div class="ibox" style="background: var(--red); color: #fff"><span class="disp" style="font-size: 20px">×{{ round.rules?.twist?.multiplier ?? 2 }}</span></div>
        <div class="col g4 f1"><span class="xs b red up">Announced twist</span><b>{{ twist.short }}</b><span class="xs m">{{ twist.detail }} Applies to every squad, all round.</span></div>
      </div>

      <div class="card flat">
        <div class="li"><span class="xs b m" style="width: 44px">{{ clock(round.entryDeadline) }}</span><span class="sm f1">Squads lock · entry deadline</span><Icon name="lock" :size="16" class="m" /></div>
        <div class="li"><span class="xs b m" style="width: 44px">{{ clock(fixtures[0]?.kickoffAt ?? round.subWindowOpensAt) }}</span><span class="sm f1">Kick-off · your one live sub opens</span><Icon name="swap" :size="16" class="m" /></div>
        <div class="li"><span class="xs b m" style="width: 44px">FT</span><span class="sm f1">After the last final whistle · results &amp; rewards</span><Icon name="whistle" :size="16" class="m" /></div>
      </div>

      <div class="card flat">
        <div v-for="f in fixtures" :key="f.id" class="li">
          <span class="av xs" :style="{ background: clubColor(f.homeClubName) }">{{ clubShort(f.homeClubName) }}</span>
          <span class="sm b f1">{{ f.homeClubName }} v {{ f.awayClubName }}</span>
          <span class="av xs" :style="{ background: clubColor(f.awayClubName) }">{{ clubShort(f.awayClubName) }}</span>
          <span class="xs m" style="width: 64px; text-align: right">{{ dayTime(f.kickoffAt) }}</span>
        </div>
      </div>

      <div class="row g6">
        <div class="stat w"><b>{{ num(round.rules?.rewards?.participationRp ?? 50) }}</b><span>RP · finish</span></div>
        <div class="stat w"><b>+{{ num(round.rules?.rewards?.winnerBonusRp ?? 100) }}</b><span>RP · winner</span></div>
        <div class="stat w"><b class="gold">+{{ hh.bonus }}</b><span>Home Hero</span></div>
      </div>
      <div class="note"><Icon name="info" :size="16" /><span>Reward points are separate from fantasy points. Every finisher gets the finish reward; each 1st place (ties included) gets the winner bonus.</span></div>
      <RouterLink to="/rules" class="card row"><Icon name="ball" :size="20" class="red" /><span class="sm b f1">Scoring &amp; rules</span><Icon name="chevron" :size="18" class="m" /></RouterLink>
    </main>
    <main v-else class="ct">
      <div v-if="loading" class="skel" style="height: 260px" />
      <div v-else class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">Round not found</b><RouterLink to="/play" class="btn sm">Back to rounds</RouterLink></div>
    </main>

    <footer v-if="cta" class="foot" style="background: var(--bg)">
      <div class="row g6">
        <RouterLink v-if="cta.secondary" :to="cta.secondary.to" class="btn ghost f1">{{ cta.secondary.label }}</RouterLink>
        <RouterLink v-if="cta.to" :to="cta.to" class="btn f1">{{ cta.label }}</RouterLink>
        <button v-else class="btn f1" disabled>{{ cta.label }}</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.hero-head { background: linear-gradient(160deg, #2A0A0D 0%, #1A1D23 60%) !important; }
.cd { background: rgba(255, 255, 255, .08); border-radius: 10px; padding: 6px 10px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 50px; }
.cd b { font-size: 26px; font-variant-numeric: tabular-nums; }
.cd span { font-size: 11px; color: #9AA0A9; }
</style>
