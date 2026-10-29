<script setup>
// Live tactics (design 4.2) + substitution sheet (4.3), fed by the SSE round stream.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import Avatar from '../components/Avatar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Flag from '../components/Flag.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { countdown, signed } from '../lib/format.js'
import { groupEvents, isOpen, isSettled, lineKind } from '../lib/liveDiff.js'
import { useNow } from '../lib/now.js'
import { positionCode, shortName } from '../lib/players.js'
import { twistCopy } from '../lib/rules.js'
import { demo } from '../stores/demo.js'
import { useLive } from '../stores/live.js'
import { rounds } from '../stores/rounds.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const { live } = useLive(id)
const now = useNow()

const round = computed(() => live.round ?? rounds.byId[id])
const team = computed(() => live.team)
const rules = computed(() => round.value?.rules)
const twist = computed(() => twistCopy(rules.value))
const minute = computed(() => {
  if (live.minute != null) return live.minute
  const lines = live.timeline ?? []
  return lines.length ? Math.max(...lines.map((l) => l.matchMinute ?? 0)) : null
})
const twistActive = computed(() => minute.value != null && twist.value?.from != null && minute.value >= twist.value.from)
const players = computed(() => {
  const map = new Map()
  for (const s of team.value?.starters ?? []) map.set(s.player.id, s.player)
  if (team.value?.bench) map.set(team.value.bench.player.id, team.value.bench.player)
  return map
})
const events = computed(() => groupEvents(live.timeline ?? []).filter((e) => e.kind !== 'APPEARANCE').reverse())
const bookedIds = computed(() => new Set(groupEvents(live.timeline ?? []).filter((e) => e.kind === 'YELLOW_CARD' || e.kind === 'RED_CARD').map((e) => e.playerId)))
const pending = computed(() => team.value?.pendingSubstitution ?? null)
const pendingLeft = computed(() => (pending.value ? Math.max(0, Date.parse(pending.value.effectiveAt) - now.value) : 0))
const windowOpen = computed(() => {
  const r = round.value
  if (!r?.subWindowOpensAt) return true
  return now.value >= Date.parse(r.subWindowOpensAt) && now.value < Date.parse(r.subWindowClosesAt)
})
const windowLeft = computed(() => Date.parse(round.value?.subWindowClosesAt) - now.value)
const canSub = computed(() => team.value && team.value.subsRemaining > 0 && !pending.value && windowOpen.value && team.value.bench)
const settled = computed(() => isSettled(round.value?.status))
const total = computed(() => live.leaderboard.length)
const rankMove = computed(() => {
  const prev = live.prevRanks?.[team.value?.id]
  return prev && team.value?.rank ? prev - team.value.rank : 0
})

// Backend rule (DUPLICATE_COUNTRY): after the swap the five must still be five countries, so a
// bench player who shares a country with a starter can only replace that starter.
const countryTwin = computed(() => {
  const country = team.value?.bench?.player.countryId
  return team.value?.starters.find((s) => s.player.countryId === country)?.player ?? null
})
const canReplace = (s) => !countryTwin.value || countryTwin.value.id === s.player.id

// suggested outgoing player among the allowed ones: booked first, then the lowest scorer
const suggestedOut = computed(() => {
  const st = (team.value?.starters ?? []).filter(canReplace)
  const booked = st.find((s) => bookedIds.value.has(s.player.id))
  if (booked) return booked.player
  return [...st].sort((a, b) => a.points - b.points)[0]?.player ?? null
})

const subOpen = ref(route.query.sub === '1')
const outId = ref(null)
const subbing = ref(false)
watch(subOpen, (v) => {
  if (v) outId.value = suggestedOut.value?.id ?? null
})
if (subOpen.value) outId.value = suggestedOut.value?.id ?? null
watch(suggestedOut, (p) => {
  if (subOpen.value && !outId.value) outId.value = p?.id ?? null
})
const outPlayer = computed(() => team.value?.starters.find((s) => s.player.id === outId.value && canReplace(s)) ?? null)
// TeamSnapshot keeps no sub history, so the swap we made is remembered locally.
const doneSub = computed(() => {
  const s = team.value?.subsUsed ? demo.subs[id] : null
  return s ? { in: players.value.get(s.incomingPlayerId), out: players.value.get(s.outgoingPlayerId) } : null
})

