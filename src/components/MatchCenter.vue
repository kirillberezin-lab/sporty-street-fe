<script setup>
// "Around the grounds": live scores and the latest match events of the round, from the stream's
// `matches` extension (static build / mock). Hidden when the backend does not send it.
import { computed } from 'vue'
import { shortName } from '../lib/players.js'

const props = defineProps({
  matches: { type: Array, default: () => [] },
  minute: { type: Number, default: null },
  settled: Boolean,
  myIds: { type: Object, default: () => new Set() }, // player ids in my five
})

const CLUB_SHORT = { 'Real Madrid': 'RMA', 'FC Barcelona': 'BAR', 'Manchester City': 'MCI', Liverpool: 'LIV', 'Bayern Munich': 'BAY', 'Paris Saint-Germain': 'PSG' }
const short = (name) => CLUB_SHORT[name] ?? name.slice(0, 3).toUpperCase()
const ICON = { GOAL: '⚽', ASSIST: '🅰️', YELLOW_CARD: '🟨', RED_CARD: '🟥', OWN_GOAL: '⚽' }
const VERB = { GOAL: 'scores', ASSIST: 'assist', YELLOW_CARD: 'booked', RED_CARD: 'sent off', OWN_GOAL: 'own goal' }

const feed = computed(() =>
  props.matches
    .flatMap((m) => m.events.map((e) => ({ ...e, club: short(e.side === 'HOME' ? m.homeClubName : m.awayClubName) })))
    .sort((a, b) => b.minute - a.minute)
    .slice(0, 5),
)
</script>

<template>
  <div v-if="matches.length" class="card mc">
    <div class="row between" style="padding: 10px 14px 6px">
      <b class="xs up m">Around the grounds</b>
      <span class="xs b" :class="settled ? 'm' : 'red'">{{ settled ? 'Full time' : minute != null ? `● ${minute}'` : '' }}</span>
    </div>
    <div class="scores">
      <div v-for="m in matches" :key="m.fixtureId" class="fx">
        <span class="xs b">{{ short(m.homeClubName) }}</span>
        <TransitionGroup tag="span" name="flip" class="sc disp"><span :key="`${m.homeGoals}-${m.awayGoals}`">{{ m.homeGoals }}–{{ m.awayGoals }}</span></TransitionGroup>
        <span class="xs b">{{ short(m.awayClubName) }}</span>
      </div>
    </div>
    <TransitionGroup tag="div" name="feed" class="feed">
      <div v-for="e in feed" :key="e.id" class="ev" :class="{ mine: myIds.has(e.playerId) }">
        <span class="xs m b" style="width: 26px">{{ e.minute }}'</span>
        <span>{{ ICON[e.type] ?? '•' }}</span>
        <span class="xs f1 ellipsis"><b>{{ shortName(e.playerName) }}</b> {{ VERB[e.type] ?? e.type.toLowerCase() }} · {{ e.club }}</span>
        <span v-if="myIds.has(e.playerId)" class="pill g">Your five</span>
      </div>
    </TransitionGroup>
    <div v-if="!feed.length" class="xs m" style="padding: 0 14px 12px">Kick-off — nothing on the scoresheet yet.</div>
  </div>
</template>

<style scoped>
.mc { padding: 0; overflow: hidden; }
.scores { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 10px 10px; }
.fx { display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--dark); color: #fff; border-radius: 10px; padding: 7px 4px; }
.sc { font-size: 20px; min-width: 34px; text-align: center; display: inline-block; }
.feed { border-top: 1px solid var(--line); padding: 4px 14px 8px; display: flex; flex-direction: column; }
.ev { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.ev.mine b { color: var(--green); }
.feed-enter-active { transition: all .4s var(--ease); }
.feed-enter-from { opacity: 0; transform: translateY(-6px); }
.flip-enter-active { animation: pop .5s var(--ease); }
@keyframes pop { 0% { transform: scale(1.6); color: var(--gold); } 100% { transform: scale(1); } }
</style>
