// The local side of SportyBet Rewards: the Lucky Wheel spin a claimed wheel voucher gives, shared
// invites, and claim codes when the server has no catalogue yet (older backend). Partner platforms
// are not connected, so prizes are demo entitlements kept per user on this device.
import { reactive } from 'vue'
import { WHEEL, money } from '../lib/perks.js'
import { store, uuid } from '../lib/util.js'
import { session } from './session.js'

const DAY = 86400_000

function seed() {
  return { user: null, invited: 0, spun: {}, prizes: [], localClaims: {} }
}
export const partners = reactive(seed())

const key = (user) => `perks:v3:${user}`
const save = () => store.set(key(partners.user), { ...partners })
const code = (prefix) => `${prefix}-${uuid().replace(/-/g, '').slice(0, 6).toUpperCase()}`

export function usePartners() {
  if (partners.user !== session.username) Object.assign(partners, seed(), store.get(key(session.username), {}), { user: session.username })
  return partners
}

export function recordInvite() {
  usePartners()
  partners.invited += 1
  save()
}

/** Older backend: a SportyBet reward claimed on this device. Returns a purchase-like record. */
export function claimLocally(gift) {
  usePartners()
  partners.localClaims[gift.id] ??= { id: uuid(), giftId: gift.id, giftName: gift.name, priceRp: 0, voucherCode: code('SST'), createdAt: new Date().toISOString(), local: true }
  save()
  return partners.localClaims[gift.id]
}

/** One spin per claimed Lucky Wheel voucher. */
export const spinsLeft = (purchaseId) => (purchaseId && !partners.spun[purchaseId] ? 1 : 0)

/** Picks the prize first, then the wheel animates to it. */
export function spin(purchaseId, random = Math.random) {
  usePartners()
  if (!spinsLeft(purchaseId)) throw new Error('Your Lucky Wheel spin is used.')
  const total = WHEEL.reduce((s, w) => s + w.weight, 0)
  let r = random() * total
  const index = WHEEL.findIndex((w) => (r -= w.weight) < 0)
  const segment = WHEEL[index]
  // "+1 spin" keeps the voucher's spin available.
  if (segment.kind !== 'spin') partners.spun[purchaseId] = new Date().toISOString()
  let prize = null
  if (segment.kind !== 'none' && segment.kind !== 'spin') {
    prize = { id: uuid(), kind: segment.kind, value: segment.value, label: `${money(segment.value)} ${segment.kind === 'cashback' ? 'cashback' : 'free bet'}`, code: code(segment.kind === 'cashback' ? 'CB' : 'FB'), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * DAY).toISOString() }
    partners.prizes.unshift(prize)
  }
  save()
  return { index, segment, prize }
}

export const activePrizes = () => partners.prizes.filter((p) => Date.parse(p.expiresAt) > Date.now())
