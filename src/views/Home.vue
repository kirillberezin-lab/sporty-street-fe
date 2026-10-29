<script setup>
// Home / lobby (design 2.1): live round first, then upcoming rounds, alerts, mission and league race.
import { computed, onMounted, ref } from 'vue'
import AlertsSheet from '../components/AlertsSheet.vue'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import InstallSheet from '../components/InstallSheet.vue'
import RoundCard from '../components/RoundCard.vue'
import TabBar from '../components/TabBar.vue'
import { countdown, greeting } from '../lib/format.js'
import { useNow } from '../lib/now.js'
import { pwa } from '../lib/pwa.js'
import { twistCopy } from '../lib/rules.js'
import { community, loadLeagues } from '../stores/community.js'
import { incoming, loadFriends, respond } from '../stores/friends.js'
import { toast, toastError } from '../stores/ui.js'
import { useRouter } from 'vue-router'
import { demo } from '../stores/demo.js'
import { missionList } from '../stores/missions.js'
import { capability, notify, unreadCount } from '../stores/notify.js'
import { loadResult, loadRounds, phaseOf, rounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { store } from '../lib/util.js'
import { asset } from '../lib/url.js'

const now = useNow()
const alertsOpen = ref(false)
const installOpen = ref(false)
const installDismissed = ref(store.get('installDismissed', false))

onMounted(async () => {
  if (!community.loaded) loadLeagues()
  loadFriends({ force: true }).catch(() => {})
  await loadRounds({ force: rounds.loaded })
  const settled = rounds.list.filter((r) => phaseOf(r) === 'settled' && rounds.teams[r.id])
  settled.slice(0, 2).forEach((r) => loadResult(r.id).catch(() => {}))
})

const liveEntry = computed(() => {
  const r = rounds.list.find((x) => phaseOf(x) === 'live' && rounds.teams[x.id])
  return r ? { round: r, team: rounds.teams[r.id] } : null
})
const liveNoTeam = computed(() => (!liveEntry.value ? rounds.list.find((x) => phaseOf(x) === 'live') : null))
const openRound = computed(() => rounds.list.find((r) => phaseOf(r) === 'open'))
const upcoming = computed(() => rounds.list.filter((r) => ['open', 'scheduled'].includes(phaseOf(r))))
const lastResult = computed(() => {
  const r = rounds.list.find((x) => phaseOf(x) === 'settled' && rounds.results[x.id])
  return r ? { round: r, result: rounds.results[r.id] } : null
})
const mission = computed(() => missionList().find((m) => !m.claimed) ?? null)
const league = computed(() => community.mine.find((l) => l.type !== 'CREATOR' && l.myRank))
const leagueLine = computed(() => {
  const l = league.value
  if (!l) return null
  const top = l.memberPreview.find((p) => !p.isYou)
  return `${l.myRank === 1 ? 'Top of the table' : top ? `${top.displayName} leads` : `${l.memberCount} members`}${l.roundsRemaining ? ` · ${l.roundsRemaining} rounds left` : ''}`
})
const leagueRank = computed(() => league.value?.myRank ?? null)
// Round invitations from friends (persisted on the server): accept = enter with an auto-picked five.
const router = useRouter()
const invites = computed(() => incoming())
const answering = ref(null)
async function answer(inv, accept) {
  answering.value = inv.id
  try {
    await respond(inv, accept)
    if (accept) {
      toast({ title: `You're in ${inv.roundName}`, body: 'We picked a five for you — edit it before the lock.', tone: 'success' })
      router.push(`/rounds/${inv.roundId}/build`)
    }
  } catch (e) {
    toastError(e, 'Could not answer the invitation')
  } finally {
    answering.value = null
  }
}
const showAlertsCard = computed(() => notify.permission !== 'granted' && !['unsupported', 'insecure'].includes(capability().level))
const showInstall = computed(() => !pwa.installed && !installDismissed.value && (pwa.canInstall || pwa.isIOS))
const unread = computed(() => unreadCount())
const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`

function dismissInstall() {
  installDismissed.value = true
  store.set('installDismissed', true)
}
</script>

<template>
  <div class="screen">
    <header class="head on-red">
      <div class="top">
        <span class="logo">SportyStreet</span>
        <div class="row g12">
          <RouterLink to="/notifications" class="icon-btn" aria-label="Notifications">
            <Icon name="bell" />
            <span v-if="unread" class="bell-dot" />
          </RouterLink>
          <RouterLink to="/profile" aria-label="Profile"><Avatar :name="session.user?.displayName" :src="session.user?.avatarUrl" size="sm" ring color="#5B3A29" /></RouterLink>
        </div>
      </div>
    </header>

    <main class="ct">
      <div class="row between">
        <div class="col g2"><span class="sm m">{{ greeting() }}</span><span class="h2">{{ session.user?.displayName }}</span></div>
        <span class="pill y lg">🔥 {{ demo.streak.count }}-day streak</span>
      </div>

      <!-- live round -->
      <div v-if="liveEntry" class="card dark col g12 rise">
        <div class="row between">
          <span class="pill rr"><span class="dot live" style="background: #fff" />LIVE</span>
          <span class="pill w">{{ liveEntry.team.pendingSubstitution ? 'Sub coming on' : liveEntry.team.subsRemaining ? `${liveEntry.team.subsRemaining} sub left` : 'Sub used' }}</span>
        </div>
        <div class="col g4">
          <span class="h3">{{ liveEntry.round.name }}</span>
          <span v-if="twistCopy(liveEntry.round.rules)" class="sm soft-w">Twist: <b style="color: #fff">{{ twistCopy(liveEntry.round.rules).short }}</b></span>
        </div>
        <div class="row between">
          <div class="col g2">
            <span class="disp" style="font-size: 40px"><AnimatedNumber :value="liveEntry.team.score" /> <span style="font-size: 20px">pts</span></span>
            <span class="xs soft-w">Rank #{{ liveEntry.team.rank ?? '—' }}</span>
          </div>
          <div class="row" style="gap: 0">
            <Avatar v-for="(s, i) in liveEntry.team.starters" :key="s.player.id" :player="s.player" size="sm" :style="{ marginLeft: i ? '-8px' : 0, boxShadow: '0 0 0 2px var(--dark)' }" />
          </div>
        </div>
        <RouterLink :to="`/rounds/${liveEntry.round.id}/live`" class="btn md">Open live tactics</RouterLink>
      </div>
      <RouterLink v-else-if="liveNoTeam" :to="`/rounds/${liveNoTeam.id}/standings`" class="card dark row">
        <span class="pill rr"><span class="dot live" style="background: #fff" />LIVE</span>
        <span class="col g2 f1"><b class="sm">{{ liveNoTeam.name }}</b><span class="xs soft-w">Squads are locked · watch the standings</span></span>
        <Icon name="chevron" :size="18" />
      </RouterLink>

      <!-- next open round -->
      <RouterLink v-if="openRound && !liveEntry" :to="`/rounds/${openRound.id}${rounds.teams[openRound.id] ? '' : '/build'}`" class="card red col g6 rise next-card">
        <div class="row between">
          <span class="pill w">{{ rounds.teams[openRound.id] ? '✓ SQUAD IN' : 'NEXT ROUND' }}</span>
          <span class="xs b">Locks in {{ countdown(Date.parse(openRound.entryDeadline) - now) }}</span>
        </div>
        <span class="disp" style="font-size: 30px">{{ openRound.name }}</span>
        <span class="sm" style="opacity: .9">{{ twistCopy(openRound.rules)?.short }} · {{ openRound.fixtures?.length }} matches</span>
        <span class="btn md wht" style="margin-top: 6px">{{ rounds.teams[openRound.id] ? 'Edit my five' : 'Build my five' }}</span>
      </RouterLink>

      <!-- alerts & install -->
      <button v-if="showAlertsCard" class="card row" @click="alertsOpen = true">
        <div class="ibox" style="background: var(--gold-50); color: var(--gold-d)"><Icon name="bell" :size="22" /></div>
        <div class="f1 col g2"><b class="sm">Get tactical alerts</b><span class="xs m">Sub moments, your goals and lock reminders — even on the lock screen.</span></div>
        <Icon name="chevron" :size="18" class="m" />
      </button>
      <div v-if="showInstall" class="card row">
        <img :src="asset('pwa-64x64.png')" alt="" width="40" height="40" style="border-radius: 10px" />
        <button class="f1 col g2" @click="installOpen = true"><b class="sm">Install the app</b><span class="xs m">Home-screen icon, full screen, offline.</span></button>
        <button class="btn xs" @click="installOpen = true">Install</button>
        <button class="icon-btn m" aria-label="Dismiss" style="margin: -8px -8px -8px 0" @click="dismissInstall"><Icon name="close" :size="18" /></button>
      </div>

      <!-- upcoming -->
      <div v-for="inv in invites" :key="inv.id" class="card col g10 invite">
        <div class="row g12">
          <Avatar :name="inv.sender.displayName" :src="inv.sender.avatarUrl" size="md" />
          <div class="col g2 f1"><b class="sm">{{ inv.sender.displayName }} invited you</b><span class="xs m">{{ inv.roundName }} · join with an auto-picked five</span></div>
        </div>
        <div class="row g6">
          <button class="btn sm ghost f1" :disabled="answering === inv.id" @click="answer(inv, false)">Decline</button>
          <button class="btn sm f1" :disabled="answering === inv.id" @click="answer(inv, true)"><span v-if="answering === inv.id" class="spin" />Accept &amp; join</button>
        </div>
      </div>

      <template v-if="upcoming.length">
        <div class="sec-t"><span class="h3">Upcoming rounds</span><RouterLink to="/play">See all</RouterLink></div>
        <div class="hscroll">
          <RoundCard v-for="r in upcoming" :key="r.id" :round="r" mini />
        </div>
      </template>
      <div v-else-if="rounds.loading && !rounds.loaded" class="skel" style="height: 150px" />

      <RouterLink v-if="lastResult" :to="`/rounds/${lastResult.round.id}/result`" class="card row">
        <div class="ibox" style="background: var(--dark); color: #fff"><Icon name="whistle" :size="22" /></div>
        <div class="f1 col g2"><b class="sm">{{ lastResult.round.name }} · {{ lastResult.result.finalScore }} pts</b><span class="xs m">Finished #{{ lastResult.result.finalRank }} · see your recap</span></div>
        <span class="pill y">+{{ lastResult.result.totalAwardedRp }} RP</span>
      </RouterLink>

      <RouterLink v-if="mission" to="/rewards/missions" class="card row">
        <div class="ibox" style="background: var(--green-50); color: var(--green)"><Icon :name="mission.icon" :size="22" /></div>
        <div class="f1 col g4">
          <div class="row between"><b class="sm">{{ mission.title }}</b><span class="xs b grn">+{{ mission.reward }} RP</span></div>
          <div class="prog g"><i :style="{ width: `${(mission.progress / mission.target) * 100}%` }" /></div>
        </div>
      </RouterLink>

      <RouterLink v-if="league" :to="`/leagues/${league.id}`" class="card row">
        <div class="ibox" style="background: var(--red-50); color: var(--red)"><Icon name="trophy" :size="22" /></div>
        <div class="f1 col g2"><b class="sm">{{ league.name }} · you're {{ ordinal(leagueRank) }}</b><span class="xs m">{{ leagueLine }}</span></div>
        <Icon name="chevron" :size="18" class="m" />
      </RouterLink>

      <RouterLink to="/back" class="card row">
        <div class="ibox" style="background: var(--blue-50); color: var(--blue)"><Icon name="users" :size="22" /></div>
        <div class="f1 col g2"><b class="sm">Back a manager</b><span class="xs m">{{ demo.fanPoints }} free fan points · no squad needed</span></div>
        <Icon name="chevron" :size="18" class="m" />
      </RouterLink>
    </main>
    <TabBar />
    <AlertsSheet :open="alertsOpen" @close="alertsOpen = false" />
    <InstallSheet :open="installOpen" @close="installOpen = false" />
  </div>
</template>

<style scoped>
.bell-dot { position: absolute; top: 6px; right: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--gold); border: 2px solid var(--red); }
.next-card { background: linear-gradient(135deg, #E41827, #9C0D18); box-shadow: 0 12px 26px rgba(228, 24, 39, .3); }
.invite { border: 1.5px solid var(--red); background: linear-gradient(180deg, #FFF5F6, #fff); }
</style>
