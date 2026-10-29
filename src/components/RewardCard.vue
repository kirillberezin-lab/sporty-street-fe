<script setup>
// SportyBet reward creative (public/rewards/, falls back to gradient + emoji) with its catalogue
// state: locked at N leaderboard points, ready to claim, or claimed.
import { computed, ref } from 'vue'
import { num } from '../lib/format.js'
import { perkLook } from '../lib/perks.js'
import Icon from './Icon.vue'

const props = defineProps({ item: { type: Object, required: true }, points: { type: Number, default: 0 } })
const failed = ref(false)
const look = computed(() => perkLook(props.item.gift))
const required = computed(() => props.item.gift.requiredPoints ?? 0)
const pct = computed(() => (required.value ? Math.min(100, Math.round((props.points / required.value) * 100)) : 100))
</script>

<template>
  <div class="pb" :class="{ locked: !item.unlocked, claimed: item.claimed }" :style="{ background: look.bg }">
    <img v-if="look.image && !failed" :src="look.image" :alt="item.gift.name" @error="failed = true" />
    <div v-else class="fallback"><span class="emo">{{ look.emoji }}</span><span class="disp head">{{ item.gift.name }}</span></div>
    <div v-if="!item.unlocked" class="lock">
      <span class="lock-ico"><Icon name="lock" :size="18" :stroke="2.4" /></span>
      <b class="sm">Unlocks at {{ num(required) }} leaderboard pts</b>
      <span class="xs">{{ num(item.pointsNeeded) }} pts to go</span>
      <span class="bar"><i :style="{ width: `${pct}%` }" /></span>
    </div>
    <span v-else-if="item.claimed" class="tag done"><Icon name="check" :size="12" :stroke="3" />Claimed</span>
    <span v-else-if="item.canClaim" class="tag ready">Tap to claim</span>
  </div>
</template>

<style scoped>
.pb { position: relative; aspect-ratio: 942 / 530; border-radius: 16px; overflow: hidden; color: #fff; }
.pb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fallback { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 14px; }
.emo { position: absolute; right: 14px; top: 10px; font-size: 48px; }
.head { font-size: 40px; line-height: .95; }
.locked img { filter: grayscale(.9) brightness(.35) blur(1.5px); }
.claimed img { filter: saturate(.6) brightness(.8); }
.lock { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; padding: 16px; background: rgba(10, 12, 16, .35); }
.lock-ico { width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, .16); display: flex; align-items: center; justify-content: center; margin-bottom: 2px; }
.bar { width: 60%; height: 5px; border-radius: 99px; background: rgba(255, 255, 255, .2); overflow: hidden; margin-top: 4px; }
.bar i { display: block; height: 100%; background: var(--gold); border-radius: 99px; }
.tag { position: absolute; right: 10px; top: 10px; display: inline-flex; align-items: center; gap: 4px; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 99px; box-shadow: 0 4px 12px rgba(0, 0, 0, .35); }
.tag.ready { background: var(--green); animation: pulse 1.8s ease-in-out infinite; }
.tag.done { background: rgba(20, 23, 28, .8); }
@keyframes pulse { 50% { transform: scale(1.08); } }
</style>
