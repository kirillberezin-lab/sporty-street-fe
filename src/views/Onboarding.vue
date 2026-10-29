<script setup>
// Onboarding: value carousel (design 1.2) → how a round works (1.6).
// Sign-in, home country and competitions (1.3–1.5) are intentionally removed.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import { featuredPlayer, loadFeatured } from '../stores/featured.js'
import { finishOnboarding, session } from '../stores/session.js'
import { bestCaseExample, homeHeroCopy, scoringRows, twistCopy } from '../lib/rules.js'
import { signed } from '../lib/format.js'

const router = useRouter()
const route = useRoute()
const step = ref(0)
onMounted(loadFeatured)
const SLIDES = 3

const rules = computed(() => session.rules)
const twist = computed(() => twistCopy(rules.value))
const hh = computed(() => homeHeroCopy(rules.value))
const example = computed(() => bestCaseExample(rules.value))
const rows = computed(() => scoringRows(rules.value))

const slides = [
  { title: ['Pick five.', 'Not fifteen.'], text: 'Build a squad of global stars in one tap. No season-long homework, no 15-man spreadsheet.' },
  { title: ['Make your', 'live move.'], text: 'One substitution while you watch, plus an announced twist that changes the scoring every round.' },
  { title: ['Beat friends,', 'earn perks.'], text: 'Challenge your friends, climb the table and swap reward points for airtime, data and food vouchers.' },
]

function next() {
  if (step.value < SLIDES) step.value += 1
  else done()
}
function done() {
  finishOnboarding()
  router.replace(typeof route.query.next === 'string' ? route.query.next : '/')
}

let x0 = null
const onStart = (e) => (x0 = e.touches[0].clientX)
function onEnd(e) {
  if (x0 == null) return
  const dx = e.changedTouches[0].clientX - x0
  if (dx < -50 && step.value < SLIDES) step.value += 1
  if (dx > 50 && step.value > 0) step.value -= 1
  x0 = null
}
</script>

