<script setup>
// Voucher redeemed (design 8.3), from the purchase returned by the backend.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import { longDate, num } from '../lib/format.js'
import { copyText } from '../lib/share.js'
import { backOr } from '../lib/nav.js'
import { giftLook, loadGifts, loadPurchases, rewards } from '../stores/rewards.js'
import { toast } from '../stores/ui.js'

const route = useRoute()
const router = useRouter()

// "Not found" only after a fresh look at the purchases, never from a stale list.
const checked = ref(false)
onMounted(async () => {
  if (!rewards.loaded.gifts) loadGifts().catch(() => {})
  if (!purchase.value) await loadPurchases().catch(() => {})
  checked.value = true
})

const purchase = computed(() => rewards.purchases.find((p) => p.id === route.params.id))
const gift = computed(() => rewards.gifts.find((g) => g.id === purchase.value?.giftId) ?? { name: purchase.value?.giftName, category: '' })
const look = computed(() => giftLook(gift.value))

async function copy() {
  if (await copyText(purchase.value.voucherCode)) toast({ title: 'Code copied', body: purchase.value.voucherCode, tone: 'success', duration: 2000 })
}
</script>

<template>
  <div class="screen white">
    <header class="head" style="background: #fff">
      <div class="top">
        <button class="icon-btn" aria-label="Close" @click="backOr(router, '/rewards')"><Icon name="close" :stroke="2.2" /></button>
        <span class="navt">{{ purchase || !checked ? 'Voucher redeemed' : 'Voucher' }}</span>
        <span style="width: 24px" />
      </div>
    </header>
    <main v-if="purchase" class="ct" style="gap: 16px">
      <div class="ticket pop-in">
        <div class="col g6" style="padding: 22px" :style="{ background: look.bg, color: look.fg }">
          <div class="row between"><span class="pill w">{{ look.label.toUpperCase() }}</span><span class="xs b">Demo partner</span></div>
          <span class="disp" style="font-size: 64px">{{ look.headline }}</span>
          <span class="sm" style="opacity: .85">{{ purchase.giftName }}</span>
        </div>
        <div class="tear" />
        <div class="col g12" style="background: #fff; padding: 20px; border: 1px solid var(--line); border-top: none; border-radius: 0 0 22px 22px">
          <span class="xs b m up tc">Your code</span>
          <span class="code tc">{{ purchase.voucherCode }}</span>
          <button class="btn md ghost" @click="copy"><Icon name="copy" :size="18" />Copy code</button>
          <div class="row between xs"><span class="m">Redeemed</span><b>{{ longDate(purchase.createdAt) }}</b></div>
          <div class="row between xs"><span class="m">Paid</span><b>{{ num(purchase.priceRp) }} RP</b></div>
          <div class="row between xs"><span class="m">Balance now</span><b>{{ num(rewards.balance) }} RP</b></div>
        </div>
      </div>
      <div class="card col g6">
        <b class="sm">How to use</b>
        <span class="xs m" style="line-height: 1.6">1. Show the code at the counter or enter it in the partner app.<br />2. One use per code, no cash change.<br />3. Saved in Rewards → My vouchers.<br />Redemption is simulated — no merchant is connected and nothing is shipped.</span>
      </div>
    </main>
    <main v-else-if="!checked" class="ct"><div class="skel" style="height: 300px" /></main>
    <main v-else class="ct">
      <div class="empty"><div class="ico"><Icon name="info" /></div><b style="color: var(--ink)">Voucher not found</b><span class="sm">It isn't in your vouchers. Codes live in Rewards → My vouchers.</span></div>
    </main>
    <footer class="foot"><button class="btn" @click="backOr(router, '/rewards')">Back to rewards</button></footer>
  </div>
</template>

<style scoped>
.ticket { border-radius: 22px; overflow: hidden; box-shadow: 0 12px 30px rgba(14, 122, 62, .2); }
.tear { height: 0; border-top: 2px dashed #D5D8DD; }
/* Backend codes are "SST-" + a UUID (~40 chars): monospace, wrapped, still easy to read out. */
.code { font: 700 17px/1.4 ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: .5px; word-break: break-all; background: var(--bg); border-radius: 12px; padding: 10px 12px; user-select: all; }
</style>
