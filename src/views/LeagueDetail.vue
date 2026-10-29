<script setup>
// League detail (design 6.2): table, rivalries and banter from the community API (read-only,
// simulated), plus real challenge links from this device. Reactions and quick messages are previews.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { ago, num, ordinal } from '../lib/format.js'
import { copyText, shareNative } from '../lib/share.js'
import { appUrl } from '../lib/url.js'
import { leagueBanter, leagueDetail, leagueRivalries } from '../stores/community.js'
import { demo, recordInvite } from '../stores/demo.js'
import { nextOpenRound, rounds } from '../stores/rounds.js'
import { toast } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const tab = ref(route.query.tab === 'banter' ? 'banter' : route.query.tab === 'rivals' ? 'rivals' : 'table')
const detail = ref(null)
const rivalries = ref(null)
const banter = ref(null)
const error = ref(null)
const mine = ref({}) // messageId -> my reaction (local preview)

onMounted(async () => {
  try {
    detail.value = await leagueDetail(id)
    ;[rivalries.value, banter.value] = await Promise.all([leagueRivalries(id), leagueBanter(id)])
  } catch (e) {
    error.value = e
  }
})

const league = computed(() => detail.value?.league)
const table = computed(() => detail.value?.members ?? [])
const me = computed(() => table.value.find((m) => m.profile.isYou))
const leader = computed(() => table.value[0])
const linkChallenges = computed(() => demo.challenges)
const next = computed(() => nextOpenRound())
// League art behind the whole header (a layer on top would swallow the back button's taps).
const coverStyle = computed(() => (league.value?.imageUrl ? { background: `linear-gradient(180deg, rgba(26, 29, 35, .55), rgba(26, 29, 35, .95)), url(${league.value.imageUrl}) center / cover` } : null))
const headline = computed(() => {
  if (!me.value || !leader.value) return ''
  if (me.value.rank === 1) return `You lead by ${num(me.value.score - (table.value[1]?.score ?? 0))} pts`
  return `${num(leader.value.score - me.value.score)} pts behind ${leader.value.profile.displayName}`
})

async function invite() {
  const l = league.value
  const url = appUrl(`/leagues?join=${l.inviteCode}`)
  const text = `Join my SportyStreet league "${l.name}" — code ${l.inviteCode}`
  const res = await shareNative({ title: l.name, text, url })
  if (res === 'unsupported' && (await copyText(`${text} ${url}`))) toast({ title: 'Invite copied', body: l.inviteCode, tone: 'success' })
  if (res !== 'cancelled') recordInvite()
}
function rematch(name) {
  if (!next.value) return router.push('/play')
  toast({ title: `Rematch on ${next.value.name}`, body: `Lock your five, then send ${name ?? 'them'} the challenge link.` })
  router.push(`/rounds/${next.value.id}/build`)
}
function react(m, e) {
  const prev = mine.value[m.id]
  if (prev === e) return
  if (prev) m.reactions[prev] -= 1
  m.reactions[e] = (m.reactions[e] ?? 0) + 1
  mine.value[m.id] = e
}
const sendQuick = (q) => toast({ title: 'Preview only', body: `“${q.text}” — posting to the league arrives with the banter service.`, duration: 2600 })
</script>

