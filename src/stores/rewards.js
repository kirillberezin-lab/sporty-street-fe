// RP wallet, gifts and the personalised reward catalogue (GET /rewards/catalogue): Sporty Merch for RP
// and SportyBet Rewards unlocked by lifetime leaderboard points. Older backends without the catalogue
// get the same shape from the bundled port (mock/rewards.js) with points from my settled rounds.
import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ApiError } from '../api/client.js'
import { buildCatalogue, REWARD_GIFTS } from '../mock/rewards.js'
import { isSettled } from '../lib/liveDiff.js'
import { claimLocally, usePartners } from './perks.js'
import { loadResult, loadRounds, rounds } from './rounds.js'

export const rewards = reactive({
  balance: null,
  gifts: [],
  purchases: [],
  history: [],
  catalogue: null, // { wallet, leaderboard, categories, items }
  catalogueMode: null, // api | bundled
  loaded: { wallet: false, gifts: false, purchases: false, history: false },
})

async function bundledCatalogue() {
  await loadRounds().catch(() => null)
  const mine = rounds.list.filter((r) => isSettled(r.status) && rounds.teams[r.id])
  await Promise.all(mine.map((r) => loadResult(r.id).catch(() => null)))
  const points = mine.reduce((s, r) => s + (rounds.results[r.id]?.finalScore ?? 0), 0)
  const [wallet, gifts] = await Promise.all([api.wallet(), api.gifts()])
  const local = usePartners().localClaims
  // Old catalogue items stay purchasable as merch; SportyBet rewards come from the bundled seed.
  const merch = (gifts.items ?? []).filter((g) => !['Matchday Coffee', 'Club Scarf'].includes(g.name)).map((g) => ({ ...g, category: 'SPORTY_MERCH', requiredPoints: 0, onePerUser: false }))
  return buildCatalogue({
    balanceRp: wallet.balanceRp ?? 0,
    ranking: { points, rank: null, roundsPlayed: mine.length },
    gifts: [...merch, ...REWARD_GIFTS.filter((g) => g.category === 'SPORTYBET_REWARDS')],
    claimedGiftIds: Object.keys(local),
  })
}

export async function loadCatalogue() {
  try {
    rewards.catalogue = await api.catalogue()
    rewards.catalogueMode = 'api'
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e
    rewards.catalogue = await bundledCatalogue()
    rewards.catalogueMode = 'bundled'
  }
  rewards.balance = rewards.catalogue.wallet?.balanceRp ?? rewards.balance
  rewards.loaded.wallet = true
  return rewards.catalogue
}

/** Buys merch or claims a free SportyBet reward; both are purchases on the server. */
export async function claimItem(item) {
  if (rewards.catalogueMode === 'bundled' && item.gift.priceRp === 0) {
    const purchase = claimLocally(item.gift)
    await loadCatalogue()
    return purchase
  }
  const purchase = await buy(item.gift)
  await loadCatalogue().catch(() => {})
  return purchase
}

export const perkItems = () => (rewards.catalogue?.items ?? []).filter((i) => i.gift.category === 'SPORTYBET_REWARDS').sort((a, b) => (a.gift.requiredPoints ?? 0) - (b.gift.requiredPoints ?? 0))
export const merchItems = () => (rewards.catalogue?.items ?? []).filter((i) => i.gift.category === 'SPORTY_MERCH').sort((a, b) => a.gift.priceRp - b.gift.priceRp)
export const claimableRewards = () => perkItems().filter((i) => i.canClaim).length
/** The purchase behind a claimed reward (for its code / the wheel spin). */
export const purchaseOf = (giftId) => rewards.purchases.find((p) => p.giftId === giftId) ?? usePartners().localClaims[giftId] ?? null

export async function loadWallet() {
  const w = await api.wallet()
  rewards.balance = w.balanceRp ?? 0
  rewards.loaded.wallet = true
  return rewards.balance
}

export async function loadGifts() {
  const page = await api.gifts()
  rewards.gifts = [...(page.items ?? [])].sort((a, b) => a.priceRp - b.priceRp)
  rewards.loaded.gifts = true
}

export async function loadPurchases() {
  const page = await api.purchases()
  rewards.purchases = page.items ?? []
  rewards.loaded.purchases = true
}

export async function loadHistory() {
  const page = await api.history()
  rewards.history = page.items ?? []
  rewards.loaded.history = true
}

export async function buy(gift) {
  const out = await api.purchase(gift.id)
  rewards.balance = out.balanceRp
  if (!rewards.purchases.some((p) => p.id === out.purchase.id)) rewards.purchases.unshift(out.purchase)
  loadHistory().catch(() => {})
  return out.purchase
}

export function resetRewards() {
  Object.assign(rewards, { balance: null, gifts: [], purchases: [], history: [], catalogue: null, catalogueMode: null, loaded: { wallet: false, gifts: false, purchases: false, history: false } })
}

/** Visual identity for gift cards (design 8.1), keyed by the backend category (FOOD / SHOPPING / MERCH). */
const LOOK = {
  FOOD: { bg: 'linear-gradient(135deg,#7C4A1E,#3B2210)', fg: '#fff', label: 'Food & drink', icon: '☕' },
  SHOPPING: { bg: 'linear-gradient(135deg,#2563EB,#1E3A8A)', fg: '#fff', label: 'Shopping', icon: '🛍️' },
  MERCH: { bg: 'linear-gradient(135deg,#E41827,#7A0710)', fg: '#fff', label: 'Merch', icon: '🧣' },
  AIRTIME: { bg: 'linear-gradient(135deg,#F5B400,#D97706)', fg: '#14171C', label: 'Airtime', icon: '📶' },
  DATA: { bg: 'linear-gradient(135deg,#0E7A3E,#064E25)', fg: '#fff', label: 'Data', icon: '📱' },
}
export function giftLook(gift) {
  const key = String(gift?.category ?? '').toUpperCase()
  const look = LOOK[key] ?? { bg: 'linear-gradient(135deg,#3A3F47,#14171C)', fg: '#fff', label: gift?.category ?? 'Gift', icon: '🎁' }
  // Prefer a number from the offer ("15% off", "₦500", "1 GB"), otherwise the category icon.
  const text = `${gift?.name ?? ''} ${gift?.description ?? ''}`
  const pct = text.match(/(\d+)\s?%/)?.[1]
  const headline = pct ? `−${pct}%` : text.match(/₦\s?[\d,]+/)?.[0] ?? text.match(/\d+(\.\d+)?\s?GB/i)?.[0] ?? look.icon
  return { ...look, headline }
}
