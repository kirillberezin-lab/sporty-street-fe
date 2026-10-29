<script setup>
// Photo credits for every player portrait served by the backend (/media/players/credits.json).
import { computed, onMounted } from 'vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { credits, loadCredits } from '../stores/credits.js'

onMounted(loadCredits)
const list = computed(() => [...credits.list].sort((a, b) => a.player.localeCompare(b.player)))
</script>

<template>
  <div class="screen white">
    <TopBar back="/settings" title="Photo credits" />
    <main class="ct">
      <div class="note">
        <Icon name="image" :size="16" />
        <span>Player photos come from Wikimedia Commons under the licences below (320 px thumbnails, no other edits). Club affiliations are a 2024/25 snapshot; fixtures and results are simulated.</span>
      </div>
      <div v-if="!credits.loaded && !credits.error" class="col g8"><div v-for="i in 6" :key="i" class="skel" style="height: 56px" /></div>
      <div v-else-if="credits.error" class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">Credits unavailable</b><span class="sm">{{ credits.error.message }}</span></div>
      <div v-else class="card flat">
        <div v-for="c in list" :key="c.imageUrl" class="li">
          <Avatar :player="{ name: c.player, imageUrl: c.imageUrl, clubName: '' }" size="sm" />
          <div class="col g2 f1" style="min-width: 0">
            <b class="sm">{{ c.player }}</b>
            <span class="xs m">
              <a :href="c.sourcePage" target="_blank" rel="noopener noreferrer" class="lnk">{{ c.author || 'Unknown author' }}</a>
              ·
              <a v-if="c.licenseUrl" :href="c.licenseUrl" target="_blank" rel="noopener noreferrer" class="lnk">{{ c.license }}</a>
              <template v-else>{{ c.license }}</template>
            </span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.lnk { text-decoration: underline; text-underline-offset: 2px; }
</style>
