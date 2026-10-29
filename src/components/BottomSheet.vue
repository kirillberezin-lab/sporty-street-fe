<script setup>
// Bottom sheet (design 3.3, 3.5, 4.3, 7.2). Teleported into the app column; drag the grab bar down to close.
import { ref, watch } from 'vue'

const props = defineProps({ open: { type: Boolean, default: false }, dark: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const dragY = ref(0)
let startY = null

function onStart(e) {
  startY = e.touches?.[0]?.clientY ?? e.clientY
}
function onMove(e) {
  if (startY == null) return
  dragY.value = Math.max(0, (e.touches?.[0]?.clientY ?? e.clientY) - startY)
}
function onEnd() {
  if (dragY.value > 90) emit('close')
  dragY.value = 0
  startY = null
}

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
watch(
  () => props.open,
  (v) => (v ? window.addEventListener('keydown', onKey) : window.removeEventListener('keydown', onKey)),
)
</script>

<template>
  <Teleport defer to="#sheets">
    <Transition name="sheet">
      <div v-if="open" class="sheet-wrap" role="dialog" aria-modal="true">
        <div class="sheet-backdrop" @click="emit('close')" />
        <div class="sheet" :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : null">
          <div class="grab-zone" @touchstart.passive="onStart" @touchmove.passive="onMove" @touchend="onEnd">
            <div class="grab" />
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.grab-zone { margin: -10px -20px 0; padding: 10px 20px 2px; display: flex; justify-content: center; cursor: grab; }
</style>