async function confirmSub() {
  if (!team.value || !outPlayer.value) return
  subbing.value = true
  try {
    const snap = await api.substitute(team.value.id, {
      outgoingPlayerId: outPlayer.value.player.id,
      incomingPlayerId: team.value.bench.player.id,
      expectedVersion: team.value.version,
    })
    live.team = snap
    rounds.teams[id] = snap
    if (snap.pendingSubstitution) demo.subs[id] = { ...snap.pendingSubstitution }
    subOpen.value = false
    toast({ title: 'Substitution accepted', body: `${shortName(team.value.bench?.player.name ?? '')} comes on in ${rules.value?.subActivationDelaySeconds ?? 60}s. ${shortName(outPlayer.value?.player.name ?? '')} still scores until then.`, tone: 'success' })
  } catch (e) {
    if (e.code === 'VERSION_CONFLICT') toast({ title: 'Your team changed', body: 'We reloaded it — review the substitution again.', tone: 'error' })
    else toastError(e, 'Substitution failed')
  } finally {
    subbing.value = false
  }
}

function eventVerb(ev) {
  return { GOAL: 'scored', ASSIST: 'assist', YELLOW_CARD: 'booked', RED_CARD: 'sent off', OWN_GOAL: 'own goal' }[ev.kind] ?? ev.kind.toLowerCase()
}
function modPill(line) {
  const k = lineKind(line)
  if (k === 'CAPTAIN') return { text: `C ${signed(line.points)}`, cls: 'r' }
  if (k === 'HOME_HERO') return { text: `★ ${signed(line.points)}`, cls: 'y' }
  if (k === 'TWIST') return { text: `×${rules.value?.twist?.multiplier ?? 2} late`, cls: 'k' }
  return null
}
function playerTone(s) {
  if (bookedIds.value.has(s.player.id) || s.points < 0) return 'risk'
  if (s.points >= 5) return 'hot'
  return ''
}
</script>

