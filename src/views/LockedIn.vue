<script setup>
// Locked in + share card (design 3.6). The challenge link lands friends on the same round
// with this five to beat (see lib/challenge.js); the card is shared as a real PNG.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AlertsSheet from '../components/AlertsSheet.vue'
import Icon from '../components/Icon.vue'
import InviteFriendsSheet from '../components/InviteFriendsSheet.vue'
import SquadShareCard from '../components/SquadShareCard.vue'
import { renderSquadCard } from '../lib/cards.js'
import { challengeUrl, encodeChallenge } from '../lib/challenge.js'
import { flagEmoji } from '../lib/countries.js'
import { clock } from '../lib/format.js'
import { backOr } from '../lib/nav.js'
import { clubColor, initials, shortName } from '../lib/players.js'
import { canShareFiles, copyText, downloadBlob, openWhatsApp, shareNative } from '../lib/share.js'
import { recordInvite, recordShare } from '../stores/demo.js'
import { friends, loadFriends } from '../stores/friends.js'
import { notify } from '../stores/notify.js'
import { loadMyTeam, loadRound, rounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const busy = ref('')
const alertsOpen = ref(false)
const inviteOpen = ref(false)

onMounted(async () => {
  loadFriends().catch(() => {})
  try {
    await Promise.all([rounds.byId[id] ? null : loadRound(id), rounds.teams[id] ? null : loadMyTeam(id)])
    if (!rounds.teams[id]) router.replace(`/rounds/${id}/build`)
  } catch (e) {
    toastError(e)
  }
})

const round = computed(() => rounds.byId[id])
const team = computed(() => rounds.teams[id])
const owner = computed(() => `${session.user?.displayName ?? 'My'}'s world five`)
const cardPlayers = computed(() =>
  (team.value?.starters ?? []).map((s) => ({
    player: s.player,
    captain: s.player.id === team.value.captainPlayerId,
    hero: s.player.id === team.value.homeHeroPlayerId,
  })),
)
const link = computed(() => {
  if (!team.value) return ''
  const code = encodeChallenge({
    roundId: id,
    teamId: team.value.id,
    playerIds: team.value.starters.map((s) => s.player.id),
    captainId: team.value.captainPlayerId,
    heroId: team.value.homeHeroPlayerId,
    name: session.user?.displayName ?? '',
  })
  return challengeUrl(code)
})
const shortLink = computed(() => link.value.replace(/^https?:\/\//, '').replace(/(\/c\/.{6}).*/, '$1…'))
const firstKickoff = computed(() => [...(round.value?.fixtures ?? [])].sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))[0]?.kickoffAt)
const text = computed(() => {
  const names = cardPlayers.value.map((p) => `${shortName(p.player.name)}${p.captain ? ' (C)' : ''}${p.hero ? ' ★' : ''}`).join(', ')
  return `My five for ${round.value?.name}: ${names}. Think you can beat it? Build yours on SportyStreet 👇`
})

async function image(format) {
  const blob = await renderSquadCard({
    roundName: round.value?.name ?? '',
    title: owner.value,
    players: cardPlayers.value.map((p) => ({ name: p.player.name, initials: initials(p.player.name), color: clubColor(p.player.clubName), captain: p.captain, hero: p.hero, flag: flagEmoji(p.player.countryName), imageUrl: p.player.imageUrl })),
    link: shortLink.value,
    format,
  })
  return new File([blob], `sportystreet-${format}.png`, { type: 'image/png' })
}

async function run(kind, fn) {
  busy.value = kind
  try {
    await fn()
  } catch (e) {
    toastError(e, 'Sharing failed')
  } finally {
    busy.value = ''
  }
}

const whatsapp = () =>
  run('wa', async () => {
    openWhatsApp(`${text.value}\n${link.value}`)
    recordShare()
    recordInvite()
  })

const story = () =>
  run('story', async () => {
    const file = await image('story')
    const res = canShareFiles() ? await shareNative({ title: owner.value, text: link.value, file }) : 'unsupported'
    if (res === 'unsupported') {
      downloadBlob(file, file.name)
      toast({ title: 'Story image saved', body: 'Post it to your story and add the link sticker.' })
    }
    if (res !== 'cancelled') recordShare()
  })

const copy = () =>
  run('copy', async () => {
    if (await copyText(link.value)) {
      toast({ title: 'Challenge link copied', body: 'Paste it in any chat.', tone: 'success', duration: 2500 })
      recordInvite()
    }
  })

const challenge = () =>
  run('challenge', async () => {
    const file = await image('post').catch(() => null)
    const res = await shareNative({ title: `${owner.value} · SportyStreet`, text: text.value, url: link.value, file })
    if (res === 'unsupported') {
      await copyText(`${text.value} ${link.value}`)
      toast({ title: 'Challenge copied', body: 'Your browser has no share sheet — paste it to a friend.', tone: 'success' })
    }
    if (res !== 'cancelled') {
      recordShare()
      recordInvite()
    }
  })
</script>

<template>
  <div class="screen on-dark">
    <header class="head">
      <div class="top">
        <span />
        <button class="icon-btn" aria-label="Close" @click="backOr(router, '/')"><Icon name="close" :stroke="2.2" /></button>
      </div>
    </header>
    <main class="ct" style="align-items: center; gap: 16px">
      <div class="done pop-in"><Icon name="check" :size="34" :stroke="3" /></div>
      <div class="col g4 items-center tc rise">
        <span class="disp" style="font-size: 38px">Squad locked in</span>
        <span v-if="notify.permission === 'granted'" class="sm soft-w">Kick-off {{ clock(firstKickoff) }} · we'll ping you when it matters</span>
        <button v-else class="sm" style="color: #FF8A93" @click="alertsOpen = true">Kick-off {{ clock(firstKickoff) }} · <u>turn on alerts</u> for sub moments</button>
      </div>
      <SquadShareCard v-if="team" class="rise" style="animation-delay: .1s" :round-name="round?.name ?? ''" :title="owner" :players="cardPlayers" :link="shortLink" />
      <span class="xs soft-w tc" style="max-width: 300px">Friends who open your link land on this round with your five to beat — and you'll see them in your live standings.</span>
      <button v-if="friends.available !== false && round?.status === 'OPEN'" class="btn md ghost on-dark-b" style="width: auto; padding: 0 18px" @click="inviteOpen = true"><Icon name="userPlus" :size="18" />Invite friends to this round</button>
    </main>
    <footer class="foot">
      <div class="row g6">
        <button class="btn md f1 wa" :disabled="!team" @click="whatsapp"><Icon name="whatsapp" :size="18" />WhatsApp</button>
        <button class="btn md f1 ghost on-dark-b" :disabled="!team || busy === 'story'" @click="story"><span v-if="busy === 'story'" class="spin" /><Icon v-else name="image" :size="18" />Story</button>
        <button class="btn md f1 ghost on-dark-b" :disabled="!team" @click="copy"><Icon name="link" :size="18" />Copy link</button>
      </div>
      <button class="btn wht" :disabled="!team || busy === 'challenge'" @click="challenge"><span v-if="busy === 'challenge'" class="spin" />Challenge a friend</button>
    </footer>
    <AlertsSheet :open="alertsOpen" @close="alertsOpen = false" />
    <InviteFriendsSheet :open="inviteOpen" :round="round" @close="inviteOpen = false" />
  </div>
</template>

<style scoped>
.done { width: 64px; height: 64px; border-radius: 50%; background: var(--green); display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 0 0 10px rgba(18, 161, 80, .15); }
</style>
