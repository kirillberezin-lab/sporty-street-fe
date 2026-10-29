<script setup>
// Missions & streak (design 8.2). Progress is derived from real play; rewards are illustrative.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { claim, demo } from '../stores/demo.js'
import { missionList } from '../stores/missions.js'
import { toast } from '../stores/ui.js'

const router = useRouter()
const period = ref('daily')
const list = computed(() => missionList().filter((m) => m.period === period.value))
const ready = computed(() => missionList().filter((m) => m.done && !m.claimed))

function claimOne(m) {
  claim(m.id)
  toast({ title: `+${m.reward} RP · ${m.title}`, body: 'Demo reward — missions are not credited by the backend yet.', tone: 'success', duration: 2600 })
}
function claimAll() {
  const total = ready.value.reduce((s, m) => s + m.reward, 0)
  ready.value.forEach((m) => claim(m.id))
  toast({ title: `+${total} RP claimed`, body: 'Demo reward — missions are not credited by the backend yet.', tone: 'success' })
}
</script>

<template>
  <div class="screen white">
    <TopBar back="/rewards" title="Missions" />
    <main class="ct" style="padding-top: 4px">
      <div class="card dark row">
        <span style="font-size: 30px">🔥</span>
        <div class="col g4 f1">
          <b>{{ demo.streak.count }}-day streak</b>
          <div class="row g4"><span v-for="i in 7" :key="i" class="streak" :class="{ on: i <= Math.min(7, demo.streak.count) }" /></div>
          <span class="xs soft-w">Day 7 bonus: +300 RP</span>
        </div>
      </div>
      <div class="seg">
        <button :class="{ on: period === 'daily' }" @click="period = 'daily'">Daily</button>
        <button :class="{ on: period === 'weekly' }" @click="period = 'weekly'">Weekly</button>
        <button :class="{ on: period === 'season' }" @click="period = 'season'">Season</button>
      </div>
      <div class="col g2">
        <div v-for="m in list" :key="m.id" class="li">
          <div class="ibox" :style="m.done ? 'background: var(--green-50); color: var(--green)' : 'background: var(--bg); color: var(--mute)'">
            <Icon :name="m.done ? 'check' : m.icon" :size="20" :stroke="m.done ? 2.4 : 2" />
          </div>
          <div class="col g4 f1">
            <div class="row between"><b class="sm">{{ m.title }}</b><span v-if="!m.done" class="xs m">{{ m.progress }}/{{ m.target }}</span></div>
            <div class="prog" :class="{ g: m.done }"><i :style="{ width: `${(m.progress / m.target) * 100}%` }" /></div>
          </div>
          <span v-if="m.claimed" class="pill g">Claimed</span>
          <button v-else-if="m.done" class="btn xs" @click="claimOne(m)">+{{ m.reward }}</button>
          <button v-else-if="m.to" class="sm b red" @click="router.push(m.to)">+{{ m.reward }}</button>
          <span v-else class="sm b red">+{{ m.reward }}</span>
        </div>
      </div>
      <span class="xs m tc">Mission rewards are a demo — the backend only credits RP for finished rounds today.</span>
    </main>
    <footer class="foot">
      <button class="btn" :disabled="!ready.length" @click="claimAll">{{ ready.length ? `Claim all · +${ready.reduce((s, m) => s + m.reward, 0)} RP` : 'Nothing to claim yet' }}</button>
    </footer>
  </div>
</template>

<style scoped>
.streak { flex: 1; height: 6px; border-radius: 3px; background: #3A3F47; }
.streak.on { background: var(--gold); }
</style>
