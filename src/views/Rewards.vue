<script setup>
// Rewards (design 8.1) from GET /rewards/catalogue — two categories:
//  · SportyBet Rewards: free, claimable once, unlocked by lifetime leaderboard points;
//  · Sporty Merch: bought with RP earned from rounds.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomSheet from '../components/BottomSheet.vue'
import Icon from '../components/Icon.vue'
import RewardCard from '../components/RewardCard.vue'
import TabBar from '../components/TabBar.vue'
import { num } from '../lib/format.js'
import { claimable } from '../stores/missions.js'
import { claimItem, loadCatalogue, loadHistory, loadPurchases, merchItems, perkItems, rewards } from '../stores/rewards.js'
import { toastError } from '../stores/ui.js'

const router = useRouter()
const confirmItem = ref(null)
const buying = ref(false)
const error = ref(null)
const slide = ref(0)

onMounted(async () => {
  try {
    await Promise.all([loadCatalogue(), loadPurchases(), loadHistory()])
  } catch (e) {
    error.value = e
  }
})

const perks = computed(() => perkItems())
const merch = computed(() => merchItems())
const board = computed(() => rewards.catalogue?.leaderboard ?? null)
const points = computed(() => board.value?.points ?? 0)
const ready = computed(() => perks.value.filter((i) => i.canClaim).length)
const nextLock = computed(() => perks.value.find((i) => !i.unlocked))
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
const earnedThisMonth = computed(() => rewards.history.filter((h) => h.delta > 0 && Date.parse(h.createdAt) >= monthStart).reduce((s, h) => s + h.delta, 0))
const missions = computed(() => claimable())
const onScroll = (e) => (slide.value = Math.round(e.target.scrollLeft / e.target.clientWidth))

