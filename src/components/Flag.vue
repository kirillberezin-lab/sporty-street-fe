<script setup>
import { computed } from 'vue'
import { flagEmoji } from '../lib/countries.js'

const props = defineProps({ country: { type: String, default: '' }, size: { type: Number, default: 15 } })
const emoji = computed(() => flagEmoji(props.country))
</script>

<template>
  <span class="flag" :style="{ fontSize: `${size}px` }" :title="country" role="img" :aria-label="country">{{ emoji }}</span>
</template>
