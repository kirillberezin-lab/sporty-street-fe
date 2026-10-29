<script setup>
import { computed, ref } from 'vue'
import { clubColor, hashColor, initials } from '../lib/players.js'

const props = defineProps({
  player: { type: Object, default: null },
  name: { type: String, default: '' },
  color: { type: String, default: '' },
  size: { type: String, default: '' }, // xs | sm | md | lg | xl
  ring: { type: Boolean, default: false },
  captain: { type: Boolean, default: false },
  hero: { type: Boolean, default: false },
})

const failed = ref(false)
const label = computed(() => props.player?.name ?? props.name)
const bg = computed(() => props.color || (props.player ? clubColor(props.player.clubName) : hashColor(label.value)))
const img = computed(() => (!failed.value && props.player?.imageUrl) || null)
</script>

<template>
  <div class="av" :class="[size, { ring }]" :style="{ background: bg }">
    <img v-if="img" :src="img" :alt="label" loading="lazy" @error="failed = true" />
    <template v-else>{{ initials(label) }}</template>
    <span v-if="captain" class="badge c">C</span>
    <span v-if="hero" class="badge hh" :style="captain ? { top: 'auto', bottom: '-7px' } : null">★</span>
  </div>
</template>
