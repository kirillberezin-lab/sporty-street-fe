<script setup>
// The green pitch from designs 3.1/3.4 (+ live points in 4.2). Free formation: the backend accepts
// any five, so seats are filled top-down by position (forwards up front, keeper at the back).
import { computed } from 'vue'
import Avatar from './Avatar.vue'
import Flag from './Flag.vue'
import Icon from './Icon.vue'
import { byPosition, clubShort, positionCode, shortName } from '../lib/players.js'

const props = defineProps({
  players: { type: Array, default: () => [] }, // PlayerResponse[] or { player, points }[]
  slots: { type: Number, default: 5 },
  captainId: { type: String, default: null },
  heroId: { type: String, default: null },
  showPoints: { type: Boolean, default: false },
  hints: { type: Array, default: () => ['FW', 'MF', 'MF', 'DF', 'GK'] },
  flashIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['select', 'empty'])

const SHAPE = [1, 2, 1, 1]

const rows = computed(() => {
  const items = props.players.map((p) => (p.player ? { player: p.player, points: p.points } : { player: p, points: null }))
  items.sort((a, b) => byPosition(a.player, b.player))
  const seats = Array.from({ length: props.slots }, (_, i) => items[i] ?? { empty: true, hint: props.hints[i] ?? '' })
  const out = []
  let i = 0
  for (const n of SHAPE) {
    out.push(seats.slice(i, i + n))
    i += n
  }
  if (i < seats.length) out.push(seats.slice(i))
  return out
})

function ptsClass(points) {
  if (points == null) return ''
  if (points < 0) return 'neg'
  return points >= 5 ? 'hot' : ''
}
</script>

<template>
  <div class="pitch">
    <div class="pl half" /><div class="pl circ" /><div class="pl boxt" /><div class="pl boxb" />
    <div v-for="(row, ri) in rows" :key="ri" class="prow">
      <template v-for="(seat, si) in row" :key="seat.player?.id ?? `e${ri}${si}`">
        <button v-if="seat.empty" class="slot" type="button" @click="emit('empty', seat.hint)">
          <span class="plus"><Icon name="plus" :size="18" :stroke="3" /></span>
          {{ seat.hint || 'Add' }}
        </button>
        <button
          v-else
          type="button"
          class="pc pop-in"
          :class="{ hero: seat.player.id === heroId, 'flash-g': flashIds.includes(seat.player.id) }"
          @click="emit('select', seat.player)"
        >
          <Flag class="fl" :country="seat.player.countryName" :size="13" />
          <Avatar :player="seat.player" size="md" />
          <span class="nm">{{ shortName(seat.player.name) }}</span>
          <span v-if="showPoints && seat.points != null" class="pts" :class="ptsClass(seat.points)">{{ seat.points }} pts</span>
          <span v-else class="mt">{{ positionCode(seat.player.position) }} · {{ clubShort(seat.player.clubName ?? '') }}</span>
          <span v-if="seat.player.id === captainId" class="badge c">C</span>
        </button>
      </template>
    </div>
  </div>
</template>
