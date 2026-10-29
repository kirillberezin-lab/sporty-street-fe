<script setup>
// My vouchers + RP activity (GET /me/purchases, GET /rewards/history).
import { onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import { humanize, num, shortDate } from '../lib/format.js'
import { giftLook, loadGifts, loadHistory, loadPurchases, rewards } from '../stores/rewards.js'
import { rounds } from '../stores/rounds.js'

onMounted(() => {
  loadPurchases().catch(() => {})
  loadHistory().catch(() => {})
  if (!rewards.loaded.gifts) loadGifts().catch(() => {})
})

const giftOf = (p) => rewards.gifts.find((g) => g.id === p.giftId) ?? { name: p.giftName }
const REASONS = { PARTICIPATION: 'Round finished', WINNER: 'Round winner bonus', PURCHASE: 'Gift redeemed' }
</script>

<template>
  <div class="screen">
    <TopBar back="/rewards" title="My vouchers" />
    <main class="ct">
      <span class="xs b m up">Vouchers</span>
      <div v-if="!rewards.purchases.length" class="empty"><div class="ico"><Icon name="gift" /></div><b style="color: var(--ink)">No vouchers yet</b><span class="sm">Redeem reward points for gifts.</span></div>
      <RouterLink v-for="p in rewards.purchases" :key="p.id" :to="`/rewards/vouchers/${p.id}`" class="card row">
        <div class="ibox" :style="{ background: giftLook(giftOf(p)).bg, color: giftLook(giftOf(p)).fg }"><span class="disp" style="font-size: 14px">{{ giftLook(giftOf(p)).headline }}</span></div>
        <div class="col g2 f1"><b class="sm">{{ p.giftName }}</b><span class="xs m">{{ p.voucherCode }} · {{ shortDate(p.createdAt) }}</span></div>
        <Icon name="chevron" :size="18" class="m" />
      </RouterLink>
      <span class="xs b m up" style="margin-top: 6px">RP activity</span>
      <div class="card flat">
        <div v-if="!rewards.history.length" class="li"><span class="sm m">No activity yet.</span></div>
        <div v-for="h in rewards.history" :key="h.id" class="li">
          <div class="col g2 f1">
            <b class="sm">{{ REASONS[h.reason] ?? humanize(h.reason) }}</b>
            <span class="xs m">{{ h.roundId ? rounds.byId[h.roundId]?.name ?? 'Round' : 'Rewards' }} · {{ shortDate(h.createdAt) }}</span>
          </div>
          <b :class="h.delta > 0 ? 'grn' : ''">{{ h.delta > 0 ? '+' : '' }}{{ num(h.delta) }}</b>
        </div>
      </div>
    </main>
  </div>
</template>
