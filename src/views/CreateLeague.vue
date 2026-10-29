<script setup>
// Create & invite (design 6.3): the code and share buttons work before the league exists.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import Toggle from '../components/Toggle.vue'
import TopBar from '../components/TopBar.vue'
import { inviteCode } from '../lib/util.js'
import { copyText, openWhatsApp } from '../lib/share.js'
import { createLeague, recordInvite } from '../stores/demo.js'
import { toast } from '../stores/ui.js'

const router = useRouter()
const name = ref('')
const format = ref('Season')
const types = ref(['Matchday', 'Quick'])
const milestone = ref(true)
const code = ref(inviteCode('FIVE'))
watch(name, (v) => (code.value = inviteCode(v || 'FIVE')))

const url = computed(() => `${location.origin}/leagues?join=${code.value}`)
const text = computed(() => `Join my SportyStreet league "${name.value || 'My league'}" — code ${code.value}`)

function toggleType(t) {
  types.value = types.value.includes(t) ? types.value.filter((x) => x !== t) : [...types.value, t]
}
function wa() {
  openWhatsApp(`${text.value} ${url.value}`)
  recordInvite()
}
async function copy() {
  if (await copyText(`${text.value} ${url.value}`)) toast({ title: 'Invite copied', body: code.value, tone: 'success', duration: 2000 })
  recordInvite()
}
function create() {
  const l = createLeague({ name: name.value.trim(), format: format.value, roundTypes: types.value, milestone: milestone.value, code: code.value })
  toast({ title: 'League created', body: `Share ${l.code} with your friends.`, tone: 'success' })
  router.replace(`/leagues/${l.id}`)
}
</script>

<template>
  <div class="screen white">
    <TopBar close="/leagues" title="Create a league" />
    <main class="ct" style="gap: 14px">
      <div class="col g6"><span class="xs b m up">League name</span><label class="input"><input v-model="name" placeholder="Lagos Ballers" maxlength="28" /></label></div>
      <div class="col g6">
        <span class="xs b m up">Format</span>
        <div class="row g6 items-stretch">
          <button class="f1 col g4 fmt" :class="{ on: format === 'Season' }" @click="format = 'Season'"><b class="sm">Season</b><span class="xs m">Points add up over the rounds you choose</span></button>
          <button class="f1 col g4 fmt" :class="{ on: format === 'Every round' }" @click="format = 'Every round'"><b class="sm">Every round</b><span class="xs m">Fresh table each round, rematch culture</span></button>
        </div>
      </div>
      <div class="col g6">
        <span class="xs b m up">Rounds included</span>
        <div class="row g6 wrap">
          <button v-for="t in ['Matchday', 'Quick', 'Specials']" :key="t" class="chip" :class="{ ron: types.includes(t) }" @click="toggleType(t)">{{ types.includes(t) ? '✓ ' : '' }}{{ t }}</button>
        </div>
      </div>
      <div class="card row" style="padding: 12px">
        <div class="col g2 f1"><b class="sm">Milestone rewards</b><span class="xs m">Everyone gets +100 RP when the league hits 10 members</span></div>
        <Toggle v-model="milestone" label="Milestone rewards" />
      </div>
      <div class="card dark col g12 items-center tc">
        <span class="xs up b" style="color: #9AA0A9">Invite code</span>
        <span class="disp" style="font-size: 44px; letter-spacing: 2px">{{ code }}</span>
        <div class="row g6" style="width: 100%">
          <button class="btn md f1 wa" @click="wa"><Icon name="whatsapp" :size="18" />WhatsApp</button>
          <button class="btn md f1 ghost on-dark-b" @click="copy"><Icon name="copy" :size="18" />Copy link</button>
        </div>
      </div>
    </main>
    <footer class="foot"><button class="btn" :disabled="!name.trim()" @click="create">Create league</button></footer>
  </div>
</template>

<style scoped>
.fmt { border: 1.5px solid var(--line); border-radius: 14px; padding: 12px; text-align: left; transition: border-color .2s, background .2s; }
.fmt.on { border: 2px solid var(--red); background: var(--red-50); padding: 11.5px; }
</style>
