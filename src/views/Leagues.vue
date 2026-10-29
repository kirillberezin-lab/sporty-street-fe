<script setup>
// Leagues hub (design 6.1). Leagues, members and creators come from the backend's community API
// (read-only, simulated content); joining by code or creating a league is a local preview.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Avatar from '../components/Avatar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import TabBar from '../components/TabBar.vue'
import { compact, ordinal } from '../lib/format.js'
import { community, loadLeagues } from '../stores/community.js'
import { joinCreator, joinLeague } from '../stores/demo.js'
import { session } from '../stores/session.js'
import { toast } from '../stores/ui.js'

const router = useRouter()
const route = useRoute()
// Invite links look like /leagues?join=LAGOS-5K (design 6.3)
const code = ref(typeof route.query.join === 'string' ? route.query.join.toUpperCase() : '')
const joinOpen = ref(Boolean(code.value))

onMounted(loadLeagues)
watch(() => session.epoch, loadLeagues)

const mine = computed(() => community.mine)
const friendsLeagues = computed(() => mine.value.filter((l) => l.type !== 'CREATOR'))
const creatorLeagues = computed(() => mine.value.filter((l) => l.type === 'CREATOR'))
const linkOf = (l) => (l.type === 'CREATOR' && l.slug ? `/leagues/creator/${l.slug}` : `/leagues/${l.id}`)
const typeLabel = { FRIENDS: 'FRIENDS', WORK: 'WORK', CREATOR: 'CREATOR' }

function join() {
  if (!/^[A-Z0-9]{2,}-[A-Z0-9]{2,}$/i.test(code.value.trim())) {
    toast({ title: 'Check the code', body: 'Invite codes look like LAGOS-5K.', tone: 'error' })
    return
  }
  const { league, already } = joinLeague(code.value, mine.value)
  joinOpen.value = false
  code.value = ''
  toast({ title: already ? 'Already a member' : `Joined ${league.name}`, tone: 'success' })
  loadLeagues()
  router.push(linkOf(league))
}
function joinC(l) {
  joinCreator(l.id)
  loadLeagues()
  toast({ title: `Joined ${l.name}`, body: `Beat ${l.creator?.displayName ?? 'the creator'} this round for bragging rights.`, tone: 'success' })
}
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
      <template v-if="!community.loaded && !community.error">
        <div class="skel" style="height: 120px" /><div class="skel" style="height: 72px" />
      </template>
      <div v-else-if="community.error && !mine.length" class="empty"><b style="color: var(--ink)">Leagues unavailable</b><span class="sm">{{ community.error.message }}</span><button class="btn sm" @click="loadLeagues">Try again</button></div>

      <RouterLink v-for="l in friendsLeagues" :key="l.id" :to="linkOf(l)" class="card dark col g12 press league" :style="l.imageUrl ? { '--cover': `url(${l.imageUrl})` } : null">
        <div class="row between">
          <div class="row g6"><span class="pill w">{{ typeLabel[l.type] ?? l.type }}</span><b>{{ l.name }}</b></div>
          <span v-if="l.myRank" class="pill rr">{{ ordinal(l.myRank) }} / {{ l.memberCount }}</span>
        </div>
        <div class="row g6">
          <div class="row" style="gap: 0">
            <Avatar v-for="(m, i) in l.memberPreview.filter((p) => !p.isYou).slice(0, 4)" :key="m.id" :name="m.displayName" :src="m.avatarUrl" size="xs" :style="{ marginLeft: i ? '-6px' : 0, boxShadow: '0 0 0 2px var(--dark)' }" />
          </div>
          <span class="xs f1 soft-w ellipsis">{{ l.format === 'SEASON' ? (l.roundsRemaining ? `${l.roundsRemaining} of ${l.seasonRounds} rounds left` : 'New season') : 'Fresh table every round' }}{{ l.description ? ` · ${l.description}` : '' }}</span>
        </div>
      </RouterLink>

      <RouterLink v-for="l in creatorLeagues" :key="l.id" :to="linkOf(l)" class="card row">
        <Avatar :name="l.creator?.displayName ?? l.name" :src="l.avatarUrl" />
        <div class="col g2 f1"><div class="row g4"><b class="sm">{{ l.name }}</b><span class="pill b" style="height: 18px; font-size: 10px">CREATOR</span></div><span class="xs m">{{ l.memberCount }} members{{ l.creator?.fans ? ` · ${compact(l.creator.fans)} fans` : '' }}</span></div>
        <span v-if="l.myRank" class="sm b">#{{ l.myRank }}</span>
      </RouterLink>

      <RouterLink to="/back" class="card soft row">
        <div class="ibox" style="background: #fff; color: var(--red)"><Icon name="trophy" :size="22" /></div>
        <div class="col g2 f1"><b class="sm">Back a manager</b><span class="xs m">No squad? Back a friend or a creator with free fan points.</span></div>
        <Icon name="chevron" :size="18" class="m" />
      </RouterLink>

      <template v-if="community.discover.length">
        <div class="sec-t" style="margin-top: 4px"><span class="h3">Creator leagues</span><span class="xs m">Discover</span></div>
        <div class="hscroll">
          <div v-for="l in community.discover" :key="l.id" class="card col g6 items-center tc" style="width: 150px">
            <RouterLink :to="linkOf(l)" class="col g6 items-center">
              <Avatar :name="l.creator?.displayName ?? l.name" :src="l.avatarUrl" size="lg" />
              <b class="sm">{{ l.creator?.displayName ?? l.name }}</b>
              <span class="xs m">{{ compact(l.creator?.fans ?? l.memberCount) }} fans</span>
            </RouterLink>
            <button class="btn xs sec" @click="joinC(l)">Join</button>
          </div>
        </div>
      </template>
      <span class="xs m tc">Leagues show simulated preview content{{ community.mode === 'bundled' ? ' (bundled — this server has no community API yet)' : '' }}. Joining and creating leagues stay on this device.</span>
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

<style scoped>
.league { position: relative; overflow: hidden; isolation: isolate; }
.league::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, rgba(20, 23, 28, .96) 35%, rgba(20, 23, 28, .55)), var(--cover, none) center / cover; }
</style>
