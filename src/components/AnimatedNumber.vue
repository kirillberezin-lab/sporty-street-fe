<script setup>
// Counts up/down to the new value — used for live scores and the full-time total.
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({ value: { type: Number, default: 0 }, duration: { type: Number, default: 700 }, from: { type: Number, default: null } })
const shown = ref(props.from ?? props.value)
let raf = null
let settle = null

function animate(to) {
  cancelAnimationFrame(raf)
  clearTimeout(settle)
  const start = shown.value
  const t0 = performance.now()
  const step = (t) => {
    const k = Math.min(1, (t - t0) / props.duration)
    const eased = 1 - Math.pow(1 - k, 3)
    shown.value = Math.round(start + (to - start) * eased)
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  // Browsers pause animation frames for background/hidden pages; never leave a stale score behind.
  settle = setTimeout(() => (shown.value = to), props.duration + 150)
}

watch(() => props.value, (v) => animate(v ?? 0))
if (props.from != null) animate(props.value)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(settle)
})
</script>

<template><span class="num">{{ shown }}</span></template>
