<script setup>
// Leagues hub (design 6.1). Leagues are not in the backend yet — local demo data.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Avatar from '../components/Avatar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Flag from '../components/Flag.vue'
import Icon from '../components/Icon.vue'
import TabBar from '../components/TabBar.vue'
import { compact } from '../lib/format.js'
import { CREATORS, demo, joinCreator, joinLeague } from '../stores/demo.js'
import { session } from '../stores/session.js'
import { toast } from '../stores/ui.js'

const router = useRouter()
const route = useRoute()
// Invite links look like /leagues?join=LAGOS-5K (design 6.3)
const code = ref(typeof route.query.join === 'string' ? route.query.join.toUpperCase() : '')
const joinOpen = ref(Boolean(code.value))

const leagues = computed(() => demo.leagues ?? [])
const discover = computed(() => CREATORS.filter((c) => !leagues.value.some((l) => l.creatorId === c.id)))

function standing(l) {
  if (!l.members) return null
  const sorted = [...l.members].sort((a, b) => b.pts - a.pts)
  const i = sorted.findIndex((m) => m.me)
  const lead = sorted[0]
  return { rank: i + 1, size: sorted.length, line: i === 0 ? `You lead by ${lead.pts - (sorted[1]?.pts ?? 0)}` : `${lead.name} leads by ${lead.pts - sorted[i].pts}`, others: sorted.filter((m) => !m.me).slice(0, 4) }
}

function join() {
  if (!/^[A-Z0-9]{2,}-[A-Z0-9]{2,}$/i.test(code.value.trim())) {
    toast({ title: 'Check the code', body: 'Invite codes look like LAGOS-5K.', tone: 'error' })
    return
  }
  const { league, already } = joinLeague(code.value)
  joinOpen.value = false
  code.value = ''
  toast({ title: already ? 'Already a member' : `Joined ${league.name}`, tone: 'success' })
  router.push(`/leagues/${league.id}`)
}
function joinC(c) {
  joinCreator(c.id)
  toast({ title: `Joined ${c.name} League`, body: 'Beat the creator this round for bragging rights.', tone: 'success' })
}
const creatorOf = (l) => CREATORS.find((c) => c.id === l.creatorId)
</script>

<template>
  <div class="screen">
    <header class="head" style="background: #fff">
      <div class="top">
        <span class="h1">Leagues</span>
        <div class="row g6">
          <button class="btn sm sec" @click="joinOpen = true">Join</button>
          <RouterLink to="/leagues/new" class="btn sm">+ Create</RouterLink>
        </div>
      </div>
    </header>
    <main class="ct">
      <span class="xs b m up">My leagues</span>
      <template v-for="l in leagues" :key="l.id">
        <RouterLink v-if="l.type === 'FRIENDS' && l.members" :to="`/leagues/${l.id}`" class="card dark col g12 press">
          <div class="row between">
            <div class="row g6"><span class="pill w">FRIENDS</span><b>{{ l.name }}</b></div>
            <span class="pill rr">{{ standing(l).rank }}{{ ['st', 'nd', 'rd'][standing(l).rank - 1] ?? 'th' }} / {{ standing(l).size }}</span>
          </div>
          <div class="row g6">
            <div class="row" style="gap: 0">
              <Avatar v-for="(m, i) in standing(l).others" :key="m.name" :name="m.name" :color="m.color" size="xs" :style="{ marginLeft: i ? '-6px' : 0, boxShadow: '0 0 0 2px var(--dark)' }" />
            </div>
            <span class="xs f1 soft-w">{{ standing(l).line }}{{ l.rounds ? ` · season ends in ${Math.max(1, l.rounds - 8)} rounds` : ' · new league' }}</span>
          </div>
        </RouterLink>
        <RouterLink v-else-if="l.type === 'CREATOR'" :to="`/leagues/creator/${l.creatorId}`" class="card row">
          <Avatar :name="creatorOf(l)?.name" :color="creatorOf(l)?.bg" />
          <div class="col g2 f1"><div class="row g4"><b class="sm">{{ l.name }}</b><span class="pill b" style="height: 18px; font-size: 10px">CREATOR</span></div><span class="xs m">{{ compact(l.size) }} members</span></div>
          <span class="sm b">#{{ compact(l.myRank) }}</span>
        </RouterLink>
        <div v-else-if="l.type === 'NATIONAL'" class="card row">
          <div class="ibox" style="background: var(--bg); font-size: 26px"><Flag :country="session.countryName ?? ''" :size="26" /></div>
          <div class="col g2 f1"><b class="sm">{{ l.name }}</b><span class="xs m">Auto-joined · {{ compact(l.size) }} players</span></div>
          <span class="sm b">Top {{ l.myTop }}%</span>
        </div>
        <div v-else class="card row">
          <div class="ibox" style="background: var(--blue-50); color: var(--blue)"><Icon name="users" :size="22" /></div>
          <div class="col g2 f1"><b class="sm">{{ l.name }}</b><span class="xs m">{{ l.size }} members · {{ l.format?.toLowerCase() }} league</span></div>
          <span class="sm b">{{ l.myRank }}th</span>
        </div>
      </template>

      <RouterLink to="/back" class="card soft row">
        <div class="ibox" style="background: #fff; color: var(--red)"><Icon name="trophy" :size="22" /></div>
        <div class="col g2 f1"><b class="sm">Back a manager</b><span class="xs m">No squad? Back a friend with free fan points.</span></div>
        <Icon name="chevron" :size="18" class="m" />
      </RouterLink>

      <template v-if="discover.length">
        <div class="sec-t" style="margin-top: 4px"><span class="h3">Creator leagues</span><span class="xs m">Discover</span></div>
        <div class="hscroll">
          <div v-for="c in discover" :key="c.id" class="card col g6 items-center tc" style="width: 150px">
            <RouterLink :to="`/leagues/creator/${c.id}`" class="col g6 items-center">
              <Avatar :name="c.name" :color="c.bg" size="lg" />
              <b class="sm">{{ c.name }}</b>
              <span class="xs m">{{ compact(c.fans) }} fans</span>
            </RouterLink>
            <button class="btn xs sec" @click="joinC(c)">Join</button>
          </div>
        </div>
      </template>
      <span class="xs m tc">Leagues are a demo preview — the league service isn't in the backend yet.</span>
    </main>
    <TabBar />

    <BottomSheet :open="joinOpen" @close="joinOpen = false">
      <span class="h2">Join a league</span>
      <span class="t">Enter the invite code a friend sent you.</span>
      <label class="input"><input v-model="code" placeholder="LAGOS-5K" autocapitalize="characters" autocomplete="off" @keydown.enter="join" /></label>
      <button class="btn" :disabled="!code.trim()" @click="join">Join league</button>
    </BottomSheet>
  </div>
</template>
