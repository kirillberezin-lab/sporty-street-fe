<script setup>
// Player profile sheet (design 3.3): stats, next fixture, last 5, captain + Home Hero.
import { computed, watch } from 'vue'
import Avatar from './Avatar.vue'
import BottomSheet from './BottomSheet.vue'
import Flag from './Flag.vue'
import Icon from './Icon.vue'
import { positionCode, POSITION_NAMES, shortName } from '../lib/players.js'
import { dayTime, humanize } from '../lib/format.js'
import { homeHeroCopy } from '../lib/rules.js'
import { creditFor, loadCredits } from '../stores/credits.js'

const props = defineProps({
  open: Boolean,
  player: { type: Object, default: null },
  round: { type: Object, default: null },
  homeCountryId: { type: String, default: null },
  inSquad: { type: String, default: null }, // 'starter' | 'bench' | null
  isCaptain: Boolean,
  conflict: { type: Object, default: null }, // starter from the same country
  target: { type: String, default: 'starter' },
  full: Boolean,
})
const emit = defineEmits(['close', 'add', 'remove', 'captain', 'bench'])

const KNOWN = { form: 'Form', avgPoints: 'Avg pts', goals: 'Goals', assists: 'Assists', points: 'Points', appearances: 'Apps', price: 'Price' }
const stats = computed(() => {
  const s = props.player?.displayStats ?? {}
  return Object.entries(s)
    .filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && v.length < 10))
    .sort(([a], [b]) => (Object.keys(KNOWN).indexOf(a) + 1 || 99) - (Object.keys(KNOWN).indexOf(b) + 1 || 99))
    .slice(0, 4)
    .map(([k, v]) => ({ key: k, label: KNOWN[k] ?? humanize(k), value: v }))
})
const last5 = computed(() => {
  const v = props.player?.displayStats?.last5 ?? props.player?.displayStats?.lastFive
  return Array.isArray(v) ? v.slice(-5) : null
})
const maxLast = computed(() => Math.max(1, ...(last5.value ?? [1])))
const fixture = computed(() => props.round?.fixtures?.find((f) => f.id === props.player?.fixtureId) ?? null)
const isHome = computed(() => Boolean(props.player && (props.player.isHomeCountry || (props.homeCountryId && props.player.countryId === props.homeCountryId))))
const hh = computed(() => homeHeroCopy(props.round?.rules))
const pos = computed(() => positionCode(props.player?.position))
const credit = computed(() => creditFor(props.player?.imageUrl))
watch(() => props.open && props.player?.imageUrl, (v) => v && loadCredits())
</script>

<template>
  <BottomSheet :open="open && !!player" @close="emit('close')">
    <template v-if="player">
      <div class="row g12">
        <Avatar :player="player" size="xl" :hero="isHome" />
        <div class="col g4 f1">
          <span class="h2">{{ player.name }}</span>
          <span class="row g6 sm m"><Flag :country="player.countryName" /> {{ player.countryName }} · {{ player.clubName }}</span>
          <div class="row g6 wrap">
            <span class="pill o">{{ POSITION_NAMES[pos] ?? pos }}</span>
            <span v-if="isHome" class="pill y">★ Home Hero eligible</span>
            <span v-if="player.eligible === false" class="pill k"><Icon name="lock" :size="12" /> Not in this round</span>
          </div>
        </div>
      </div>

      <a v-if="credit" :href="credit.sourcePage" target="_blank" rel="noopener noreferrer" class="xs m credit">Photo: {{ credit.author }} · {{ credit.license }} · Wikimedia Commons</a>
      <div v-if="stats.length" class="row g6">
        <div v-for="s in stats" :key="s.key" class="stat">
          <b :class="{ grn: s.key === 'form' && s.value >= 80 }">{{ s.value }}</b><span>{{ s.label }}</span>
        </div>
      </div>

      <div v-if="fixture" class="card" style="padding: 12px 14px">
        <div class="row between"><span class="xs b m up">Fixture in this round</span><span class="xs m">{{ dayTime(fixture.kickoffAt) }}</span></div>
        <div class="row g6" style="margin-top: 8px">
          <b class="sm f1">{{ fixture.homeClubName }} v {{ fixture.awayClubName }}</b>
        </div>
      </div>

      <div v-if="last5" class="col g6">
        <span class="xs b m up">Last 5 rounds</span>
        <div class="row items-end" style="gap: 8px; height: 70px">
          <div v-for="(v, i) in last5" :key="i" class="col g2 f1 items-center" style="justify-content: flex-end; height: 100%">
            <span class="xs b">{{ v }}</span>
            <div class="bar" :style="{ height: `${Math.max(6, (v / maxLast) * 46)}px`, background: v >= 8 ? 'var(--green)' : '#D5D8DD' }" />
          </div>
        </div>
      </div>

      <div v-if="isHome" class="note" style="background: var(--gold-50); color: #6B4E00">
        <span class="badge hh inl" style="width: 20px; height: 20px">★</span>
        <span>Start him and he becomes your <b>Home Hero</b> automatically: {{ hh.pts }}, added outside the late-goal and captain multipliers.</span>
      </div>
      <div v-if="conflict && inSquad !== 'starter' && target === 'starter'" class="note">
        <Icon name="info" :size="16" />
        <span>{{ shortName(conflict.name) }} is already your {{ player.countryName }} starter. Starters must come from five different countries — adding {{ shortName(player.name) }} swaps them.</span>
      </div>

      <div v-if="inSquad === 'starter'" class="row g6">
        <button class="btn md ghost f1" :style="isCaptain ? 'border-color:var(--red);background:var(--red-50);color:var(--red)' : ''" @click="emit('captain', player)">
          <span class="badge c inl" style="width: 20px; height: 20px">C</span>{{ isCaptain ? 'Captain ×' + (round?.rules?.captainMultiplier ?? 2) : 'Make captain' }}
        </button>
        <button class="btn md ghost f1" @click="emit('remove', player)">Remove</button>
      </div>

      <button v-if="player.eligible === false" class="btn dis" disabled>Not playing in this round</button>
      <template v-else-if="inSquad === 'bench'">
        <button class="btn ghost" @click="emit('remove', player)">Remove from bench</button>
      </template>
      <template v-else-if="!inSquad">
        <button v-if="target === 'bench'" class="btn" @click="emit('bench', player)">Put on the bench · {{ pos }}</button>
        <template v-else>
          <button class="btn" :disabled="full && !conflict" @click="emit('add', player)">
            {{ conflict ? `Swap ${shortName(conflict.name)} → ${shortName(player.name)}` : full ? 'Your five is full' : `Add to squad · ${pos}` }}
          </button>
          <button class="btn ghost md" @click="emit('bench', player)">Put on the bench instead</button>
        </template>
      </template>
      <button v-else class="btn" @click="emit('close')">Done</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.bar { width: 100%; border-radius: 6px; transition: height .5s var(--ease); }
.credit { margin-top: -6px; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 2px; }
</style>