async function redeem() {
  buying.value = true
  try {
    const purchase = await claimItem(confirmItem.value)
    confirmItem.value = null
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
      <div class="row g12" style="padding: 0 16px; align-items: flex-end">
        <div class="col g4 f1">
          <span class="xs b" style="opacity: .85">Reward points</span>
          <span class="disp" style="font-size: 46px">{{ rewards.balance == null ? '—' : num(rewards.balance) }} RP</span>
          <span class="xs b" style="opacity: .9">This month: +{{ num(earnedThisMonth) }} earned</span>
        </div>
        <RouterLink to="/leaderboard" class="lb">
          <span class="xs b" style="opacity: .85">Leaderboard pts</span>
          <b class="disp" style="font-size: 26px">{{ board ? num(points) : '—' }}</b>
          <span class="xs b">{{ board?.rank ? `#${board.rank} overall →` : 'Overall →' }}</span>
        </RouterLink>
      </div>
    </header>
    <main class="ct">
      <RouterLink v-if="missions.length" to="/rewards/missions" class="card row">
        <div class="ibox" style="background: var(--green-50); color: var(--green)"><Icon name="check" :size="22" /></div>
        <div class="col g2 f1"><b class="sm">{{ missions.length }} mission{{ missions.length > 1 ? 's' : '' }} to claim</b><span class="xs m">+{{ missions.reduce((s, m) => s + m.reward, 0) }} RP waiting</span></div>
        <span class="btn sm">Claim</span>
      </RouterLink>

      <div v-if="error" class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">Rewards unavailable</b><span class="sm">{{ error.message }}</span></div>
      <template v-else-if="!rewards.catalogue">
        <div class="skel" style="height: 200px" /><div class="grid"><div v-for="i in 2" :key="i" class="skel" style="height: 180px" /></div>
      </template>
      <template v-else>
        <div class="col g2" style="margin-bottom: -4px">
          <div class="row between">
            <span class="xs b m up">SportyBet Rewards</span>
            <span class="xs b" :class="ready ? 'grn' : 'm'">{{ ready ? `${ready} ready to claim` : 'Free · earned with points' }}</span>
          </div>
          <span class="xs m">{{ nextLock ? `Earn leaderboard points in rounds — ${num(nextLock.pointsNeeded)} more unlock ${nextLock.gift.name}.` : 'Every SportyBet reward is unlocked.' }} Points are never spent.</span>
        </div>
        <div class="perks" @scroll.passive="onScroll">
          <RouterLink v-for="i in perks" :key="i.gift.id" :to="`/rewards/perks/${i.gift.id}`" class="perk" :aria-label="i.gift.name">
            <RewardCard :item="i" :points="points" />
          </RouterLink>
        </div>
        <div class="dots"><i v-for="(i, n) in perks" :key="i.gift.id" :class="{ on: slide === n }" /></div>

        <div class="col g2" style="margin-bottom: -4px"><span class="xs b m up">Sporty Merch · RP</span><span class="xs m">Spend the RP you earn from rounds: 50 per round, 150 for a win.</span></div>
        <div class="grid stagger">
          <div v-for="i in merch" :key="i.gift.id" class="card col g6 gift">
            <div class="gift-img"><img v-if="i.gift.imageUrl" :src="i.gift.imageUrl" :alt="i.gift.name" loading="lazy" /><span v-else style="font-size: 40px">🛍️</span></div>
            <div class="col g6" style="padding: 0 12px 12px">
              <b class="sm ellipsis">{{ i.gift.name }}</b>
              <span class="xs m clamp2">{{ i.gift.description }}</span>
              <button v-if="i.canClaim" class="btn xs sec block" style="height: 32px" @click="confirmItem = i">{{ num(i.gift.priceRp) }} RP</button>
              <button v-else class="btn xs dis block" style="height: 32px" disabled>{{ i.rpNeeded ? `Need ${num(i.rpNeeded)} more RP` : 'Unavailable' }}</button>
            </div>
          </div>
        </div>
        <div v-if="!merch.length" class="empty"><b style="color: var(--ink)">New merch is on its way</b></div>
      </template>
      <span class="xs m tc">Codes are demo entitlements — no real payout or shipping. 18+ · Gamble responsibly.</span>
    </main>
    <TabBar />

    <BottomSheet :open="!!confirmItem" @close="confirmItem = null">
      <template v-if="confirmItem">
        <div class="gift-img" style="border-radius: 18px; height: 160px"><img v-if="confirmItem.gift.imageUrl" :src="confirmItem.gift.imageUrl" :alt="confirmItem.gift.name" /></div>
        <div class="col g4"><span class="h2">{{ confirmItem.gift.name }} for {{ num(confirmItem.gift.priceRp) }} RP?</span><span class="t">{{ confirmItem.gift.description }}</span></div>
        <div class="card flat">
          <div class="li sm"><span class="f1 m">Balance now</span><b>{{ num(rewards.balance) }} RP</b></div>
          <div class="li sm"><span class="f1 m">After buying</span><b>{{ num(rewards.balance - confirmItem.gift.priceRp) }} RP</b></div>
        </div>
        <button class="btn" :disabled="buying" @click="redeem"><span v-if="buying" class="spin" />Buy · {{ num(confirmItem.gift.priceRp) }} RP</button>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.lb { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; background: rgba(0, 0, 0, .18); border-radius: 14px; padding: 8px 12px; color: #fff; }
.perks { display: grid; grid-auto-flow: column; grid-auto-columns: 100%; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 16px; }
.perks::-webkit-scrollbar { display: none; }
.perk { scroll-snap-align: center; display: block; box-shadow: 0 10px 24px rgba(0, 0, 0, .18); border-radius: 16px; }
.dots { display: flex; justify-content: center; gap: 6px; margin-top: -6px; }
.dots i { width: 6px; height: 6px; border-radius: 99px; background: var(--line); transition: all .3s; }
.dots i.on { width: 18px; background: var(--red); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.gift { padding: 0; overflow: hidden; }
.gift-img { height: 130px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.gift-img img { width: 100%; height: 100%; object-fit: contain; }
.clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.6em; line-height: 1.3; }
</style>
