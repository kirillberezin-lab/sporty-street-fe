<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import { liveRounds, rounds } from '../stores/rounds.js'
import { claimable } from '../stores/missions.js'

const route = useRoute()
const tabs = [
  { to: '/', label: 'Home', icon: 'home', match: (p) => p === '/' },
  { to: '/play', label: 'Play', icon: 'ball', match: (p) => p.startsWith('/play') },
  { to: '/leagues', label: 'Leagues', icon: 'trophy', match: (p) => p.startsWith('/leagues') || p.startsWith('/back') },
  { to: '/rewards', label: 'Rewards', icon: 'gift', match: (p) => p.startsWith('/rewards') },
  { to: '/profile', label: 'Profile', icon: 'user', match: (p) => p.startsWith('/profile') },
]
const dots = computed(() => ({
  '/play': liveRounds().some((r) => rounds.teams[r.id]),
  '/rewards': claimable().length > 0,
}))
</script>

<template>
  <nav class="tabs" aria-label="Main">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ on: t.match(route.path) }" replace>
      <Icon :name="t.icon" />
      {{ t.label }}
      <span v-if="dots[t.to]" class="tab-dot" />
    </RouterLink>
  </nav>
</template>
