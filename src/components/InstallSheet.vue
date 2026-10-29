<script setup>
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { promptInstall, pwa } from '../lib/pwa.js'
import { toast } from '../stores/ui.js'
import { asset } from '../lib/url.js'

defineProps({ open: Boolean })
const emit = defineEmits(['close'])

async function install() {
  const outcome = await promptInstall()
  if (outcome === 'accepted') toast({ title: 'SportyStreet installed', body: 'Find it on your home screen.', tone: 'success' })
  emit('close')
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <div class="row g12">
      <img :src="asset('pwa-192x192.png')" alt="" width="64" height="64" style="border-radius: 16px; box-shadow: 0 8px 20px rgba(228, 24, 39, .35)" />
      <div class="col g2 f1">
        <span class="h2">Install SportyStreet</span>
        <span class="sm m">Full screen, home-screen icon, works offline, lock-screen alerts.</span>
      </div>
    </div>
    <template v-if="pwa.canInstall">
      <button class="btn" @click="install"><Icon name="download" :size="20" />Install app</button>
    </template>
    <template v-else-if="pwa.isIOS">
      <div class="card col g12">
        <div class="row g12"><span class="step">1</span><span class="sm">Tap <b>Share</b> in Safari's toolbar <Icon name="external" :size="14" style="display: inline" /></span></div>
        <div class="row g12"><span class="step">2</span><span class="sm">Choose <b>Add to Home Screen</b></span></div>
        <div class="row g12"><span class="step">3</span><span class="sm">Open SportyStreet from the icon and turn on alerts</span></div>
      </div>
      <button class="btn" @click="emit('close')">Got it</button>
    </template>
    <template v-else>
      <div class="note"><Icon name="info" :size="16" /><span>Use your browser menu → <b>Install app</b> / <b>Add to Home screen</b>. Installation needs HTTPS (or localhost).</span></div>
      <button class="btn" @click="emit('close')">Got it</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.step { width: 28px; height: 28px; border-radius: 50%; background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; font: 900 italic 18px 'Barlow Condensed', sans-serif; flex: none; }
</style>