<template>
  <div class="screen">
    <TopBar :back="`/rounds/${id}`" tone="red">
      <template #title><span class="logo">SportyStreet</span></template>
      <template #right><RouterLink to="/rules" class="icon-btn" aria-label="Rules"><Icon name="info" :size="22" /></RouterLink></template>
    </TopBar>

    <main class="ct" style="gap: 10px">
      <div class="row between">
        <div class="row g6">
          <span class="disp" style="font-size: 32px">Live tactics</span>
          <span v-if="settled" class="pill k">FT</span>
          <span v-else class="pill r"><span class="dot live" />{{ minute != null ? `${minute}'` : 'LIVE' }}</span>
        </div>
        <div class="col g2 items-end score-box">
          <span class="xs m">Your score</span>
          <span class="disp" style="font-size: 26px"><AnimatedNumber :value="team?.score ?? 0" /> pts</span>
        </div>
      </div>

      <div v-if="live.status !== 'open' && !team" class="col g8">
        <div class="skel" style="height: 90px" /><div class="skel" style="height: 60px" /><div class="skel" style="height: 120px" />
      </div>

      <RouterLink v-if="round && isOpen(round.status)" :to="`/rounds/${id}${team ? '/locked' : '/build'}`" class="card soft row">
        <Icon name="clock" :size="22" class="red" />
        <span class="col g2 f1"><b class="sm">Not live yet</b><span class="xs m">Live tactics start when squads lock — {{ team ? 'your five is in' : 'build your five first' }}.</span></span>
        <Icon name="chevron" :size="18" class="m" />
      </RouterLink>
      <RouterLink v-if="settled" :to="`/rounds/${id}/result`" class="card dark row">
        <Icon name="whistle" :size="22" /><span class="sm b f1">Full time — see your result &amp; recap</span><Icon name="chevron" :size="18" />
      </RouterLink>

      <div v-if="twist && !settled" class="twist" :class="{ active: twistActive }">
        <div class="row" style="background: var(--red); padding: 6px 12px">
          <span class="xs b up">{{ twistActive ? '● Active twist' : 'Next twist' }}</span>
          <span class="xs f1 tr-a" style="opacity: .85">{{ twistActive ? `since ${twist.from}'` : minute != null ? `at ${twist.from}' · ${Math.max(0, twist.from - minute)}' of play to go` : `from ${twist.from}'` }}</span>
        </div>
        <div class="row" style="padding: 12px 14px">
          <div class="col g2 f1"><span class="disp" style="font-size: 30px">{{ twist.title }}</span><span class="xs soft-w">{{ twist.detail }}</span></div>
          <span class="disp twist-x">×{{ rules?.twist?.multiplier ?? 2 }}</span>
        </div>
      </div>

      <template v-if="team">
        <div class="row g6">
          <div class="mini"><span class="xs m">Rank</span><b class="sm">#{{ team.rank || '—' }} <span v-if="rankMove" :class="rankMove > 0 ? 'grn' : 'red'">{{ rankMove > 0 ? '▲' : '▼' }}{{ Math.abs(rankMove) }}</span></b></div>
          <RouterLink :to="`/rounds/${id}/standings`" class="mini"><span class="xs m">Standings</span><b class="sm">of {{ total || '—' }} →</b></RouterLink>
          <div class="mini"><span class="xs m">Sub window</span><b class="sm">{{ team.subsRemaining === 0 ? 'Used' : windowOpen ? (windowLeft > 3600_000 ? 'Open' : countdown(windowLeft) + ' left') : 'Closed' }}</b></div>
        </div>

        <div class="row g6">
          <div v-for="s in team.starters" :key="s.player.id" class="pcard" :class="playerTone(s)">
            <Avatar :player="s.player" size="sm" :captain="s.player.id === team.captainPlayerId" :hero="s.player.id === team.homeHeroPlayerId" />
            <span class="xs b ellipsis" style="max-width: 100%">{{ shortName(s.player.name) }}</span>
            <span class="xs b" :class="{ grn: playerTone(s) === 'hot', gold: playerTone(s) === 'risk', m: !playerTone(s) }">{{ bookedIds.has(s.player.id) ? '🟨 ' : '' }}<AnimatedNumber :value="s.points" /></span>
          </div>
        </div>

        <div v-if="pending" class="card col g6 pending">
          <div class="row between"><b class="sm">⚡ {{ shortName(players.get(pending.incomingPlayerId)?.name ?? '') }} is coming on</b><span class="pill g num">{{ countdown(pendingLeft) }}</span></div>
          <div class="prog g"><i :style="{ width: `${100 - (pendingLeft / ((rules?.subActivationDelaySeconds ?? 60) * 1000)) * 100}%` }" /></div>
          <span class="xs m">{{ shortName(players.get(pending.outgoingPlayerId)?.name ?? '') }} still scores until then. The swap can't be undone.</span>
        </div>

        <div v-else-if="!team.subsRemaining" class="card row g12">
          <Avatar :player="doneSub?.in" name="?" size="md" />
          <div class="col g2 f1">
            <b class="sm">{{ doneSub?.in ? `${shortName(doneSub.in.name)} is on` : 'Substitution used' }}</b>
            <span class="xs m">{{ doneSub?.out ? `${shortName(doneSub.out.name)} came off · ` : '' }}scores only from events after the swap</span>
          </div>
          <span class="pill g">Sub used</span>
        </div>

        <div v-else class="card col g12">
          <div class="row between">
            <div class="row g6">
              <Avatar :player="suggestedOut ?? team.starters[0]?.player" size="md" />
              <div class="col g2">
                <b class="sm">{{ team.subsRemaining ? shortName(suggestedOut?.name ?? '').toUpperCase() : 'SUB USED' }}</b>
                <span class="xs b" :class="suggestedOut && bookedIds.has(suggestedOut.id) ? 'gold' : 'grn'">● {{ team.subsRemaining ? (suggestedOut && bookedIds.has(suggestedOut.id) ? 'On field · booked' : 'On field') : 'Swap complete' }}</span>
              </div>
            </div>
            <Icon name="swap" :size="22" class="m" />
            <div class="row g6">
              <div class="col g2 items-end"><b class="sm">{{ shortName(team.bench?.player.name ?? '').toUpperCase() }}</b><span class="xs m">● {{ team.subsRemaining ? 'Bench · ready' : 'Off' }}</span></div>
              <Avatar v-if="team.bench" :player="team.bench.player" size="md" />
            </div>
          </div>
          <button class="btn md" :disabled="!canSub" @click="subOpen = true">{{ team.subsRemaining ? (windowOpen ? 'Use my substitution' : 'Sub window closed') : 'Substitution used' }}</button>
        </div>

        <div class="card" style="padding: 2px 14px">
          <div v-if="!events.length" class="li"><span class="sm m">No points events yet — appearances are in. Goals, assists and cards show up here.</span></div>
          <div v-for="ev in events.slice(0, 12)" :key="ev.key" class="li ev-row" style="padding: 9px 0">
            <span class="xs m b" style="width: 28px">{{ ev.matchMinute }}'</span>
            <Avatar :player="players.get(ev.playerId)" name="?" size="xs" />
            <span class="sm b f1 ellipsis">{{ shortName(players.get(ev.playerId)?.name ?? 'Player') }} {{ eventVerb(ev) }}</span>
            <template v-for="m in ev.modifiers" :key="m.component"><span v-if="modPill(m)" class="pill" :class="modPill(m).cls">{{ modPill(m).text }}</span></template>
            <span class="pill" :class="ev.points >= 0 ? 'g' : 'y'">{{ signed(ev.points) }}</span>
          </div>
        </div>
      </template>

      <div v-else-if="live.status === 'open'" class="empty">
        <div class="ico"><Icon name="lock" /></div>
        <b style="color: var(--ink)">You have no squad in this round</b>
        <RouterLink :to="`/rounds/${id}/standings`" class="btn sm">Watch the standings</RouterLink>
      </div>
      <div v-if="live.status === 'error'" class="note"><Icon name="info" :size="16" /><span>Reconnecting to live updates…</span></div>
    </main>

    <!-- 4.3 substitution -->
    <BottomSheet :open="subOpen && !!team" @close="subOpen = false; router.replace({ query: {} })">
      <template v-if="team">
        <div class="row between"><span class="h2">Make your substitution</span><span class="pill r">1 of 1</span></div>
        <div class="row" style="background: var(--green-50); border-radius: 14px; padding: 10px 12px">
          <span class="xs b grn up" style="width: 30px">IN</span>
          <Avatar :player="team.bench?.player" size="sm" />
          <div class="col g2 f1"><b class="sm">{{ team.bench?.player.name }}</b><span class="xs m">{{ positionCode(team.bench?.player.position) }} · {{ team.bench?.player.clubName }}</span></div>
          <span class="pill g">Ready</span>
        </div>
        <span class="xs b m up">Who comes off?</span>
        <div v-if="countryTwin" class="note" style="background: var(--gold-50); color: #6B4E00">
          <Flag :country="team.bench?.player.countryName ?? ''" :size="14" />
          <span>{{ shortName(team.bench?.player.name ?? '') }} is from {{ team.bench?.player.countryName }}, like {{ shortName(countryTwin.name) }} — your five must keep five countries, so he can only replace {{ shortName(countryTwin.name) }}.</span>
        </div>
        <div class="col g6">
          <button v-for="s in team.starters" :key="s.player.id" class="opt" :class="{ on: outId === s.player.id }" :disabled="!canReplace(s)" @click="outId = s.player.id">
            <Avatar :player="s.player" size="sm" />
            <span class="col g2 f1" style="text-align: left">
              <b class="sm">{{ shortName(s.player.name) }}<span v-if="s.player.id === team.captainPlayerId" class="pill r" style="margin-left: 6px; height: 18px">C</span></b>
              <span class="xs m">{{ canReplace(s) ? `${positionCode(s.player.position)} · ${s.points} pts${bookedIds.has(s.player.id) ? ' · booked' : ''}` : `${team.bench?.player.countryName} would appear twice` }}</span>
            </span>
            <span v-if="canReplace(s)" class="check" :class="{ on: outId === s.player.id }"><Icon v-if="outId === s.player.id" name="check" :size="13" :stroke="3.2" /></span>
            <Icon v-else name="lock" :size="16" class="m" />
          </button>
        </div>
        <div v-if="outPlayer" class="card soft col g4" style="padding: 12px">
          <b class="sm">What happens</b>
          <span class="xs" style="line-height: 1.5">
            {{ shortName(outPlayer.player.name) }} keeps his <b>{{ outPlayer.points }} pts</b> and still scores for {{ rules?.subActivationDelaySeconds ?? 60 }}s. {{ shortName(team.bench?.player.name ?? '') }} scores only from events after that.
            <template v-if="twist?.from != null"> {{ twist.title }} from {{ twist.from }}' — a goal by him would be worth {{ (rules?.base?.GOAL ?? 5) * (rules?.twist?.multiplier ?? 2) }}.</template>
            <template v-if="outPlayer.player.id === team.captainPlayerId">{{ ' ' }}<b>He is your captain — the captain is never reassigned, so you lose the ×{{ rules?.captainMultiplier ?? 2 }} for future events.</b></template>
            This can't be undone.
          </span>
        </div>
        <button class="btn" :disabled="!outPlayer || subbing || !canSub" @click="confirmSub">
          <span v-if="subbing" class="spin" />Swap {{ shortName(outPlayer?.player.name ?? '…') }} → {{ shortName(team.bench?.player.name ?? '') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.score-box { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 6px 12px; }
.twist { border-radius: 18px; overflow: hidden; background: var(--dark); color: #fff; transition: box-shadow .4s; }
.twist.active { box-shadow: 0 0 0 2px var(--red), 0 10px 24px rgba(228, 24, 39, .3); }
.twist-x { font-size: 44px; color: #FF5A66; }
.mini { flex: 1; display: flex; flex-direction: column; gap: 2px; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.pcard { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 8px 2px; transition: background .4s, border-color .4s; }
.pcard.hot { background: var(--green-50); border: 1.5px solid var(--green); }
.pcard.risk { background: var(--gold-50); border: 1.5px solid var(--gold); }
.pending { border: 1.5px solid var(--green); background: linear-gradient(180deg, #F2FBF6, #fff); }
.ev-row { animation: rise .4s var(--ease) both; }
</style>
