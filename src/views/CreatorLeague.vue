<script setup>
// Creator league (design 6.4): "beat the creator", his five, takes with reactions, copy his five.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { compact } from '../lib/format.js'
import { shortName } from '../lib/players.js'
import { CREATORS, demo, joinCreator } from '../stores/demo.js'
import { addStarter, setBench, useDraft } from '../stores/draft.js'
import { featuredPlayer, loadFeatured } from '../stores/featured.js'
import { nextOpenRound } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const creator = computed(() => CREATORS.find((c) => c.id === route.params.id))
const joined = computed(() => demo.leagues?.some((l) => l.creatorId === route.params.id))
const reactions = ref({ '🔥': 4100, '😂': 812, '🤝': 1300 })
const copying = ref(false)
onMounted(loadFeatured)

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
        <Avatar :name="creator.name" color="#1A1D23" size="xl" ring />
        <div class="col g4">
          <span class="disp" style="font-size: 32px">{{ creator.name }}</span>
          <span class="xs" style="opacity: .9">{{ creator.bio }}</span>
          <span class="pill" style="background: #fff; color: var(--ink); align-self: flex-start">{{ compact(creator.fans) }} in league</span>
        </div>
      </div>
    </header>
    <main class="ct">
      <div class="card soft row items-start">
        <div class="ibox" style="background: var(--red); color: #fff"><span class="disp" style="font-size: 16px">VS</span></div>
        <div class="col g2 f1"><b class="sm">Beat {{ creator.name.split(' ').at(-1) }}</b><span class="xs m">Finish above {{ creator.name }} this round for bragging rights. 38% of fans did last week.</span></div>
      </div>
      <div class="card col g12">
        <div class="row between"><b class="sm">His five</b><span class="pill o">Revealed at lock</span></div>
        <div class="row g6">
          <div v-for="n in creator.five" :key="n" class="col g4 f1 items-center">
            <Avatar :player="featuredPlayer(n)" size="md" />
            <span class="xs b ellipsis" style="max-width: 100%">{{ shortName(n) }}</span>
          </div>
        </div>
      </div>
      <div class="card col g6">
        <div class="row g6"><Avatar :name="creator.name" color="#1A1D23" size="xs" /><b class="sm">{{ creator.name.split(' ').at(-1) }}'s take</b><span class="xs m">2h</span></div>
        <span class="sm" style="line-height: 1.45">“{{ creator.take }}”</span>
        <div class="row g6"><button v-for="(n, e) in reactions" :key="e" class="chip sm" @click="reactions[e] += 1">{{ e }} {{ compact(n) }}</button></div>
      </div>
      <div class="tbl">
        <div class="tr"><span class="rk">1</span><Avatar name="okonkwo fc" size="sm" /><b class="f1">okonkwo_fc</b><b>171</b></div>
        <div class="tr me"><span class="rk xs" style="width: auto">{{ joined ? '14.8k' : '—' }}</span><Avatar :name="session.user?.displayName" color="#5B3A29" size="sm" /><b class="f1">{{ session.user?.displayName }}'s Five</b><b>{{ joined ? 142 : '—' }}</b></div>
      </div>
      <button v-if="!joined" class="btn sec md" @click="joinCreator(creator.id); toast({ title: `Joined ${creator.name} League`, tone: 'success' })">Join {{ creator.name }} League</button>
    </main>
    <footer class="foot" style="background: var(--bg)">
      <button class="btn" :disabled="copying" @click="copyFive"><span v-if="copying" class="spin" />Copy his five &amp; edit</button>
    </footer>
  </div>
  <div v-else class="screen">
    <TopBar back="/leagues" title="Creator league" />
    <main class="ct">
      <div class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">League not found</b><RouterLink to="/leagues" class="btn sm">All leagues</RouterLink></div>
    </main>
  </div>
</template>

<style scoped>
.creator-head { background: linear-gradient(160deg, #F59E0B, #DC2626 70%); color: #fff; }
.creator-head :deep(.head) { padding-top: 0; }
</style>
