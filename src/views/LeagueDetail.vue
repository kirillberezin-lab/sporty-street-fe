<script setup>
// League detail (design 6.2): table, rivalries (incl. real challenge links), banter.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { num } from '../lib/format.js'
import { copyText, shareNative } from '../lib/share.js'
import { demo, recordInvite } from '../stores/demo.js'
import { nextOpenRound, rounds } from '../stores/rounds.js'
import { toast } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const league = computed(() => demo.leagues?.find((l) => l.id === route.params.id))
const tab = ref('table')
const reactions = ref({ '🔥': 12, '😂': 5, '🤝': 3, '⚽': 7 })
const reacted = ref(null)

const table = computed(() => [...(league.value?.members ?? [])].sort((a, b) => b.pts - a.pts))
const leader = computed(() => table.value[0])
const me = computed(() => table.value.find((m) => m.me))
const rivals = computed(() => demo.challenges)
const next = computed(() => nextOpenRound())
const H2H = ['W', 'L', 'L', 'W', 'L']

async function invite() {
  const l = league.value
  const url = `${location.origin}/leagues?join=${l.code}`
  const text = `Join my SportyStreet league "${l.name}" — code ${l.code}`
  const res = await shareNative({ title: l.name, text, url })
  if (res === 'unsupported' && (await copyText(`${text} ${url}`))) toast({ title: 'Invite copied', body: l.code, tone: 'success' })
  if (res !== 'cancelled') recordInvite()
}
function rematch() {
  if (!next.value) return router.push('/play')
  toast({ title: `Rematch on ${next.value.name}`, body: 'Lock your five, then send the challenge link.' })
  router.push(`/rounds/${next.value.id}/build`)
}
function react(e) {
  if (reacted.value === e) return
  if (reacted.value) reactions.value[reacted.value] -= 1
  reactions.value[e] += 1
  reacted.value = e
}
</script>

<template>
  <div v-if="league" class="screen white">
    <TopBar back="/leagues" tone="dark">
      <template #right><button class="btn sm" style="height: 32px" @click="invite">Invite friends</button></template>
      <div class="col g6" style="padding: 0 16px 14px">
        <span class="disp" style="font-size: 36px">{{ league.name }}</span>
        <span class="xs soft-w">{{ table.length }} members · {{ league.format === 'Season' ? `Season: ${league.rounds || 14} rounds` : 'Fresh table every round' }} · code {{ league.code }}</span>
      </div>
    </TopBar>
    <main class="ct" style="padding-top: 12px">
      <div class="seg">
        <button :class="{ on: tab === 'table' }" @click="tab = 'table'">Table</button>
        <button :class="{ on: tab === 'rivals' }" @click="tab = 'rivals'">Rivalries</button>
        <button :class="{ on: tab === 'banter' }" @click="tab = 'banter'">Banter</button>
      </div>

      <template v-if="tab === 'table'">
        <div class="tbl stagger">
          <div v-for="(m, i) in table" :key="m.name" class="tr" :class="{ me: m.me }">
            <span class="rk">{{ i + 1 }}</span>
            <Avatar :name="m.name" :color="m.color" size="sm" />
            <b class="f1 ellipsis">{{ m.name }}</b>
            <span class="xs m">{{ m.wins }}W</span>
            <b style="width: 52px; text-align: right" class="num">{{ num(m.pts) }}</b>
          </div>
        </div>
      </template>

      <template v-if="tab === 'table' || tab === 'rivals'">
        <span class="xs b m up">Your rivalries</span>
        <div v-if="leader && me && !leader.me" class="card col g12">
          <div class="row between">
            <div class="row g6"><Avatar :name="me.name" :color="me.color" size="md" /><b class="sm">You</b></div>
            <div class="col g2 items-center"><span class="disp" style="font-size: 34px">3 – 4</span><span class="xs m">head-to-head</span></div>
            <div class="row g6"><b class="sm">{{ leader.name.split(' ')[0] }}</b><Avatar :name="leader.name" :color="leader.color" size="md" /></div>
          </div>
          <div class="row g4 center"><span v-for="(r, i) in H2H" :key="i" class="pill" :class="r === 'W' ? 'g' : 'r'">{{ r }}</span></div>
          <button class="btn md" @click="rematch">Rematch{{ next ? ` on ${next.name}` : '' }}</button>
        </div>
        <RouterLink v-for="c in rivals" :key="c.roundId + c.teamId" :to="`/rounds/${c.roundId}/standings`" class="card row" style="padding: 10px 12px">
          <Avatar :name="c.name" size="sm" />
          <span class="sm f1"><b>{{ c.name }}</b> challenged you · {{ rounds.byId[c.roundId]?.name ?? 'a round' }}</span>
          <span class="btn xs">View</span>
        </RouterLink>
        <div v-if="!rivals.length && tab === 'rivals'" class="empty"><div class="ico"><Icon name="swap" /></div><b style="color: var(--ink)">No challenges yet</b><span class="sm">Lock your five and send a challenge link.</span></div>
      </template>

      <template v-if="tab === 'banter'">
        <div class="card col g6">
          <div class="row g6"><Avatar :name="leader?.name" :color="leader?.color" size="xs" /><b class="sm">{{ leader?.name }}</b><span class="xs m">2h</span></div>
          <span class="sm">“Top of the table again. Who's stopping me this round?”</span>
          <div class="row g6 wrap">
            <button v-for="(n, e) in reactions" :key="e" class="chip sm" :class="{ ron: reacted === e }" @click="react(e)">{{ e }} {{ n }}</button>
          </div>
        </div>
        <span class="xs b m up">Quick messages</span>
        <div class="row g6 wrap">
          <button v-for="m in ['Rematch?', 'Lucky sub 😅', 'See you at the top', 'GG']" :key="m" class="chip" @click="toast({ title: 'Sent to the league', body: m, duration: 1800 })">{{ m }}</button>
        </div>
        <div class="note"><Icon name="info" :size="16" /><span>Preset messages and reactions only — no free chat in v1 for moderation.</span></div>
      </template>
    </main>
  </div>
  <div v-else class="screen white">
    <TopBar back="/leagues" title="League" />
    <div class="empty"><b style="color: var(--ink)">League not found</b><RouterLink to="/leagues" class="btn sm">All leagues</RouterLink></div>
  </div>
</template>
