<script setup>
// SportyBet reward (Rewards → SportyBet Rewards): state from the catalogue, claim = a free one-time
// purchase (POST /gifts/{id}/purchases). A claimed Lucky Wheel gives one spin on this device.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import LuckyWheel from '../components/LuckyWheel.vue'
import RewardCard from '../components/RewardCard.vue'
import TopBar from '../components/TopBar.vue'
import { longDate, num } from '../lib/format.js'
import { perkLook } from '../lib/perks.js'
import { copyText, shareNative, whatsappUrl } from '../lib/share.js'
import { appUrl } from '../lib/url.js'
import { demo } from '../stores/demo.js'
import { activePrizes, partners, recordInvite, spin, spinsLeft, usePartners } from '../stores/perks.js'
import { claimItem, loadCatalogue, loadPurchases, purchaseOf, rewards } from '../stores/rewards.js'
import { session } from '../stores/session.js'
import { toast, toastError } from '../stores/ui.js'

const route = useRoute()
const giftId = String(route.params.id)
usePartners()
const error = ref(null)
onMounted(async () => {
  try {
    await Promise.all([rewards.catalogue ? null : loadCatalogue(), loadPurchases()])
  } catch (e) {
    error.value = e
  }
})

const item = computed(() => rewards.catalogue?.items.find((i) => i.gift.id === giftId) ?? null)
const look = computed(() => perkLook(item.value?.gift))
const points = computed(() => rewards.catalogue?.leaderboard?.points ?? 0)
const purchase = computed(() => (item.value?.claimed ? purchaseOf(giftId) : null))
const onBreak = computed(() => demo.breakUntil && Date.parse(demo.breakUntil) > Date.now())
const blocked = computed(() => look.value.betting && onBreak.value)
const claiming = ref(false)
const justClaimed = ref(null)

async function doClaim() {
  claiming.value = true
  try {
    justClaimed.value = await claimItem(item.value)
    await loadPurchases().catch(() => {})
  } catch (e) {
    toastError(e, 'Could not claim')
  } finally {
    claiming.value = false
  }
}

// Lucky Wheel: one spin per claimed voucher.
const wheel = ref(null)
const won = ref(null)
const spins = computed(() => spinsLeft(purchase.value?.id))
const prizes = computed(() => activePrizes())
let drawn = null
function onSpin() {
  try {
    drawn = spin(purchase.value.id)
    won.value = null
    wheel.value.spinTo(drawn.index)
  } catch (e) {
    toast({ title: 'No spins left', body: e.message })
  }
}
const onDone = () => (won.value = drawn)

// Referral: share the invite link (the reward itself is free for every account).
const inviteLink = computed(() => appUrl(`/?ref=${encodeURIComponent(session.username)}`))
const inviteText = computed(() => `Join me on SportyStreet — pick five world stars and play live ⚽ ${inviteLink.value}`)
async function invite(via) {
  if (via === 'whatsapp') window.open(whatsappUrl(inviteText.value), '_blank', 'noopener')
  else if (via === 'copy') await copyText(inviteText.value)
  else {
    const res = await shareNative({ title: 'SportyStreet', text: inviteText.value, url: inviteLink.value })
    if (res === 'cancelled') return
    if (res === 'unsupported') await copyText(inviteText.value)
  }
  recordInvite()
  toast({ title: 'Invite sent', tone: 'success' })
}

function openPartner() {
  if (look.value.url) window.open(look.value.url, '_blank', 'noopener')
  else toast({ title: 'Partner link coming soon', body: 'SportyBet is not connected in this demo.' })
}
const copyCode = (c) => copyText(c).then(() => toast({ title: 'Code copied', duration: 1500 }))
</script>

