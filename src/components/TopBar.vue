<script setup>
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { backOr } from '../lib/nav.js'

const props = defineProps({
  title: { type: String, default: '' },
  back: { type: [Boolean, String], default: false }, // true = history back, string = fallback route
  close: { type: [Boolean, String], default: false },
  tone: { type: String, default: 'white' }, // white | red | dark | clear
})
const router = useRouter()

function goBack() {
  const fallback = typeof props.back === 'string' ? props.back : typeof props.close === 'string' ? props.close : '/'
  backOr(router, fallback)
}
</script>

<template>
  <header class="head" :class="{ 'on-red': tone === 'red', 'on-dark': tone === 'dark', white: tone === 'white' }" :style="tone === 'white' ? 'background:#fff' : tone === 'clear' ? 'background:transparent' : ''">
    <div class="top">
      <div class="side">
        <button v-if="back || close" class="icon-btn" :aria-label="close ? 'Close' : 'Back'" @click="goBack">
          <Icon :name="close ? 'close' : 'back'" :stroke="2.2" />
        </button>
        <slot name="left" />
      </div>
      <slot name="title"><span class="navt">{{ title }}</span></slot>
      <div class="side r"><slot name="right" /></div>
    </div>
    <slot />
  </header>
</template>
