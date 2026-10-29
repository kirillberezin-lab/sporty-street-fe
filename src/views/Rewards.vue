<script setup>
// Rewards catalogue (design 8.1): real RP wallet, gifts and purchases from the backend.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import TabBar from '../components/TabBar.vue'
import { humanize, num } from '../lib/format.js'
import { claimable } from '../stores/missions.js'
import { buy, giftLook, loadGifts, loadHistory, loadPurchases, loadWallet, rewards } from '../stores/rewards.js'
import { toastError } from '../stores/ui.js'

const router = useRouter()
const category = ref('ALL')
const confirmGift = ref(null)
const buying = ref(false)
const error = ref(null)

onMounted(async () => {
  try {
    await Promise.all([loadWallet(), loadGifts(), loadPurchases(), loadHistory()])
  } catch (e) {
    error.value = e
  }
})

const categories = computed(() => ['ALL', ...new Set(rewards.gifts.map((g) => g.category).filter(Boolean))])
const gifts = computed(() => rewards.gifts.filter((g) => category.value === 'ALL' || g.category === category.value))
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
const earnedThisMonth = computed(() => rewards.history.filter((h) => h.delta > 0 && Date.parse(h.createdAt) >= monthStart).reduce((s, h) => s + h.delta, 0))
const spentThisMonth = computed(() => Math.abs(rewards.history.filter((h) => h.delta < 0 && Date.parse(h.createdAt) >= monthStart).reduce((s, h) => s + h.delta, 0)))
const toClaim = computed(() => claimable())

async function redeem() {
  buying.value = true
  try {
    const purchase = await buy(confirmGift.value)
    confirmGift.value = null
    router.push(`/rewards/vouchers/${purchase.id}`)
  } catch (e) {
    toastError(e, 'Could not redeem')
  } finally {
    buying.value = false
  }
}
</script>

<template>
  <div class="screen">
    <header class="head on-red" style="padding-bottom: 16px">
      <div class="top">
        <span class="h1">Rewards</span>
        <RouterLink to="/rewards/vouchers" class="pill w lg">My vouchers · {{ rewards.purchases.length }}</RouterLink>
      </div>
      <div class="col g6" style="padding: 0 16px">
        <span class="xs b" style="opacity: .85">Reward points</span>
        <span class="disp" style="font-size: 52px">{{ rewards.balance == null ? '—' : num(rewards.balance) }} RP</span>
        <span class="xs b" style="opacity: .9">This month: +{{ num(earnedThisMonth) }} earned · {{ num(spentThisMonth) }} spent</span>
      </div>
    </header>
    <main class="ct">
      <RouterLink to="/rewards/missions" class="card row">
        <div class="ibox" style="background: var(--green-50); color: var(--green)"><Icon name="check" :size="22" /></div>
        <div class="col g2 f1">
          <b class="sm">{{ toClaim.length ? `${toClaim.length} mission${toClaim.length > 1 ? 's' : ''} to claim` : 'Missions & streak' }}</b>
          <span class="xs m">{{ toClaim.length ? `+${toClaim.reduce((s, m) => s + m.reward, 0)} RP waiting` : 'Play, sub, share and back to earn more' }}</span>
        </div>
        <span class="btn sm">{{ toClaim.length ? 'Claim' : 'Open' }}</span>
      </RouterLink>
      <div class="chips">
        <button v-for="c in categories" :key="c" class="chip" :class="{ on: category === c }" @click="category = c">{{ c === 'ALL' ? 'All' : humanize(c) }}</button>
      </div>

      <div v-if="error" class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">Rewards unavailable</b><span class="sm">{{ error.message }}</span></div>
      <div v-else-if="!rewards.loaded.gifts" class="grid"><div v-for="i in 4" :key="i" class="skel" style="height: 160px" /></div>
      <div v-else class="grid stagger">
        <div v-for="g in gifts" :key="g.id" class="card col g6 gift">
          <div class="gift-top" :style="{ background: giftLook(g).bg, color: giftLook(g).fg }">
            <span class="disp" style="font-size: 30px">{{ giftLook(g).headline }}</span>
            <span class="xs b ellipsis">{{ g.name }}</span>
          </div>
          <div class="col g6" style="padding: 0 12px 12px">
            <span class="xs m clamp2" :title="g.description">{{ g.description || giftLook(g).label }}</span>
            <button v-if="rewards.balance == null || rewards.balance >= g.priceRp" class="btn xs sec block" style="height: 32px" @click="confirmGift = g">{{ num(g.priceRp) }} RP</button>
            <button v-else class="btn xs dis block" style="height: 32px" disabled>Need {{ num(g.priceRp - rewards.balance) }} more</button>
          </div>
        </div>
      </div>
      <span class="xs m tc">Gift codes are demo entitlements, not real partner vouchers.</span>
    </main>
    <TabBar />

    <BottomSheet :open="!!confirmGift" @close="confirmGift = null">
      <template v-if="confirmGift">
        <div class="gift-top" style="border-radius: 18px" :style="{ background: giftLook(confirmGift).bg, color: giftLook(confirmGift).fg }">
          <span class="disp" style="font-size: 40px">{{ giftLook(confirmGift).headline }}</span>
          <span class="sm b">{{ confirmGift.name }}</span>
        </div>
        <div class="col g4"><span class="h2">Redeem for {{ num(confirmGift.priceRp) }} RP?</span><span class="t">{{ confirmGift.description }}</span></div>
        <div class="card flat">
          <div class="li sm"><span class="f1 m">Balance now</span><b>{{ num(rewards.balance) }} RP</b></div>
          <div class="li sm"><span class="f1 m">After redeeming</span><b>{{ num(rewards.balance - confirmGift.priceRp) }} RP</b></div>
        </div>
        <button class="btn" :disabled="buying" @click="redeem"><span v-if="buying" class="spin" />Redeem · {{ num(confirmGift.priceRp) }} RP</button>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.gift { padding: 0; overflow: hidden; }
.gift-top { height: 86px; padding: 12px; display: flex; flex-direction: column; gap: 2px; justify-content: flex-end; }
.clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.6em; line-height: 1.3; }
</style>
