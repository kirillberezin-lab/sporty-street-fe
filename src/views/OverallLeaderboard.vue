<script setup>
// Overall leaderboard (GET /leaderboard): lifetime points from settled rounds. The same points unlock
// SportyBet Rewards; they are never spent.
import { onMounted, ref } from 'vue'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { num } from '../lib/format.js'
import { session } from '../stores/session.js'

const rows = ref(null)
const error = ref(null)
onMounted(async () => {
  try {
    rows.value = (await api.overallLeaderboard()).items ?? []
  } catch (e) {
    error.value = e
  }
})
</script>

<template>
  <div class="screen white">
    <TopBar title="Overall leaderboard" back="/profile" />
    <main class="ct" style="padding-top: 4px">
      <div class="note"><Icon name="trophy" :size="16" /><span>Lifetime points from every settled round. They unlock SportyBet Rewards and are never spent.</span></div>
      <div v-if="error" class="empty"><b style="color: var(--ink)">{{ error.status === 404 ? 'Arrives with the next backend update' : 'Leaderboard unavailable' }}</b><span v-if="error.status !== 404" class="sm">{{ error.message }}</span></div>
      <div v-else-if="!rows" class="col g8"><div v-for="i in 6" :key="i" class="skel" style="height: 52px" /></div>
      <div v-else class="tbl stagger">
        <div v-for="r in rows" :key="r.userId" class="tr" :class="{ me: r.username === session.username }">
          <span class="rk">{{ r.rank }}</span>
          <Avatar :name="r.displayName" :src="r.avatarUrl" size="sm" />
          <div class="col g2 f1" style="min-width: 0"><b class="ellipsis">{{ r.username === session.username ? `${r.displayName} (you)` : r.displayName }}</b><span class="xs m">{{ r.roundsPlayed }} rounds</span></div>
          <b class="num">{{ num(r.points) }}</b>
        </div>
      </div>
    </main>
  </div>
</template>