<template>
  <div class="screen">
    <TopBar back="/rewards" :title="item?.gift.name ?? 'Reward'" />
    <main v-if="item" class="ct">
      <RewardCard :item="item" :points="points" />
      <span class="t">{{ item.gift.description }}</span>

      <div v-if="blocked" class="note" style="background: var(--gold-50); color: #6B4E00">
        <Icon name="info" :size="16" /><span>You're on a break until {{ longDate(demo.breakUntil) }}, so betting rewards are paused.</span>
      </div>

      <!-- Locked: leaderboard points still needed -->
      <div v-else-if="!item.unlocked" class="card col g12">
        <div class="row g12">
          <div class="ibox" style="background: var(--gold-50); color: var(--gold-d)"><Icon name="trophy" :size="22" /></div>
          <div class="col g2 f1"><span class="xs b m up">Unlocks at</span><b>{{ num(item.gift.requiredPoints) }} lifetime leaderboard points</b></div>
        </div>
        <div class="col g6">
          <div class="row between"><span class="sm">You have {{ num(points) }} pts</span><b class="sm">{{ num(item.pointsNeeded) }} to go</b></div>
          <div class="prog y"><i :style="{ width: `${Math.min(100, (points / item.gift.requiredPoints) * 100)}%` }" /></div>
        </div>
        <span class="xs m">Every point you score in a settled round counts. Points are never spent — claiming keeps them.</span>
        <div class="row g6">
          <RouterLink to="/leaderboard" class="btn sec f1 md">Leaderboard</RouterLink>
          <RouterLink to="/play" class="btn f1 md">Play a round</RouterLink>
        </div>
      </div>

      <!-- Ready -->
      <button v-else-if="item.canClaim" class="btn" :disabled="claiming" @click="doClaim"><span v-if="claiming" class="spin" />{{ look.cta }} · free</button>

      <!-- Claimed -->
      <template v-else-if="item.claimed">
        <div v-if="purchase" class="card col g6 tc items-center">
          <span class="xs m">Your code</span>
          <span class="disp" style="font-size: 26px; letter-spacing: .03em; word-break: break-all">{{ purchase.voucherCode }}</span>
          <span class="xs m">Claimed {{ longDate(purchase.createdAt) }}</span>
          <div class="row g6">
            <button class="btn xs ghost" @click="copyCode(purchase.voucherCode)"><Icon name="copy" :size="14" />Copy</button>
            <button v-if="look.betting" class="btn xs" @click="openPartner"><Icon name="external" :size="14" />Use on SportyBet</button>
          </div>
        </div>
        <div v-if="look.wheel && purchase" class="card dark col g8 items-center" style="padding: 18px 12px 16px">
          <span class="pill w lg">{{ spins }} spin{{ spins === 1 ? '' : 's' }} left</span>
          <LuckyWheel ref="wheel" :disabled="spins < 1" @spin="onSpin" @done="onDone" />
          <span class="xs soft-w tc">{{ spins ? 'Tap SPIN' : 'Spin used — your prizes are below' }}</span>
        </div>
      </template>

      <!-- Referral: share the link -->
      <template v-if="look.share && !blocked">
        <span class="xs b m up">Invite friends · {{ partners.invited }} sent</span>
        <div class="row g6">
          <button class="btn sec f1" @click="invite('whatsapp')"><Icon name="whatsapp" :size="18" />WhatsApp</button>
          <button class="btn ghost f1" @click="invite('share')"><Icon name="share" :size="18" />Share link</button>
        </div>
      </template>

      <template v-if="look.wheel && prizes.length">
        <span class="xs b m up">Lucky Wheel prizes</span>
        <div class="card flat">
          <div v-for="x in prizes" :key="x.id" class="li">
            <span style="font-size: 22px">{{ x.kind === 'cashback' ? '💸' : '🎟️' }}</span>
            <div class="col g2 f1"><b class="sm">{{ x.label }}</b><span class="xs m">{{ x.code }} · until {{ longDate(x.expiresAt) }}</span></div>
            <button class="icon-btn" aria-label="Copy code" @click="copyCode(x.code)"><Icon name="copy" :size="18" /></button>
          </div>
        </div>
      </template>
      <span class="xs m tc">Free · one per account{{ look.betting ? ' · 18+ · Gamble responsibly · T&Cs apply' : '' }}. Codes are demo entitlements — SportyBet is not connected yet.</span>
    </main>
    <main v-else-if="error" class="ct"><div class="empty"><b style="color: var(--ink)">Rewards unavailable</b><span class="sm">{{ error.message }}</span></div></main>
    <main v-else-if="rewards.catalogue" class="ct"><div class="empty"><b style="color: var(--ink)">Reward not found</b><RouterLink to="/rewards" class="btn sm">Back to Rewards</RouterLink></div></main>
    <main v-else class="ct"><div class="skel" style="height: 200px" /></main>

    <BottomSheet :open="!!justClaimed" @close="justClaimed = null">
      <template v-if="justClaimed">
        <div class="col g6 items-center tc" style="padding: 8px 0">
          <span style="font-size: 56px">🎉</span>
          <span class="h2">{{ justClaimed.giftName }} claimed</span>
          <span class="disp" style="font-size: 24px; letter-spacing: .03em; word-break: break-all">{{ justClaimed.voucherCode }}</span>
          <span class="t">{{ look.wheel ? 'Your spin is ready below.' : 'Saved in My vouchers.' }}</span>
        </div>
        <button v-if="look.betting" class="btn" @click="openPartner(); justClaimed = null"><Icon name="external" :size="16" />Use on SportyBet</button>
        <button class="btn ghost" @click="justClaimed = null">{{ look.wheel ? 'Spin the wheel' : 'Done' }}</button>
      </template>
    </BottomSheet>
    <BottomSheet :open="!!won" @close="won = null">
      <template v-if="won">
        <div class="col g6 items-center tc" style="padding: 8px 0">
          <span style="font-size: 56px">{{ won.segment.kind === 'none' ? '😅' : won.segment.kind === 'spin' ? '🎡' : '🎉' }}</span>
          <span class="h2">{{ won.segment.kind === 'none' ? 'So close!' : won.segment.kind === 'spin' ? 'Extra spin!' : `You won ${won.prize.label}` }}</span>
          <span class="t">{{ won.segment.kind === 'none' ? 'Better luck next time.' : won.segment.kind === 'spin' ? 'Spin again right away.' : `Code ${won.prize.code} · valid 7 days` }}</span>
        </div>
        <button class="btn" @click="won = null">{{ won.segment.kind === 'spin' ? 'Spin again' : 'Nice' }}</button>
      </template>
    </BottomSheet>
  </div>
</template>
