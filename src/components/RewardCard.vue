<script setup>
// Partner creative from public/rewards/ (falls back to gradient + emoji). Locked offers are dimmed
// with their task and progress; unlocked ones show how many rewards are waiting.
import { ref } from 'vue'
import Icon from './Icon.vue'

defineProps({ offer: { type: Object, required: true }, ready: { type: Number, default: 0 }, locked: Boolean, progress: { type: Object, default: null } })
const failed = ref(false)
</script>

<template>
  <div class="pb" :class="{ locked }" :style="{ background: offer.bg }">
    <img v-if="!failed" :src="offer.image" :alt="offer.title" @error="failed = true" />
    <div v-else class="fallback"><span class="emo">{{ offer.emoji }}</span><span class="disp head">{{ offer.title }}</span></div>
    <div v-if="locked" class="lock">
      <span class="lock-ico"><Icon name="lock" :size="18" :stroke="2.4" /></span>
      <b class="sm">{{ offer.task?.label ?? 'Locked' }}</b>
      <span v-if="progress?.line" class="xs">{{ progress.line }}</span>
      <span v-if="progress?.pct != null" class="bar"><i :style="{ width: `${progress.pct}%` }" /></span>
    </div>
    <span v-else-if="ready" class="ready">{{ ready }} to claim</span>
  </div>
</template>

<style scoped>
.pb { position: relative; aspect-ratio: 942 / 530; border-radius: 16px; overflow: hidden; color: #fff; }
.pb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fallback { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 14px; }
.emo { position: absolute; right: 14px; top: 10px; font-size: 48px; }
.head { font-size: 40px; line-height: .95; }
.locked img { filter: grayscale(.9) brightness(.35) blur(1.5px); }
.lock { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; padding: 16px; background: rgba(10, 12, 16, .35); }
.lock-ico { width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, .16); display: flex; align-items: center; justify-content: center; margin-bottom: 2px; }
.bar { width: 60%; height: 5px; border-radius: 99px; background: rgba(255, 255, 255, .2); overflow: hidden; margin-top: 4px; }
.bar i { display: block; height: 100%; background: var(--gold); border-radius: 99px; }
.ready { position: absolute; right: 10px; top: 10px; background: var(--green); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 99px; box-shadow: 0 4px 12px rgba(0, 0, 0, .35); animation: pulse 1.8s ease-in-out infinite; }
@keyframes pulse { 50% { transform: scale(1.08); } }
</style>
