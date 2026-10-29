<script setup>
// Player picker (design 3.2): position filter, search, "My country", Home Hero tags.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import Flag from '../components/Flag.vue'
import Icon from '../components/Icon.vue'
import PlayerSheet from '../components/PlayerSheet.vue'
import TopBar from '../components/TopBar.vue'
import { POSITIONS, positionCode, shortName } from '../lib/players.js'
import { addStarter, removePlayer, setBench, useDraft } from '../stores/draft.js'
import { loadRound, rounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const draft = useDraft(id)
const target = computed(() => (route.query.target === 'bench' ? 'bench' : 'starter'))
const replaceId = computed(() => route.query.replace ?? null)

const pos = ref(typeof route.query.pos === 'string' && POSITIONS.includes(route.query.pos) ? route.query.pos : 'ALL')
const query = ref('')
const mine = ref(route.query.mine === '1')
const sortBy = ref('name')
const hideOut = ref(true)
const players = ref([])
const loading = ref(false)
const sheetPlayer = ref(null)

const round = computed(() => rounds.byId[id])
const need = computed(() => round.value?.rules?.starterCount ?? 5)
const homeCountryId = computed(() => session.user?.countryId ?? null)
const replacing = computed(() => draft.starters.find((p) => p.id === replaceId.value) ?? null)

// A round has 60 players, so the whole pool is loaded once and filtered here: the backend's
// position filter is an exact match on its own codes (GK/DEF/MID/FWD) and name search ignores clubs.
async function fetchPlayers() {
  loading.value = true
  try {
    players.value = (await api.players(id)).items ?? []
  } catch (e) {
    toastError(e, 'Could not load players')
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  if (!round.value) loadRound(id).catch(() => {})
  fetchPlayers()
})

// displayStats is empty in the current backend; offer a stat sort only when stats exist.
const statKeys = computed(() => ['form', 'avgPoints'].filter((k) => players.value.some((p) => p.displayStats?.[k] != null)))
const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  let items = players.value.filter((p) =>
    (pos.value === 'ALL' || positionCode(p.position) === pos.value) &&
    (!mine.value || !homeCountryId.value || p.countryId === homeCountryId.value) &&
    (!q || p.name.toLowerCase().includes(q) || p.clubName?.toLowerCase().includes(q) || p.countryName?.toLowerCase().includes(q)),
  )
  if (hideOut.value) items = items.filter((p) => p.eligible !== false)
  const stat = (p) => Number(p.displayStats?.[sortBy.value] ?? 0)
  return [...items].sort((a, b) =>
    Number(b.eligible !== false) - Number(a.eligible !== false) ||
    (sortBy.value === 'name' ? a.name.localeCompare(b.name) : stat(b) - stat(a)),
  )
})

function stateOf(p) {
  if (p.eligible === false) return 'locked'
  if (draft.starters.some((s) => s.id === p.id)) return 'starter'
  if (draft.bench?.id === p.id) return 'bench'
  if (target.value === 'starter' && conflictOf(p)) return 'swap'
  return 'add'
}
function conflictOf(p) {
  return draft.starters.find((s) => s.countryId === p.countryId && s.id !== p.id && s.id !== replaceId.value) ?? null
}
const isHome = (p) => p.isHomeCountry || (homeCountryId.value && p.countryId === homeCountryId.value)

function add(p) {
  if (p.eligible === false) return
  if (target.value === 'bench') return bench(p)
  const conflict = conflictOf(p)
  const replace = conflict?.id ?? replaceId.value ?? undefined
  if (!replace && draft.starters.length >= need.value) {
    toast({ title: 'Your five is full', body: 'Tap a player on the pitch to swap them.', tone: 'error' })
    return
  }
  addStarter(draft, p, { replaceId: replace, max: need.value })
  sheetPlayer.value = null
  const home = isHome(p) ? ' · ★ Home Hero' : ''
  toast({ title: `${shortName(p.name)} is in${home}`, body: conflict ? `Swapped out ${shortName(conflict.name)} (same country)` : `${draft.starters.length}/${need.value} starters`, duration: 2200 })
  if (replaceId.value || draft.starters.length >= need.value) router.back()
}
function bench(p) {
  setBench(draft, p)
  sheetPlayer.value = null
  toast({ title: `${shortName(p.name)} on the bench`, body: 'He comes on with your one live sub.', duration: 2200 })
  router.back()
}

const title = computed(() => {
  if (replacing.value) return `Replace ${shortName(replacing.value.name)}`
  if (target.value === 'bench') return 'Pick your bench player'
  return 'Pick a starter'
})
</script>

