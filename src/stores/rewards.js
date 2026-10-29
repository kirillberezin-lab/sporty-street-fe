import { reactive } from 'vue'
import { api } from '../api/index.js'

export const rewards = reactive({
  balance: null,
  gifts: [],
  purchases: [],
  history: [],
  loaded: { wallet: false, gifts: false, purchases: false, history: false },
})

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
  Object.assign(rewards, { balance: null, gifts: [], purchases: [], history: [], loaded: { wallet: false, gifts: false, purchases: false, history: false } })
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
