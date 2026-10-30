<script setup>
// Squad builder: empty (design 3.1) → complete (3.4) → review & lock sheet (3.5).
// Backend rules: 5 starters from 5 different countries + 1 bench, free formation, no credits,
// captain ×2, Home Hero = the starter from your home country.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Flag from '../components/Flag.vue'
import HomeHeroCard from '../components/HomeHeroCard.vue'
import Icon from '../components/Icon.vue'
import PitchView from '../components/PitchView.vue'
import PlayerSheet from '../components/PlayerSheet.vue'
import Toggle from '../components/Toggle.vue'
import TopBar from '../components/TopBar.vue'
import { clock, countdown } from '../lib/format.js'
import { smartPick } from '../lib/autoPick.js'
import { useNow } from '../lib/now.js'
import { positionCode, shortName } from '../lib/players.js'
import { twistCopy } from '../lib/rules.js'
import { demo } from '../stores/demo.js'
import { draftFromAutoPick, draftFromTeam, lineupBody, removePlayer, useDraft, validate } from '../stores/draft.js'
import { enableAlerts, notify, savePrefs } from '../stores/notify.js'
import { loadMyTeam, loadRound, phaseOf, rounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const now = useNow()
const draft = useDraft(id)

const autoPicking = ref(false)
const saving = ref(false)
const reviewOpen = ref(false)
const sheetPlayer = ref(null)
const ready = ref(false)

onMounted(async () => {
  try {
    const [, team] = await Promise.all([loadRound(id), loadMyTeam(id)])
    if (team && (draft.starters.length === 0 || (draft.fromTeamVersion != null && draft.fromTeamVersion !== team.version))) draftFromTeam(id, team)
  } catch (e) {
    toastError(e, 'Could not load the round')
  } finally {
    ready.value = true
  }
})

const round = computed(() => rounds.byId[id])
const team = computed(() => rounds.teams[id])
const rules = computed(() => round.value?.rules ?? session.rules)
const open = computed(() => phaseOf(round.value) === 'open')
// Practice mode: the round already kicked off (or isn't open) and I have no squad in it. The builder
// stays fully usable — auto-pick, swaps, captain, review — and "lock" saves a practice five that the
// share screen shows. Nothing is sent to the server; real entries need an open round.
// Showcase matchdays (lib/showcase.js) are always practice: they exist only in the app.
const practice = computed(() => ready.value && Boolean(round.value) && !team.value && (!open.value || Boolean(round.value.showcase)))
const editable = computed(() => open.value || practice.value)
const homeCountryId = computed(() => session.user?.countryId ?? null)
const check = computed(() => validate(draft, rules.value, homeCountryId.value))
const hero = computed(() => check.value.hero)
const twist = computed(() => twistCopy(rules.value))
const left = computed(() => Date.parse(round.value?.entryDeadline) - now.value)
const onBreak = computed(() => demo.breakUntil && Date.parse(demo.breakUntil) > now.value)
const complete = computed(() => draft.starters.length === check.value.need && draft.bench)
// The live sub must keep five countries (backend DUPLICATE_COUNTRY), so a bench player from a
// starter's country can only ever replace that starter — worth knowing before locking.
const benchTwin = computed(() => (draft.bench ? draft.starters.find((p) => p.countryId === draft.bench.countryId) ?? null : null))
const dupeCountries = computed(() => {
  const seen = new Map()
  for (const p of draft.starters) seen.set(p.countryId, (seen.get(p.countryId) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([c]) => c))
})

const ctaLabel = computed(() => {
  if (!editable.value) return 'Squads are locked'
  if (onBreak.value) return 'On a break'
  const n = check.value.missing
  if (n > 0) return `Pick ${n} more player${n > 1 ? 's' : ''}`
  return practice.value ? 'Review practice squad' : team.value ? 'Review changes' : 'Review squad'
})

let pool = null
async function autoPick() {
  autoPicking.value = true
  try {
    pool ??= (await api.players(id)).items ?? []
    const previousIds = [...draft.starters.map((p) => p.id), draft.bench?.id]
    const pick = smartPick(pool, { homeCountryId: homeCountryId.value, previousIds }) ?? (await api.autoPick(id, true))
    draftFromAutoPick(id, pick)
    toast({ title: 'Auto-picked your five', body: pick.explanation ?? 'Swap anyone with one tap.', tone: 'success' })
  } catch (e) {
    toastError(e, 'Auto-pick failed')
  } finally {
    autoPicking.value = false
  }
}

function pick(target, opts = {}) {
  router.push({ path: `/rounds/${id}/pick`, query: { target, ...opts } })
}
function onEmpty(hint) {
  pick('starter', hint ? { pos: hint } : {})
}
function findCountrymen() {
  pick('starter', { mine: '1' })
}

const sheetIn = computed(() => {
  const p = sheetPlayer.value
  if (!p) return null
  if (draft.starters.some((s) => s.id === p.id)) return 'starter'
  if (draft.bench?.id === p.id) return 'bench'
  return null
})
function onRemove(p) {
  removePlayer(draft, p.id)
  sheetPlayer.value = null
}
function onCaptain(p) {
  draft.captainId = p.id
  sheetPlayer.value = null
}

async function lockIn() {
  if (practice.value) {
    reviewOpen.value = false
    router.replace({ path: `/rounds/${id}/locked`, query: { practice: '1' } })
    return
  }
  saving.value = true
  try {
    const body = lineupBody(draft)
    let snap
    if (team.value) snap = await api.updateLineup(team.value.id, { ...body, expectedVersion: team.value.version })
    else snap = await api.createTeam(id, body)
    rounds.teams[id] = snap
    draft.fromTeamVersion = snap.version
    reviewOpen.value = false
    // Replace, not push: after locking, back/close must not return to the builder.
    router.replace(`/rounds/${id}/locked`)
  } catch (e) {
    if (e.code === 'VERSION_CONFLICT' || e.code === 'TEAM_ALREADY_EXISTS') {
      const fresh = await loadMyTeam(id).catch(() => null)
      if (fresh) draft.fromTeamVersion = fresh.version
      toast({ title: 'Your team changed elsewhere', body: 'We loaded the latest version — review and lock again.', tone: 'error' })
    } else {
      toastError(e, 'Could not lock your five')
    }
  } finally {
    saving.value = false
  }
}

const alertsOn = computed(() => notify.permission === 'granted' && notify.prefs.tactical)
async function toggleAlerts(v) {
  if (!v) {
    notify.prefs.tactical = false
    savePrefs()
    return
  }
  const res = await enableAlerts()
  if (res !== 'granted') toast({ title: 'Alerts not enabled', body: res === 'ios-install' ? 'Add SportyStreet to your Home Screen first (iOS).' : 'Notifications are blocked in this browser.', tone: 'error' })
}
</script>

<template>
  <div class="screen white">
    <TopBar back="/play" :title="round?.name ?? ''">
      <template #right>
        <span v-if="practice" class="pill y">PRACTICE</span>
        <span v-else-if="open" class="xs b red num">{{ countdown(left) }}</span>
        <span v-else-if="round" class="pill k">LOCKED</span>
      </template>
    </TopBar>

    <main class="ct" style="padding-top: 4px">
      <div class="row between">
        <div class="col g2">
          <span class="h2">Your world five</span>
          <span class="xs m b">{{ draft.starters.length ? 'Tap a player to swap or captain' : `${check.need} starters · ${check.need} countries · 1 bench` }}</span>
        </div>
        <button class="btn sm" :class="{ sec: draft.starters.length }" :disabled="autoPicking || !editable" @click="autoPick">
          <span v-if="autoPicking" class="spin" />
          <Icon v-else :name="draft.starters.length ? 'swap' : 'star'" :size="16" :stroke="2.2" />
          {{ draft.starters.length ? 'Re-pick' : 'Auto-pick' }}
        </button>
      </div>

      <!-- replaces the credits bar: the real constraint is five different countries -->
      <div class="row g12">
        <span class="xs b">Countries</span>
        <div class="row g4 f1">
          <span v-for="i in check.need" :key="i" class="cslot" :class="{ on: draft.starters[i - 1], bad: draft.starters[i - 1] && dupeCountries.has(draft.starters[i - 1].countryId) }">
            <Flag v-if="draft.starters[i - 1]" :country="draft.starters[i - 1].countryName" :size="14" />
          </span>
        </div>
        <span class="xs b" :class="{ red: dupeCountries.size }">{{ check.countryIds.length }}/{{ check.need }} different</span>
      </div>

      <HomeHeroCard
        :hero="hero"
        :captain="hero && hero.id === draft.captainId"
        :country-name="session.countryName"
        :has-country="!!homeCountryId"
        :rules="rules"
        @find="findCountrymen"
        @open="sheetPlayer = $event"
      />

      <PitchView
        :players="draft.starters"
        :slots="check.need"
        :captain-id="draft.captainId"
        :hero-id="hero?.id"
        @select="sheetPlayer = $event"
        @empty="onEmpty"
      />

      <button class="bench" @click="draft.bench ? (sheetPlayer = draft.bench) : pick('bench')">
        <span class="xs b m up" style="width: 46px">Bench</span>
        <template v-if="draft.bench">
          <Avatar :player="draft.bench" size="sm" />
          <span class="col g2 f1"><b class="sm">{{ shortName(draft.bench.name) }}</b><span class="xs m">{{ positionCode(draft.bench.position) }} · your one live sub</span></span>
          <Icon name="swap" :size="18" class="m" />
        </template>
        <template v-else>
          <span class="av sm" style="background: #E8EAEE; color: var(--mute)">+</span>
          <span class="sm m f1" style="text-align: left">Any player · comes on with your live sub</span>
        </template>
      </button>

      <div v-if="benchTwin" class="note" style="background: var(--gold-50); color: #6B4E00">
        <Icon name="swap" :size="16" />
        <span>{{ shortName(draft.bench.name) }} is from {{ draft.bench.countryName }}, like {{ shortName(benchTwin.name) }}: your live sub can only replace {{ shortName(benchTwin.name) }}{{ benchTwin.id === draft.captainId ? ' — your captain' : '' }}. Pick a bench player from another country to keep every option.</span>
      </div>
      <div v-if="draft.explanation" class="note"><Icon name="star" :size="16" /><span>{{ draft.explanation }}</span></div>
      <div v-if="complete && !check.ok" class="note" style="background: var(--red-50); color: var(--red)"><Icon name="info" :size="16" /><span>{{ check.errors.join(' · ') }}</span></div>
      <div v-if="practice" class="note" style="background: var(--gold-50); color: #6B4E00"><Icon name="info" :size="16" /><span>{{ round.showcase ? `${round.name} is a showcase matchday` : `${round.name} has already kicked off` }}, so this is a <b>practice squad</b>: build it, captain it and share it.</span></div>
      <div v-else-if="!open && ready && round" class="note"><Icon name="lock" :size="16" /><span>This round is {{ phaseOf(round) === 'live' ? 'live' : 'not open' }} — squads can't be changed.</span></div>
    </main>

    <footer class="foot">
      <button class="btn" :disabled="!editable || !check.ok || onBreak" @click="reviewOpen = true">{{ ctaLabel }}</button>
    </footer>

    <PlayerSheet
      :open="!!sheetPlayer"
      :player="sheetPlayer"
      :round="round"
      :home-country-id="homeCountryId"
      :in-squad="sheetIn"
      :is-captain="sheetPlayer?.id === draft.captainId"
      @close="sheetPlayer = null"
      @remove="onRemove"
      @captain="onCaptain"
    />

    <!-- 3.5 Review & lock -->
    <BottomSheet :open="reviewOpen" @close="reviewOpen = false">
      <div class="h2">{{ team ? 'Save your changes?' : 'Ready to lock in?' }}</div>
      <div class="card flat">
        <div v-for="p in draft.starters" :key="p.id" class="li">
          <Avatar :player="p" size="sm" />
          <div class="col g2 f1">
            <span class="sm b ellipsis">{{ shortName(p.name) }}</span>
            <div v-if="p.id === draft.captainId || (hero && p.id === hero.id)" class="row g4">
              <span v-if="p.id === draft.captainId" class="pill r">Captain ×{{ rules?.captainMultiplier ?? 2 }}</span>
              <span v-if="hero && p.id === hero.id" class="pill y">★ Home Hero</span>
            </div>
          </div>
          <Flag :country="p.countryName" />
          <span class="xs m" style="width: 22px">{{ positionCode(p.position) }}</span>
        </div>
        <div v-if="draft.bench" class="li">
          <Avatar :player="draft.bench" size="sm" />
          <span class="sm b f1">{{ shortName(draft.bench.name) }}</span>
          <span class="pill o">Bench</span>
        </div>
      </div>
      <div class="col g6">
        <div v-if="practice" class="row g6 items-start"><Icon name="info" :size="18" class="m" /><span class="sm m">Practice squad — saved on this device, not entered in {{ round?.name }}.</span></div>
        <div v-else class="row g6 items-start"><Icon name="lock" :size="18" class="m" /><span class="sm m">You can edit until <b style="color: var(--ink)">{{ clock(round?.entryDeadline) }}</b>, then the squad locks.</span></div>
        <div class="row g6 items-start"><Icon name="swap" :size="18" class="m" /><span class="sm m">One substitution during play. {{ draft.bench ? shortName(draft.bench.name) : 'Your bench player' }} scores only from events after coming on ({{ rules?.subActivationDelaySeconds ?? 60 }}s after you confirm){{ benchTwin ? ` and can only replace ${shortName(benchTwin.name)} (same country)` : '' }}.</span></div>
        <div v-if="twist" class="row g6 items-start"><Icon name="bolt" :size="18" class="m" /><span class="sm m">{{ twist.short }} — goals late in the game are worth double.</span></div>
      </div>
      <div class="row"><Toggle :model-value="alertsOn" label="Alerts" :disabled="notify.busy" @update:model-value="toggleAlerts" /><span class="sm f1">Alert me for sub moments &amp; my points</span></div>
      <button class="btn" :disabled="saving" @click="lockIn"><span v-if="saving" class="spin" />{{ practice ? 'Save my practice five' : team ? 'Save my five' : 'Lock in my five' }}</button>
    </BottomSheet>
  </div>
</template>

<style scoped>
.cslot { flex: 1; height: 22px; border-radius: 6px; background: #E8EAEE; display: flex; align-items: center; justify-content: center; transition: background .25s; }
.cslot.on { background: var(--green-50); box-shadow: inset 0 0 0 1.5px var(--green); }
.cslot.bad { background: var(--red-50); box-shadow: inset 0 0 0 1.5px var(--red); }
</style>
