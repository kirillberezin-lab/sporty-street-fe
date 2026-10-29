<script setup>
// On-screen version of the shareable squad card (design 3.6); lib/cards.js draws the PNG twin.
import Avatar from './Avatar.vue'
import Flag from './Flag.vue'

defineProps({
  roundName: { type: String, default: '' },
  title: { type: String, default: '' },
  players: { type: Array, default: () => [] }, // { player, captain, hero, bench }
  footer: { type: String, default: 'Think you can beat it?' },
  link: { type: String, default: '' },
  score: { type: String, default: '' },
})
</script>

<template>
  <div class="share-card">
    <div class="row between">
      <span class="logo" style="font-size: 20px">SportyStreet</span>
      <span class="pill w ellipsis" style="max-width: 150px">{{ roundName.toUpperCase() }}</span>
    </div>
    <span class="disp" style="font-size: 30px">{{ title }}</span>
    <span v-if="score" class="sm b" style="opacity: .85; margin-top: -6px">{{ score }}</span>
    <div class="col g6">
      <div v-for="p in players" :key="p.player.id" class="row g6" :style="p.bench ? 'opacity:.75' : ''">
        <Avatar :player="p.player" size="xs" />
        <span class="sm b f1 ellipsis">{{ p.player.name }}</span>
        <span class="xs b" :style="p.hero ? 'color: var(--gold)' : ''">{{ p.captain ? 'C ' : '' }}{{ p.hero ? '★' : '' }}{{ p.bench ? 'BENCH' : '' }}</span>
        <Flag :country="p.player.countryName" :size="13" />
      </div>
    </div>
    <div class="row between" style="background: rgba(0, 0, 0, .25); border-radius: 12px; padding: 8px 10px; gap: 8px">
      <span class="xs b">{{ footer }}</span>
      <span v-if="link" class="xs b ellipsis" style="opacity: .85; max-width: 46%">{{ link }}</span>
    </div>
  </div>
</template>

<style scoped>
.share-card {
  width: 100%; max-width: 320px; border-radius: 22px; overflow: hidden; color: #fff; padding: 18px; display: flex; flex-direction: column; gap: 12px;
  background: linear-gradient(160deg, #E41827, #7A0710); box-shadow: 0 20px 40px rgba(0, 0, 0, .4); position: relative;
}
.share-card::after {
  content: ''; position: absolute; width: 220px; height: 220px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, .08); right: -70px; top: 40px; pointer-events: none;
}
</style>
