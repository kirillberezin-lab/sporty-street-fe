<script setup>
// Partner reward (Rewards → Your exclusive rewards): Free bet, Cashback, Refer a friend, Lucky Wheel.
// Free bet and referrals are open; cashback and the wheel unlock from league tasks (lib/perks.js).
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import LuckyWheel from '../components/LuckyWheel.vue'
import RewardCard from '../components/RewardCard.vue'
import TopBar from '../components/TopBar.vue'
import { longDate } from '../lib/format.js'
import { money, offerById, REWARD_VALUES } from '../lib/perks.js'
import { copyText, shareNative, whatsappUrl } from '../lib/share.js'
import { appUrl } from '../lib/url.js'
import { demo } from '../stores/demo.js'
import { community } from '../stores/community.js'
import { activePrizes, claim, earnedRewards, loadPerformance, partners, recordInvite, spin, spinsLeft, taskStatus, toClaim, usePartners } from '../stores/perks.js'
import { loadRounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'
import { toast } from '../stores/ui.js'

const route = useRoute()
const offer = offerById(String(route.params.id))
usePartners()
const loading = ref(true)
onMounted(async () => {
  await loadRounds().catch(() => null)
  await loadPerformance()
  loading.value = false
})

const wheel = ref(null)
const won = ref(null)
const justClaimed = ref(null)
const onBreak = computed(() => demo.breakUntil && Date.parse(demo.breakUntil) > Date.now())
const blocked = computed(() => offer?.betting && onBreak.value)
const rewards = computed(() => earnedRewards().filter((r) => r.offerId === offer?.id))
const waiting = computed(() => rewards.value.filter((r) => !partners.claimed[r.id]))
const spins = computed(() => spinsLeft())
const status = computed(() => taskStatus(offer))
const locked = computed(() => !status.value.done)
const ready = computed(() => (offer && !locked.value ? toClaim(offer.id) : 0))
const prizes = computed(() => activePrizes().filter((p) => (offer?.id === 'lucky-wheel' ? p.source === 'Lucky Wheel' : rewards.value.some((r) => partners.claimed[r.id] === p.id))))
const inviteLink = computed(() => appUrl(`/?ref=${encodeURIComponent(session.username)}`))
const inviteText = computed(() => `Join me on SportyStreet — pick five world stars and play live. Sign up with my link and we both get rewards ⚽ ${inviteLink.value}`)

async function invite(via) {
  if (via === 'whatsapp') window.open(whatsappUrl(inviteText.value), '_blank', 'noopener')
  else if (via === 'copy') await copyText(inviteText.value)
  else {
    const res = await shareNative({ title: 'SportyStreet', text: inviteText.value, url: inviteLink.value })
    if (res === 'cancelled') return
    if (res === 'unsupported') await copyText(inviteText.value)
  }
  const counted = recordInvite()
  toast({ title: counted ? `Invite sent · ${money(REWARD_VALUES.referral)} free bet unlocked` : 'Invite sent', body: counted ? 'Demo: unlocked now — in production once your friend plays a round.' : 'Monthly referral limit reached.', tone: 'success' })
}

function doClaim(r) {
  justClaimed.value = claim(r)
}

let drawn = null
function onSpin() {
  try {
    drawn = spin()
    won.value = null
    wheel.value.spinTo(drawn.index)
  } catch (e) {
    toast({ title: 'No spins left', body: e.message })
  }
}
const onDone = () => (won.value = drawn)

function openPartner() {
  if (offer.url) window.open(offer.url, '_blank', 'noopener')
  else toast({ title: 'Partner link coming soon', body: 'The sportsbook is not connected in this demo.' })
}
</script>

<template>
  <div class="screen">
    <TopBar back="/rewards" :title="offer?.title ?? 'Reward'" />
    <main v-if="offer" class="ct">
      <RewardCard :offer="offer" :locked="locked" :progress="status" :ready="ready" />
      <span class="t">{{ offer.summary }}</span>

      <div v-if="blocked" class="note" style="background: var(--gold-50); color: #6B4E00">
        <Icon name="info" :size="16" /><span>You're on a break until {{ longDate(demo.breakUntil) }}, so betting rewards are paused.</span>
      </div>

      <!-- Locked: the league task and how far along you are -->
      <div v-else-if="locked" class="card col g12">
        <div class="row g12">
          <div class="ibox" style="background: var(--gold-50); color: var(--gold-d)"><Icon name="trophy" :size="22" /></div>
          <div class="col g2 f1"><span class="xs b m up">Task to unlock</span><b>{{ offer.task.label }}</b></div>
        </div>
        <div class="col g6">
          <div class="row between"><span class="sm">{{ status.line }}</span><b v-if="status.target" class="sm">{{ offer.task.type === 'rank' ? `#${status.current} → #${status.target}` : `${status.current}/${status.target}` }}</b></div>
          <div class="prog y"><i :style="{ width: `${status.pct ?? 0}%` }" /></div>
        </div>
        <span class="xs m">Your finished SportyStreet rounds count in {{ community.progress?.name ?? 'the league' }}: their points add to your league score, and a round you win is a league win.</span>
        <div class="row g6">
          <RouterLink v-if="community.progress?.leagueId" :to="`/leagues/${community.progress.leagueId}`" class="btn sec f1 md">Open league</RouterLink>
          <RouterLink to="/play" class="btn f1 md">Play a round</RouterLink>
        </div>
      </div>

      <!-- Lucky Wheel -->
      <template v-else-if="offer.id === 'lucky-wheel'">
        <div class="card dark col g8 items-center" style="padding: 18px 12px 16px">
          <span class="pill w lg">{{ spins }} spin{{ spins === 1 ? '' : 's' }} left</span>
          <LuckyWheel ref="wheel" :disabled="spins < 1" @spin="onSpin" @done="onDone" />
          <span class="xs soft-w tc">{{ spins ? 'Tap SPIN' : 'All spins used — prizes are below' }}</span>
        </div>
      </template>

      <!-- Refer a friend -->
      <template v-else-if="offer.id === 'refer'">
        <div class="card row">
          <div class="col g2 f1"><span class="xs m">Friends invited</span><b class="h2">{{ partners.invited }}</b></div>
          <div class="col g2 f1"><span class="xs m">Free bets earned</span><b class="h2">{{ money(Math.min(partners.invited, REWARD_VALUES.maxReferrals) * REWARD_VALUES.referral) }}</b></div>
        </div>
        <button class="btn" @click="invite('share')"><Icon name="share" :size="18" />Invite a friend</button>
        <div class="row g6">
          <button class="btn sec f1" @click="invite('whatsapp')"><Icon name="whatsapp" :size="18" />WhatsApp</button>
          <button class="btn ghost f1" @click="invite('copy')"><Icon name="copy" :size="18" />Copy link</button>
        </div>
      </template>

      <!-- Ready to claim (free bet, cashback, referral) -->
      <template v-if="!blocked && !locked && offer.id !== 'lucky-wheel'">
        <template v-if="waiting.length">
          <span class="xs b m up">Unlocked · tap to claim</span>
          <div class="card flat">
            <div v-for="r in waiting" :key="r.id" class="li">
              <span style="font-size: 22px">{{ offer.emoji }}</span>
              <div class="col g2 f1"><b class="sm">{{ r.label }}</b><span class="xs m">{{ r.why }}</span></div>
              <button class="btn xs" @click="doClaim(r)">Claim</button>
            </div>
          </div>
        </template>
        <div v-else-if="!loading && offer.id !== 'refer'" class="card row">
          <Icon name="check" :size="20" class="grn" />
          <span class="col g2 f1"><b class="sm">Claimed</b><span class="xs m">Your code is below.</span></span>
        </div>
      </template>

      <template v-if="prizes.length">
        <span class="xs b m up">My {{ offer.title.toLowerCase() }} codes</span>
        <div class="card flat">
          <div v-for="x in prizes" :key="x.id" class="li">
            <span style="font-size: 22px">{{ x.kind === 'cashback' ? '💸' : '🎟️' }}</span>
            <div class="col g2 f1"><b class="sm">{{ x.label }}</b><span class="xs m">{{ x.code }} · until {{ longDate(x.expiresAt) }}</span></div>
            <button class="icon-btn" aria-label="Copy code" @click="copyText(x.code).then(() => toast({ title: 'Code copied', duration: 1500 }))"><Icon name="copy" :size="18" /></button>
          </div>
        </div>
        <button v-if="offer.betting" class="btn sec" @click="openPartner"><Icon name="external" :size="16" />Use on SportyBet</button>
      </template>

      <span class="xs m tc">{{ offer.terms }}{{ offer.betting ? ' 18+ · Gamble responsibly · T&Cs apply.' : '' }} Demo entitlements — partner accounts are not connected yet.</span>
    </main>
    <main v-else class="ct"><div class="empty"><b style="color: var(--ink)">Reward not found</b><RouterLink to="/rewards" class="btn sm">Back to Rewards</RouterLink></div></main>

    <BottomSheet :open="!!won" @close="won = null">
      <template v-if="won">
        <div class="col g6 items-center tc" style="padding: 8px 0">
          <span style="font-size: 56px">{{ won.segment.kind === 'none' ? '😅' : won.segment.kind === 'spin' ? '🎡' : '🎉' }}</span>
          <span class="h2">{{ won.segment.kind === 'none' ? 'So close!' : won.segment.kind === 'spin' ? 'Extra spin!' : `You won ${won.prize.label}` }}</span>
          <span class="t">{{ won.segment.kind === 'none' ? 'Play another round for your next spin.' : won.segment.kind === 'spin' ? 'Spin again right away.' : `Code ${won.prize.code} · valid 7 days` }}</span>
        </div>
        <button class="btn" @click="won = null">{{ won.segment.kind === 'spin' ? 'Spin again' : 'Nice' }}</button>
      </template>
    </BottomSheet>
    <BottomSheet :open="!!justClaimed" @close="justClaimed = null">
      <template v-if="justClaimed">
        <div class="col g6 items-center tc" style="padding: 8px 0">
          <span style="font-size: 56px">🎉</span>
          <span class="h2">{{ justClaimed.label }} claimed</span>
          <span class="disp" style="font-size: 32px; letter-spacing: .04em">{{ justClaimed.code }}</span>
          <span class="t">Valid until {{ longDate(justClaimed.expiresAt) }}</span>
        </div>
        <button class="btn" @click="openPartner(); justClaimed = null"><Icon name="external" :size="16" />Use on SportyBet</button>
        <button class="btn ghost" @click="copyText(justClaimed.code); toast({ title: 'Code copied', duration: 1500 }); justClaimed = null">Copy code</button>
      </template>
    </BottomSheet>
  </div>
</template>
