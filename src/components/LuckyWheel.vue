<script setup>
// Lucky Wheel: the prize is drawn first (stores/perks.js), then the wheel eases onto it.
import { ref } from 'vue'
import { WHEEL } from '../lib/perks.js'

const props = defineProps({ disabled: Boolean })
const emit = defineEmits(['spin', 'done'])

const N = WHEEL.length
const SLICE = 360 / N
const R = 150
const rotation = ref(0)
const spinning = ref(false)

const point = (deg, r = R) => {
  const a = ((deg - 90) * Math.PI) / 180
  return `${(R + r * Math.cos(a)).toFixed(2)} ${(R + r * Math.sin(a)).toFixed(2)}`
}
const slicePath = (i) => `M${R} ${R} L${point(i * SLICE)} A${R} ${R} 0 0 1 ${point((i + 1) * SLICE)} Z`

/** Called by the parent with the drawn segment index. */
function spinTo(index) {
  spinning.value = true
  const jitter = (Math.random() - 0.5) * SLICE * 0.6
  const target = 360 - (index * SLICE + SLICE / 2) + jitter
  const current = rotation.value % 360
  rotation.value += 360 * 6 + ((target - current + 360) % 360)
}
function onEnd() {
  if (!spinning.value) return
  spinning.value = false
  emit('done')
}
defineExpose({ spinTo })
</script>

<template>
  <div class="wheel-wrap">
    <div class="pointer" />
    <svg viewBox="0 0 300 300" class="wheel" :style="{ transform: `rotate(${rotation}deg)` }" @transitionend="onEnd">
      <g v-for="(w, i) in WHEEL" :key="w.id">
        <path :d="slicePath(i)" :fill="w.color" stroke="#fff" stroke-width="2" />
        <g :transform="`rotate(${i * SLICE + SLICE / 2} ${R} ${R})`">
          <text :x="R" y="52" text-anchor="middle" :fill="w.ink ?? '#fff'" class="lbl">{{ w.label }}</text>
          <text :x="R" y="70" text-anchor="middle" :fill="w.ink ?? '#fff'" class="sub">{{ w.sub }}</text>
        </g>
      </g>
      <circle :cx="R" :cy="R" r="12" fill="#fff" />
    </svg>
    <button class="hub" :disabled="props.disabled || spinning" @click="emit('spin')">{{ spinning ? '…' : 'SPIN' }}</button>
  </div>
</template>

<style scoped>
.wheel-wrap { position: relative; width: min(300px, 82vw); aspect-ratio: 1; margin: 8px auto 0; }
.wheel { width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 0 0 8px var(--dark), 0 0 0 10px var(--gold), 0 18px 40px rgba(0, 0, 0, .35); transition: transform 4.2s cubic-bezier(.12, .7, .1, 1); }
.lbl { font: 900 italic 22px 'Barlow Condensed', sans-serif; }
.sub { font: 700 9px Inter, sans-serif; text-transform: uppercase; letter-spacing: .04em; opacity: .9; }
.pointer { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); z-index: 2; width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 26px solid var(--gold); filter: drop-shadow(0 3px 3px rgba(0, 0, 0, .3)); }
.hub { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: 74px; height: 74px; border-radius: 50%; background: var(--red); color: #fff; border: 4px solid #fff; font: 900 italic 20px 'Barlow Condensed', sans-serif; box-shadow: 0 6px 16px rgba(0, 0, 0, .3); }
.hub:disabled { background: #6B7079; }
</style>
