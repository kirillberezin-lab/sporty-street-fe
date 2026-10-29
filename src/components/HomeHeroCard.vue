<script setup>
// Home Hero banner — made deliberately prominent on the squad screen (feedback on design 3.4).
import { computed } from 'vue'
import Avatar from './Avatar.vue'
import Flag from './Flag.vue'
import Icon from './Icon.vue'
import { bestCaseExample, homeHeroCopy } from '../lib/rules.js'

const props = defineProps({
  hero: { type: Object, default: null },
  captain: { type: Boolean, default: false },
  countryName: { type: String, default: null },
  hasCountry: { type: Boolean, default: true },
  rules: { type: Object, default: null },
  points: { type: Number, default: null },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['find', 'open'])

const copy = computed(() => homeHeroCopy(props.rules))
const example = computed(() => bestCaseExample(props.rules))
</script>

<template>
  <button v-if="hero" type="button" class="hh-card shimmer-gold rise" :class="{ compact }" @click="emit('open', hero)">
    <div class="hh-av">
      <Avatar :player="hero" :size="compact ? 'md' : 'lg'" />
      <span class="hh-star">★</span>
    </div>
    <div class="col g2 f1" style="min-width: 0">
      <span class="hh-kick">Home Hero<template v-if="captain"> · Captain</template></span>
      <span class="hh-name ellipsis">{{ hero.name }} <Flag :country="hero.countryName" :size="17" /></span>
      <span class="hh-sub">{{ copy.pts }}<template v-if="copy.outside">, outside multipliers</template></span>
      <span v-if="captain && !compact" class="hh-tip">Late goal as captain = {{ example.formula }} = <b>{{ example.total }} pts</b></span>
    </div>
    <div v-if="points != null" class="hh-pts"><b>{{ points }}</b><span>pts</span></div>
    <div v-else class="hh-bonus">+{{ copy.bonus }}</div>
  </button>

  <button v-else-if="hasCountry" type="button" class="hh-empty" @click="emit('find')">
    <span class="badge hh inl" style="width: 30px; height: 30px; font-size: 14px">★</span>
    <span class="col g2 f1">
      <b class="sm">No Home Hero yet</b>
      <span class="xs m">Add a player from <Flag :country="countryName ?? ''" :size="12" /> {{ countryName ?? 'your country' }} for {{ copy.pts }}.</span>
    </span>
    <span class="btn xs" style="background: var(--gold); color: var(--ink)">Find<Icon name="chevron" :size="14" /></span>
  </button>

  <div v-else class="hh-empty off">
    <span class="badge hh inl" style="width: 30px; height: 30px; font-size: 14px; filter: grayscale(1)">★</span>
    <span class="col g2 f1">
      <b class="sm">Home Hero unavailable</b>
      <span class="xs m">This account has no home country, so no Home Hero bonus applies.</span>
    </span>
  </div>
</template>

<style scoped>
.hh-card {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border-radius: 18px; color: var(--ink);
  background: linear-gradient(120deg, #FFE08A 0%, #F5B400 45%, #E08A00 100%);
  box-shadow: 0 10px 24px rgba(224, 138, 0, .35), inset 0 0 0 1px rgba(255, 255, 255, .45);
}
.hh-card.compact { padding: 10px 12px; }
.hh-av { position: relative; flex: none; }
.hh-av :deep(.av) { box-shadow: 0 0 0 3px #fff, 0 6px 14px rgba(0, 0, 0, .25); }
.hh-star {
  position: absolute; right: -4px; bottom: -4px; width: 24px; height: 24px; border-radius: 50%; background: var(--ink); color: var(--gold);
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; border: 2px solid #fff;
}
.hh-kick { font: 900 italic 15px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: .8px; color: #5C3D00; }
.hh-name { font: 900 italic 26px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
.compact .hh-name { font-size: 21px; }
.hh-sub { font-size: 11.5px; font-weight: 700; color: #4A3300; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.hh-tip { font-size: 11px; color: #4A3300; background: rgba(255, 255, 255, .45); border-radius: 8px; padding: 3px 7px; align-self: flex-start; margin-top: 2px; }
.hh-bonus { font: 900 italic 34px/1 'Barlow Condensed', sans-serif; color: var(--ink); flex: none; }
.hh-pts { display: flex; flex-direction: column; align-items: center; flex: none; }
.hh-pts b { font: 900 italic 30px/1 'Barlow Condensed', sans-serif; }
.hh-pts span { font-size: 10px; font-weight: 800; text-transform: uppercase; }
.hh-empty {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 16px;
  background: var(--gold-50); border: 1.5px dashed var(--gold);
}
.hh-empty.off { border-color: var(--line); background: #fff; }
</style>
