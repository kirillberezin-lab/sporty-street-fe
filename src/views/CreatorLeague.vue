<script setup>
// Creator league (design 6.4): league, creator and table from the community API (by slug); the take
// and the five to copy are local extras (stores/demo.js CREATORS). Joining is a local preview.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { compact, num } from '../lib/format.js'
import { leagueBanter, leagueBySlug, leagueDetail } from '../stores/community.js'
import { shortName } from '../lib/players.js'
import { CREATORS, demo, joinCreator } from '../stores/demo.js'
import { addStarter, setBench, useDraft } from '../stores/draft.js'
import { featuredPlayer, loadFeatured } from '../stores/featured.js'
import { nextOpenRound } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.id)
const extra = CREATORS.find((c) => c.id === slug)
const league = ref(null)
const members = ref([])
const takes = ref([])
const missing = ref(false)
const creator = computed(() => (league.value || extra ? {
  name: league.value?.creator?.displayName ?? extra?.name ?? '',
  avatarUrl: league.value?.avatarUrl ?? null,
  fans: league.value?.creator?.fans ?? extra?.fans ?? 0,
  bio: extra?.bio ?? league.value?.description ?? '',
  take: extra?.take ?? null,
  five: extra?.five ?? [],
} : null))
const joined = computed(() => league.value?.joined || demo.joinedCreators?.includes(league.value?.id))
const copying = ref(false)
onMounted(async () => {
  loadFeatured()
  try {
    league.value = await leagueBySlug(slug)
    if (!league.value) return (missing.value = !extra)
    const [d, b] = await Promise.all([leagueDetail(league.value.id), leagueBanter(league.value.id)])
    members.value = d.members
    takes.value = b.messages.items.slice(0, 3)
  } catch {
    missing.value = !extra
  }
})
function join() {
  joinCreator(league.value.id)
  toast({ title: `Joined ${league.value.name}`, tone: 'success' })
}

async function copyFive() {
  const round = nextOpenRound()
  if (!round) return toast({ title: 'No open round', body: 'Copying opens with the next round.', tone: 'error' })
  copying.value = true
  try {
    const draft = useDraft(round.id)
    draft.starters = []
    draft.bench = null
    const missing = []
    for (const name of creator.value.five) {
      const page = await api.players(round.id, { name: shortName(name), size: 5 })
      const p = page.items?.find((x) => x.name === name && x.eligible !== false)
      if (p && !draft.starters.some((s) => s.countryId === p.countryId)) addStarter(draft, p)
      else missing.push(shortName(name))
    }
    if (!draft.bench) {
      const page = await api.players(round.id, { size: 40 })
      const b = page.items?.find((x) => x.eligible !== false && !draft.starters.some((s) => s.id === x.id))
      if (b) setBench(draft, b)
    }
    toast({ title: `Copied ${draft.starters.length} of 5`, body: missing.length ? `${missing.join(', ')} not available in ${round.name} — pick replacements.` : 'Edit anything before you lock in.' })
    router.push(`/rounds/${round.id}/build`)
  } catch (e) {
    toastError(e, 'Could not copy the five')
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <div v-if="creator" class="screen">
    <header class="head creator-head">
      <TopBar back="/leagues" tone="clear">
        <template #right><span class="pill w">CREATOR LEAGUE</span></template>
      </TopBar>
      <div class="row g12" style="padding: 0 16px 16px; color: #fff">
        <Avatar :name="creator.name" :src="creator.avatarUrl" color="#1A1D23" size="xl" ring />
        <div class="col g4">
          <span class="disp" style="font-size: 32px">{{ creator.name }}</span>
          <span class="xs" style="opacity: .9">{{ creator.bio }}</span>
          <span class="pill" style="background: #fff; color: var(--ink); align-self: flex-start">{{ compact(creator.fans) }} fans</span>
        </div>
      </div>
    </header>
    <main class="ct">
      <div class="card soft row items-start">
        <div class="ibox" style="background: var(--red); color: #fff"><span class="disp" style="font-size: 16px">VS</span></div>
        <div class="col g2 f1"><b class="sm">Beat {{ creator.name.split(' ').at(-1) }}</b><span class="xs m">Finish above {{ creator.name }} this round for bragging rights. 38% of fans did last week.</span></div>
      </div>
      <div v-if="creator.five.length" class="card col g12">
        <div class="row between"><b class="sm">Their five</b><span class="pill o">Revealed at lock</span></div>
        <div class="row g6">
          <div v-for="n in creator.five" :key="n" class="col g4 f1 items-center">
            <Avatar :player="featuredPlayer(n)" size="md" />
            <span class="xs b ellipsis" style="max-width: 100%">{{ shortName(n) }}</span>
          </div>
        </div>
      </div>
      <div v-if="creator.take" class="card col g6">
        <div class="row g6"><Avatar :name="creator.name" :src="creator.avatarUrl" color="#1A1D23" size="xs" /><b class="sm">{{ creator.name }}'s take</b></div>
        <span class="sm" style="line-height: 1.45">“{{ creator.take }}”</span>
      </div>
      <div v-for="m in takes" :key="m.id" class="card col g6">
        <div class="row g6"><Avatar :name="m.author.displayName" :src="m.author.avatarUrl" size="xs" /><b class="sm">{{ m.author.displayName }}</b></div>
        <span class="sm">“{{ m.text }}”</span>
        <div class="row g6"><span v-for="(n, e) in m.reactions" :key="e" class="chip sm">{{ e }} {{ compact(n) }}</span></div>
      </div>
      <template v-if="members.length">
        <span class="xs b m up">League table</span>
        <div class="tbl">
          <div v-for="m in members" :key="m.profile.id" class="tr" :class="{ me: m.profile.isYou }">
            <span class="rk">{{ m.rank }}</span>
            <Avatar :name="m.profile.displayName" :src="m.profile.avatarUrl" size="sm" />
            <b class="f1 ellipsis">{{ m.profile.isYou ? `${m.profile.displayName} (you)` : m.profile.displayName }}</b>
            <b class="num">{{ num(m.score) }}</b>
          </div>
          <div v-if="joined && !members.some((m) => m.profile.isYou)" class="tr me"><span class="rk">{{ members.length + 1 }}</span><Avatar :name="session.user?.displayName" :src="session.user?.avatarUrl" size="sm" /><b class="f1">{{ session.user?.displayName }} (you)</b><b class="num">0</b></div>
        </div>
      </template>
      <button v-if="league && !joined" class="btn sec md" @click="join">Join {{ league.name }}</button>
    </main>
    <footer class="foot" style="background: var(--bg)">
      <button v-if="creator.five.length" class="btn" :disabled="copying" @click="copyFive"><span v-if="copying" class="spin" />Copy their five &amp; edit</button>
    </footer>
  </div>
  <div v-else class="screen">
    <TopBar back="/leagues" title="Creator league" />
    <main v-if="!missing" class="ct"><div class="skel" style="height: 200px" /></main>
    <main v-else class="ct">
      <div class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">League not found</b><RouterLink to="/leagues" class="btn sm">All leagues</RouterLink></div>
    </main>
  </div>
</template>

<style scoped>
.creator-head { background: linear-gradient(160deg, #F59E0B, #DC2626 70%); color: #fff; }
.creator-head :deep(.head) { padding-top: 0; }
</style>