<template>
  <div class="screen white">
    <header class="head" style="background: #fff">
      <div class="top">
        <button v-if="step === SLIDES" class="icon-btn" aria-label="Back" @click="step -= 1"><Icon name="back" :stroke="2.2" /></button>
        <span v-else />
        <div v-if="step === SLIDES" class="prog" style="width: 160px; height: 6px"><i style="width: 100%" /></div>
        <button v-if="step < SLIDES" class="sm b m" @click="step = SLIDES">Skip</button>
        <span v-else class="sm m b">Rules</span>
      </div>
    </header>

    <Transition name="fade" mode="out-in">
      <div v-if="step < SLIDES" :key="step" class="ct" style="gap: 20px" @touchstart.passive="onStart" @touchend="onEnd">
        <!-- slide visuals -->
        <div v-if="step === 0" class="pitch rise" style="min-height: 340px; gap: 0">
          <div class="pl half" /><div class="pl circ" /><div class="pl boxt" /><div class="pl boxb" />
          <div class="prow"><Avatar :player="featuredPlayer('Kylian Mbappé')" size="lg" ring captain class="pop-in" /></div>
          <div class="prow" style="gap: 60px">
            <Avatar :player="featuredPlayer('Jude Bellingham')" size="lg" ring class="pop-in" style="animation-delay: .08s" />
            <Avatar :player="featuredPlayer('Pedri')" size="lg" ring class="pop-in" style="animation-delay: .12s" />
          </div>
          <div class="prow"><Avatar :player="featuredPlayer('Virgil van Dijk')" size="lg" ring class="pop-in" style="animation-delay: .16s" /></div>
          <div class="prow"><Avatar :player="featuredPlayer('Alisson Becker')" size="lg" ring class="pop-in" style="animation-delay: .2s" /></div>
        </div>
        <div v-else-if="step === 1" class="col g12 rise" style="min-height: 340px; justify-content: center">
          <div class="card dark col g12">
            <div class="row" style="background: var(--red); margin: -14px -14px 0; padding: 6px 14px; border-radius: 18px 18px 0 0"><span class="xs b up">● Active twist</span></div>
            <span class="disp" style="font-size: 34px">{{ twist?.title ?? 'Late goals ×2' }}</span>
            <span class="xs soft-w">{{ twist?.detail }}</span>
          </div>
          <div class="card col g12">
            <div class="row between">
              <div class="row g6"><Avatar :player="featuredPlayer('Pedri')" size="md" /><div class="col g2"><b class="sm">PEDRI</b><span class="xs b gold">● Booked</span></div></div>
              <Icon name="swap" :size="22" class="m" />
              <div class="row g6"><div class="col g2 items-end"><b class="sm">GAVI</b><span class="xs m">● Warming up</span></div><Avatar :player="featuredPlayer('Gavi')" size="md" /></div>
            </div>
            <div class="btn md">Use my substitution</div>
          </div>
        </div>
        <div v-else class="col g12 rise" style="min-height: 340px; justify-content: center">
          <div class="card" style="padding: 6px">
            <div class="tr"><span class="rk">1</span><div class="av sm" style="background: #7C3AED">AD</div><b class="f1">Ada FC</b><b>158</b></div>
            <div class="tr me"><span class="rk">2</span><span class="mv grn">▲1</span><div class="av sm" style="background: #5B3A29">YOU</div><b class="f1">Your Five</b><b>136</b></div>
            <div class="tr"><span class="rk">3</span><div class="av sm" style="background: #0F766E">TU</div><b class="f1">Tunde XI</b><b>131</b></div>
          </div>
          <div class="card" style="padding: 0; overflow: hidden">
            <div style="background: linear-gradient(135deg, #0E7A3E, #064E25); color: #fff; padding: 14px" class="row between">
              <div class="col g2"><span class="disp" style="font-size: 34px">₦500</span><span class="xs b">Food voucher</span></div>
              <span class="pill w">150 RP</span>
            </div>
          </div>
        </div>

        <div class="col g12">
          <div class="row g6">
            <span v-for="i in SLIDES" :key="i" class="dotbar" :class="{ on: i - 1 === step }" />
          </div>
          <div class="disp" style="font-size: 44px">{{ slides[step].title[0] }}<br /><span class="red">{{ slides[step].title[1] }}</span></div>
          <p class="t">{{ slides[step].text }}</p>
        </div>
      </div>

      <div v-else key="rules" class="ct" style="gap: 14px">
        <div class="h1">How a round works</div>
        <div class="col g6">
          <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px; flex: none">1</span><span class="sm"><b>Pick {{ rules?.starterCount ?? 5 }} + {{ rules?.benchCount ?? 1 }} bench</b> from {{ rules?.starterCount ?? 5 }} different countries. Name a captain (×{{ rules?.captainMultiplier ?? 2 }}).</span></div>
          <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px; flex: none">2</span><span class="sm"><b>Squad locks</b> at the round's entry deadline.</span></div>
          <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px; flex: none">3</span><span class="sm"><b>One live sub:</b> your bench player comes on {{ rules?.subActivationDelaySeconds ?? 60 }}s after you confirm.</span></div>
          <div class="row items-start"><span class="disp red" style="font-size: 26px; width: 28px; flex: none">4</span><span class="sm"><b>Twist</b> announced before entry changes the scoring.</span></div>
        </div>
        <div class="card flat">
          <div v-for="r in rows" :key="r.key" class="li sm"><span class="f1 b">{{ r.label }}</span><span class="m">{{ signed(r.points) }}</span></div>
          <div class="li sm"><span class="f1 b">Captain</span><span class="m">×{{ rules?.captainMultiplier ?? 2 }}</span></div>
        </div>
        <div class="card dark row" style="padding: 12px 14px"><span class="pill rr">TWIST</span><span class="sm f1"><b>{{ twist?.short ?? "Late goals ×2 (75'+)" }}</b> — {{ twist?.detail }}</span></div>
        <div class="card soft row items-start">
          <span class="badge hh inl" style="width: 28px; height: 28px; font-size: 13px">★</span>
          <p class="sm" style="line-height: 1.45"><b>Home Hero:</b> your countryman in the five earns {{ hh.pts }}. A home captain's late goal = {{ example.formula }} = <b>{{ example.total }} pts</b>.</p>
        </div>
      </div>
    </Transition>

    <footer class="foot">
      <button class="btn" @click="next">{{ step < SLIDES ? 'Next' : "Let's play" }}</button>
    </footer>
  </div>
</template>

<style scoped>
.dotbar { width: 6px; height: 6px; border-radius: 3px; background: #D5D8DD; transition: width .3s var(--ease), background .3s; }
.dotbar.on { width: 24px; background: var(--red); }
</style>