<template>
  <div v-if="league" class="screen white">
    <TopBar back="/leagues" tone="dark" :style="coverStyle">
      <template #right><button class="btn sm" style="height: 32px" @click="invite">Invite friends</button></template>
      <div class="row g12" style="padding: 0 16px 14px">
        <div class="col g6 f1">
          <span class="disp" style="font-size: 34px">{{ league.name }}</span>
          <span class="xs soft-w">{{ league.memberCount }} members · {{ league.format === 'SEASON' ? `Season: ${league.roundsRemaining} of ${league.seasonRounds} rounds left` : 'Fresh table every round' }} · code {{ league.inviteCode }}</span>
          <span v-if="headline" class="xs b" style="color: #FFD15C">{{ ordinal(me.rank) }} · {{ headline }}</span>
        </div>
      </div>
    </TopBar>
    <main class="ct" style="padding-top: 12px">
      <div class="seg">
        <button :class="{ on: tab === 'table' }" @click="tab = 'table'">Table</button>
        <button :class="{ on: tab === 'rivals' }" @click="tab = 'rivals'">Rivalries{{ rivalries?.challenges?.length ? ` · ${rivalries.challenges.length}` : '' }}</button>
        <button :class="{ on: tab === 'banter' }" @click="tab = 'banter'">Banter</button>
      </div>

      <div v-if="tab === 'table'" class="tbl stagger">
        <div v-for="m in table" :key="m.profile.id" class="tr" :class="{ me: m.profile.isYou }">
          <span class="rk">{{ m.rank }}</span>
          <Avatar :name="m.profile.displayName" :src="m.profile.avatarUrl" size="sm" />
          <div class="col g2 f1" style="min-width: 0"><b class="ellipsis">{{ m.profile.isYou ? `${m.profile.displayName} (you)` : m.profile.displayName }}</b><span class="xs m ellipsis">{{ m.profile.teamName }}</span></div>
          <span class="xs m">{{ m.wins }}W</span>
          <b style="width: 52px; text-align: right" class="num">{{ num(m.score) }}</b>
        </div>
      </div>

      <template v-if="tab === 'rivals'">
        <template v-if="rivalries?.challenges?.length">
          <span class="xs b m up">Challenges</span>
          <div v-for="c in rivalries.challenges" :key="c.id" class="card row" style="padding: 10px 12px">
            <Avatar :name="(c.direction === 'INCOMING' ? c.from : c.to).displayName" :src="(c.direction === 'INCOMING' ? c.from : c.to).avatarUrl" size="sm" />
            <span class="sm f1"><template v-if="c.direction === 'INCOMING'"><b>{{ c.from.displayName }}</b> challenged you</template><template v-else>You challenged <b>{{ c.to.displayName }}</b></template> · {{ c.roundLabel }}</span>
            <button v-if="c.direction === 'INCOMING'" class="btn xs" @click="rematch(c.from.displayName)">Accept</button>
            <span v-else class="pill o">{{ c.status === 'PENDING' ? 'Waiting' : c.status.toLowerCase() }}</span>
          </div>
        </template>
        <span class="xs b m up">Head-to-head</span>
        <div v-for="r in rivalries?.items ?? []" :key="r.id" class="card col g12">
          <div class="row between">
            <div class="row g6"><Avatar :name="r.you.displayName" :src="r.you.avatarUrl" size="md" /><b class="sm">You</b></div>
            <div class="col g2 items-center"><span class="disp" style="font-size: 32px">{{ r.wins }} – {{ r.losses }}</span><span class="xs m">{{ r.draws ? `${r.draws} draw${r.draws > 1 ? 's' : ''}` : 'head-to-head' }}</span></div>
            <div class="row g6"><b class="sm">{{ r.opponent.displayName }}</b><Avatar :name="r.opponent.displayName" :src="r.opponent.avatarUrl" size="md" /></div>
          </div>
          <div class="row g4 center"><span v-for="(f, i) in r.recentForm" :key="i" class="pill" :class="f === 'W' ? 'g' : f === 'L' ? 'r' : 'o'">{{ f }}</span></div>
          <button class="btn md" @click="rematch(r.opponent.displayName)">Rematch{{ next ? ` on ${next.name}` : '' }}</button>
        </div>
        <RouterLink v-for="c in linkChallenges" :key="c.roundId + c.teamId" :to="`/rounds/${c.roundId}/standings`" class="card row" style="padding: 10px 12px">
          <Avatar :name="c.name" size="sm" />
          <span class="sm f1"><b>{{ c.name }}</b> challenged you by link · {{ rounds.byId[c.roundId]?.name ?? 'a round' }}</span>
          <span class="btn xs">View</span>
        </RouterLink>
        <div v-if="rivalries && !rivalries.items.length && !rivalries.challenges.length && !linkChallenges.length" class="empty"><div class="ico"><Icon name="swap" /></div><b style="color: var(--ink)">No rivalries yet</b><span class="sm">Lock your five and send a challenge link.</span></div>
      </template>

      <template v-if="tab === 'banter'">
        <div v-if="!banter?.messages?.items?.length" class="empty"><span class="sm">No banter yet.</span></div>
        <div v-for="m in banter?.messages?.items ?? []" :key="m.id" class="card col g6">
          <div class="row g6"><Avatar :name="m.author.displayName" :src="m.author.avatarUrl" size="xs" /><b class="sm">{{ m.author.displayName }}</b><span class="xs m">{{ ago(m.createdAt) }}</span></div>
          <span class="sm">“{{ m.text }}”</span>
          <div class="row g6 wrap">
            <button v-for="(n, e) in m.reactions" :key="e" class="chip sm" :class="{ ron: mine[m.id] === e }" @click="react(m, e)">{{ e }} {{ n }}</button>
          </div>
        </div>
        <template v-if="banter?.quickMessages?.length">
          <span class="xs b m up">Quick messages</span>
          <div class="row g6 wrap">
            <button v-for="q in banter.quickMessages" :key="q.id" class="chip" @click="sendQuick(q)">{{ q.text }}</button>
          </div>
        </template>
        <div class="note"><Icon name="info" :size="16" /><span>Preset messages and reactions only — no free chat in v1 for moderation.</span></div>
      </template>
      <span class="xs m tc">{{ detail?.dataMode === 'LOCAL' ? 'League created on this device.' : 'Simulated preview content · read-only.' }}</span>
    </main>
  </div>
  <div v-else class="screen white">
    <TopBar back="/leagues" title="League" />
    <div v-if="error" class="empty"><b style="color: var(--ink)">{{ error.status === 404 ? 'League not found' : 'League unavailable' }}</b><span v-if="error.status !== 404" class="sm">{{ error.message }}</span><RouterLink to="/leagues" class="btn sm">All leagues</RouterLink></div>
    <main v-else class="ct"><div class="skel" style="height: 90px" /><div class="skel" style="height: 300px" /></main>
  </div>
</template>