<template>
  <div class="screen white">
    <TopBar :back="`/rounds/${id}/build`" :title="title">
      <template #right><span class="xs b">{{ draft.starters.length }}/{{ need }}{{ draft.bench ? ' +1' : '' }}</span></template>
    </TopBar>
    <div class="col g8" style="padding: 2px 16px 10px; background: #fff">
      <div class="seg">
        <button :class="{ on: pos === 'ALL' }" @click="pos = 'ALL'">All</button>
        <button v-for="p in POSITIONS" :key="p" :class="{ on: pos === p }" @click="pos = p">{{ p }}</button>
      </div>
      <div class="row g6">
        <label class="input sm f1">
          <Icon name="search" :size="18" class="m" />
          <input v-model="query" type="search" placeholder="Search player or club" enterkeyhint="search" />
        </label>
        <button v-if="statKeys.length" class="chip" style="height: 42px" @click="sortBy = sortBy === 'name' ? statKeys[0] : 'name'">{{ sortBy === 'name' ? 'A–Z' : sortBy === 'form' ? 'Form' : 'Avg pts' }} ▾</button>
      </div>
      <div class="chips">
        <button v-if="homeCountryId" class="chip sm" :class="{ ron: mine }" @click="mine = !mine"><Flag :country="session.countryName ?? ''" :size="13" /> My country</button>
        <button class="chip sm" :class="{ ron: hideOut }" @click="hideOut = !hideOut">In this round</button>
      </div>
    </div>

    <main class="ct" style="padding-top: 0; gap: 0">
      <div v-if="loading && !players.length" class="col g8" style="padding-top: 10px">
        <div v-for="i in 6" :key="i" class="skel" style="height: 56px" />
      </div>
      <div v-else-if="!list.length" class="empty">
        <div class="ico"><Icon name="search" /></div>
        <b style="color: var(--ink)">No players found</b>
        <span class="sm">Try another position or clear the filters.</span>
      </div>
      <div
        v-for="p in list"
        v-else
        :key="p.id"
        class="li pick-row"
        :class="{ out: p.eligible === false }"
        role="button"
        tabindex="0"
        @click="sheetPlayer = p"
        @keydown.enter="sheetPlayer = p"
      >
        <Avatar :player="p" size="md" />
        <div class="f1 col g2" style="min-width: 0">
          <div class="row g6">
            <b class="sm ellipsis">{{ p.name }}</b>
            <Flag :country="p.countryName" :size="13" />
            <span v-if="isHome(p)" class="pill y" style="height: 18px; font-size: 10px">★ Home</span>
          </div>
          <span class="xs m ellipsis">
            {{ positionCode(p.position) }} · {{ p.clubName }}
            <template v-if="p.eligible === false"> · Not in this round</template>
            <template v-else-if="p.displayStats?.form != null"> · Form <b :class="p.displayStats.form >= 80 ? 'grn' : 'gold'">{{ p.displayStats.form }}</b></template>
          </span>
        </div>
        <span v-if="p.displayStats?.avgPoints != null" class="sm b">{{ p.displayStats.avgPoints }}</span>
        <button class="act" :class="stateOf(p)" :aria-label="`Pick ${p.name}`" @click.stop="stateOf(p) === 'locked' || stateOf(p) === 'starter' || stateOf(p) === 'bench' ? (sheetPlayer = p) : add(p)">
          <Icon v-if="stateOf(p) === 'starter' || stateOf(p) === 'bench'" name="check" :size="16" :stroke="3" />
          <Icon v-else-if="stateOf(p) === 'locked'" name="lock" :size="16" />
          <Icon v-else-if="stateOf(p) === 'swap'" name="swap" :size="16" :stroke="2.4" />
          <Icon v-else name="plus" :size="16" :stroke="3" />
        </button>
      </div>
    </main>

    <PlayerSheet
      :open="!!sheetPlayer"
      :player="sheetPlayer"
      :round="round"
      :home-country-id="homeCountryId"
      :in-squad="sheetPlayer ? (draft.starters.some((s) => s.id === sheetPlayer.id) ? 'starter' : draft.bench?.id === sheetPlayer.id ? 'bench' : null) : null"
      :is-captain="sheetPlayer?.id === draft.captainId"
      :conflict="sheetPlayer ? conflictOf(sheetPlayer) : null"
      :target="target"
      :full="draft.starters.length >= need && !replaceId"
      @close="sheetPlayer = null"
      @add="add"
      @bench="bench"
      @captain="(p) => { draft.captainId = p.id; sheetPlayer = null }"
      @remove="(p) => { removePlayer(draft, p.id); sheetPlayer = null }"
    />
  </div>
</template>

<style scoped>
.pick-row { padding: 10px 0; cursor: pointer; transition: background .15s; }
.pick-row.out { opacity: .45; }
.act { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; border: 2px solid var(--red); color: var(--red); transition: transform .15s var(--spring), background .2s; }
.act:active { transform: scale(.88); }
.act.starter, .act.bench { background: var(--green); border-color: var(--green); color: #fff; }
.act.locked { border-color: var(--line); color: #B0B5BD; }
.act.swap { border-color: var(--gold); color: var(--gold-d); background: var(--gold-50); }
</style>
