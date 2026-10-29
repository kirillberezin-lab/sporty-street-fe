<script setup>
// Live standings (design 4.4): global top-100 from the stream, friends you challenged, your league.
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import MatchCenter from '../components/MatchCenter.vue'
import TopBar from '../components/TopBar.vue'
import { isLive, isSettled } from '../lib/liveDiff.js'
import { twistCopy } from '../lib/rules.js'
import { demo } from '../stores/demo.js'
import { useLive } from '../stores/live.js'
import { rounds } from '../stores/rounds.js'

const route = useRoute()
const id = route.params.id
const { live } = useLive(id)
const scope = ref('global')

const round = computed(() => live.round ?? rounds.byId[id])
const myTeamId = computed(() => live.team?.id)
const rivals = computed(() => new Set(demo.challenges.filter((c) => c.roundId === id).map((c) => c.teamId)))
const rows = computed(() => {
  const all = live.leaderboard ?? []
  if (scope.value === 'friends') return all.filter((e) => e.teamId === myTeamId.value || rivals.value.has(e.teamId))
  return all
})
const me = computed(() => (live.leaderboard ?? []).find((e) => e.teamId === myTeamId.value))
const leader = computed(() => live.leaderboard?.[0])
const gap = computed(() => (me.value && leader.value ? me.value.score - leader.value.score : null))
// Best team other than mine — ties are common (the simulator gives every player the same events).
const rival = computed(() => (live.leaderboard ?? []).find((e) => e.teamId !== myTeamId.value))
const lead = computed(() => (me.value && rival.value ? me.value.score - rival.value.score : 0))
const twist = computed(() => twistCopy(round.value?.rules))
const minute = computed(() => live.minute)
const pending = computed(() => live.team?.pendingSubstitution)
function move(e) {
  const prev = live.prevRanks?.[e.teamId]
  if (!prev || prev === e.rank) return { text: '–', cls: 'm' }
  return prev > e.rank ? { text: `▲${prev - e.rank}`, cls: 'grn' } : { text: `▼${e.rank - prev}`, cls: 'red' }
}
</script>

<template>
  <div class="screen white">
    <TopBar :back="`/rounds/${id}`" :title="isSettled(round?.status) ? 'Final standings' : isLive(round?.status) ? 'Live standings' : 'Entries so far'">
      <template #right>
        <span v-if="isLive(round?.status)" class="pill r"><span class="dot live" />{{ minute != null ? `${minute}'` : 'LIVE' }}</span>
        <span v-else-if="isSettled(round?.status)" class="pill k">FT</span>
      </template>
    </TopBar>
    <main class="ct" style="padding-top: 4px">
      <div class="seg">
        <button :class="{ on: scope === 'global' }" @click="scope = 'global'">Global</button>
        <button :class="{ on: scope === 'friends' }" @click="scope = 'friends'">Friends{{ rivals.size ? ` · ${rivals.size}` : '' }}</button>
        <RouterLink to="/leagues" custom v-slot="{ navigate }"><button @click="navigate">Leagues →</button></RouterLink>
      </div>

      <div v-if="me" class="card dark row" style="padding: 12px 14px">
        <div class="col g2 f1">
          <span class="xs soft-w">{{ me.rank === 1 ? (lead > 0 ? 'You lead by' : 'Level at the top') : 'Gap to 1st' }}</span>
          <span class="disp" style="font-size: 28px">{{ me.rank === 1 ? (lead > 0 ? `+${lead} pts` : 'Tied 1st') : `${gap} pts` }}</span>
        </div>
        <div class="col g2 items-end">
          <span class="xs soft-w">{{ live.team?.subsUsed ? 'Sub used' : pending ? 'Sub pending' : 'Sub available' }}</span>
          <span class="sm b grn">#{{ me.rank }} of {{ live.leaderboard.length }}</span>
        </div>
      </div>

      <div v-if="!live.leaderboard.length && live.status !== 'open'" class="col g8">
        <div v-for="i in 5" :key="i" class="skel" style="height: 52px" />
      </div>
      <div v-else-if="!rows.length" class="empty">
        <div class="ico"><Icon name="users" /></div>
        <b style="color: var(--ink)">{{ scope === 'friends' ? 'No friends in this round yet' : 'No squads yet' }}</b>
        <span class="sm">{{ scope === 'friends' ? 'Share your challenge link — friends who play show up here.' : 'Be the first to enter.' }}</span>
        <RouterLink v-if="scope === 'friends' && live.team" :to="`/rounds/${id}/locked`" class="btn sm">Challenge a friend</RouterLink>
      </div>
      <TransitionGroup v-else tag="div" name="list" class="tbl">
        <div v-for="e in rows" :key="e.teamId" class="tr" :class="{ me: e.teamId === myTeamId, rival: rivals.has(e.teamId) }">
          <span class="rk">{{ e.rank }}</span>
          <span class="mv" :class="move(e).cls">{{ move(e).text }}</span>
          <Avatar :name="e.displayName" :src="e.avatarUrl" size="sm" />
          <div class="col g2 f1">
            <b class="ellipsis">{{ e.teamId === myTeamId ? `${e.displayName} (you)` : e.displayName }}</b>
            <span v-if="rivals.has(e.teamId)" class="xs gold b">Your rival</span>
          </div>
          <b class="num">{{ e.score }}</b>
        </div>
      </TransitionGroup>

      <MatchCenter v-if="!isSettled(round?.status) || live.matches.some((m) => m.events.length)" :matches="live.matches" :minute="minute" :settled="isSettled(round?.status)" />
      <div v-if="twist?.from != null && isLive(round?.status) && (minute == null || minute < twist.from)" class="card row" style="padding: 10px 12px">
        <span class="pill y">Next twist</span>
        <span class="sm f1"><b>{{ twist.title }}</b> starts at {{ twist.from }}'</span>
        <span v-if="minute != null" class="xs b red">{{ twist.from - minute }}' to go</span>
      </div>
      <span v-if="live.leaderboard.length >= 100" class="xs m tc">Showing the global top 100</span>
    </main>
  </div>
</template>

<style scoped>
.list-move { transition: transform .5s var(--ease); }
</style>
