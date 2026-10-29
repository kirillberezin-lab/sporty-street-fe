<script setup>
// Rules & scoring sheet (same content as onboarding 1.6), from GET /rules.
import { computed } from 'vue'
import TopBar from '../components/TopBar.vue'
import { signed } from '../lib/format.js'
import { bestCaseExample, homeHeroCopy, scoringRows, twistCopy } from '../lib/rules.js'
import { session } from '../stores/session.js'

const rules = computed(() => session.rules)
const rows = computed(() => scoringRows(rules.value))
const twist = computed(() => twistCopy(rules.value))
const hh = computed(() => homeHeroCopy(rules.value))
const ex = computed(() => bestCaseExample(rules.value))
</script>

<template>
  <div class="screen white">
    <TopBar back="/play" title="Rules & scoring" />
    <main class="ct">
      <div class="col g6">
        <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px">1</span><span class="sm"><b>Pick {{ rules?.starterCount ?? 5 }} starters + {{ rules?.benchCount ?? 1 }} bench.</b> {{ rules?.distinctStarterCountries === false ? 'Any countries.' : 'Every starter from a different country.' }} Free formation, no credits.</span></div>
        <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px">2</span><span class="sm"><b>Name a captain:</b> his points count ×{{ rules?.captainMultiplier ?? 2 }}. The captain is never reassigned after a sub.</span></div>
        <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px">3</span><span class="sm"><b>Squads lock</b> at the entry deadline. Before that you can edit freely.</span></div>
        <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px">4</span><span class="sm"><b>One live substitution</b> per round. It becomes active {{ rules?.subActivationDelaySeconds ?? 60 }} seconds after you confirm — until then the outgoing player still scores.</span></div>
      </div>
      <span class="xs b m up">Points</span>
      <div class="card flat">
        <div v-for="r in rows" :key="r.key" class="li sm"><span class="f1 b">{{ r.label }}</span><span class="m">{{ signed(r.points) }}</span></div>
      </div>
      <div v-if="twist" class="card dark row" style="padding: 12px 14px"><span class="pill rr">TWIST</span><span class="sm f1"><b>{{ twist.short }}</b> — {{ twist.detail }}</span></div>
      <div class="card soft col g6">
        <div class="row g6"><span class="badge hh inl" style="width: 24px; height: 24px">★</span><b class="sm">Home Hero</b></div>
        <span class="sm" style="line-height: 1.45">The starter from your home country earns {{ hh.pts }}{{ hh.outside ? ', added outside the late-goal and captain multipliers' : '' }}. A home captain's late goal: {{ ex.formula }} = <b>{{ ex.total }} pts</b>.</span>
      </div>
      <span class="xs b m up">Rewards</span>
      <div class="card flat">
        <div class="li sm"><span class="f1 b">Finish a round</span><span class="m">{{ rules?.rewards?.participationRp ?? 50 }} RP</span></div>
        <div class="li sm"><span class="f1 b">Finish 1st (ties included)</span><span class="m">+{{ rules?.rewards?.winnerBonusRp ?? 100 }} RP</span></div>
      </div>
      <div class="note">Fantasy points and reward points (RP) are separate balances. Results are final once a round is settled — no corrections or reopening.</div>
    </main>
  </div>
</template>
