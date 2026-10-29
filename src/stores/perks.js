// Partner rewards (see lib/perks.js): the free bet gift and referrals are open; cashback and the
// Lucky Wheel unlock from your standing in the task league (stores/community.js loadTaskProgress).
// Partner platforms are not connected yet, so claimed codes are demo entitlements kept per user on
// this device — swap claim()/spin() for partner calls.
import { reactive } from 'vue'
import { PARTNER_OFFERS, REWARD_VALUES, TASK_LEAGUE, WHEEL, money } from '../lib/perks.js'
import { isSettled } from '../lib/liveDiff.js'
import { store, uuid } from '../lib/util.js'
import { community, loadTaskProgress } from './community.js'
import { loadParticipants, loadResult, rounds } from './rounds.js'
import { session } from './session.js'

const DAY = 86400_000

function seed() {
  return { user: null, invited: 0, claimed: {}, spinsUsed: 0, bonusSpins: 0, prizes: [] }
}
export const partners = reactive(seed())

const save = () => store.set(`perks:v2:${partners.user}`, { ...partners })
const code = (prefix) => `${prefix}-${uuid().replace(/-/g, '').slice(0, 6).toUpperCase()}`

export function usePartners() {
  if (partners.user !== session.username) Object.assign(partners, seed(), store.get(`perks:v2:${session.username}`, {}), { user: session.username })
  return partners
}

/** Fetches what the tasks need: my finished rounds (added to the league row) and the league table. */
export async function loadPerformance() {
  const done = rounds.list.filter((r) => isSettled(r.status) && rounds.teams[r.id])
  await Promise.all(done.flatMap((r) => [loadResult(r.id).catch(() => null), loadParticipants(r.id).catch(() => null)]))
  await loadTaskProgress()
}

/** Task status for a locked reward: { done, current, target, pct, line }. */
export function taskStatus(offer) {
  const task = offer?.task
  if (!task) return { done: true }
  const p = community.progress
  if (!p) return { done: false, pct: 0, line: 'Loading your league standing…' }
  if (!p.member) return { done: false, pct: 0, line: `Join ${TASK_LEAGUE.name} to start this task.` }
  if (task.type === 'rank') {
    const done = p.rank <= task.target
    const gap = p.ahead ? p.ahead.score - p.score + 1 : 0
    return { done, current: p.rank, target: task.target, pct: done ? 100 : Math.round(((p.size - p.rank) / Math.max(1, p.size - task.target)) * 100), line: done ? `You're #${p.rank} in ${p.name}` : `You're #${p.rank} · ${gap} pts to pass ${p.ahead?.name ?? 'the leader'}` }
  }
  const done = p.wins >= task.target
  return { done, current: p.wins, target: task.target, pct: Math.min(100, Math.round((p.wins / task.target) * 100)), line: done ? `${p.wins} wins in ${p.name}` : `${p.wins} of ${task.target} wins · ${task.target - p.wins} to go` }
}
export const isUnlocked = (offerId) => taskStatus(PARTNER_OFFERS.find((o) => o.id === offerId)).done

/** Every reward earned so far. */
export function earnedRewards() {
  usePartners()
  const out = [{ id: 'gift:free-bet', offerId: 'free-bet', kind: 'free-bet', value: REWARD_VALUES.freeBetGift, label: `${money(REWARD_VALUES.freeBetGift)} free bet gift`, why: 'Your exclusive reward', at: null }]
  for (let i = 0; i < Math.min(partners.invited, REWARD_VALUES.maxReferrals); i++) {
    out.push({ id: `ref:${i}`, offerId: 'refer', kind: 'free-bet', value: REWARD_VALUES.referral, label: `${money(REWARD_VALUES.referral)} referral free bet`, why: `Friend #${i + 1} joined`, at: null })
  }
  const now = new Date().toISOString()
  if (isUnlocked('cashback')) out.push({ id: 'task:cashback', offerId: 'cashback', kind: 'cashback', value: REWARD_VALUES.cashback, label: `${money(REWARD_VALUES.cashback)} virtual cashback`, why: `#1 in ${TASK_LEAGUE.name}`, at: now })
  if (isUnlocked('lucky-wheel')) {
    for (let i = 0; i < REWARD_VALUES.wheelSpins; i++) out.push({ id: `task:spin:${i}`, offerId: 'lucky-wheel', kind: 'spin', label: 'Lucky Wheel spin', why: `5 wins in ${TASK_LEAGUE.name}`, at: now })
  }
  return out
}

export const spinsLeft = () => earnedRewards().filter((r) => r.kind === 'spin').length + partners.bonusSpins - partners.spinsUsed
/** Unclaimed rewards of one offer (spins count as claimable while any are left). */
export function toClaim(offerId) {
  if (offerId === 'lucky-wheel') return Math.max(0, spinsLeft())
  return earnedRewards().filter((r) => r.offerId === offerId && !partners.claimed[r.id]).length
}
export const claimableTotal = () => ['free-bet', 'cashback', 'refer', 'lucky-wheel'].reduce((s, id) => s + toClaim(id), 0)

function addPrize({ kind, value, label, source }) {
  const prize = { id: uuid(), kind, value, label, source, code: code(kind === 'cashback' ? 'CB' : 'FB'), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * DAY).toISOString() }
  partners.prizes.unshift(prize)
  return prize
}

export function claim(reward) {
  usePartners()
  if (partners.claimed[reward.id]) return partners.prizes.find((p) => p.id === partners.claimed[reward.id])
  const prize = addPrize({ kind: reward.kind, value: reward.value, label: reward.label, source: reward.why })
  partners.claimed[reward.id] = prize.id
  save()
  return prize
}

/** Demo: the referral counts when the invite is shared (production: when the friend plays a round). */
export function recordInvite() {
  usePartners()
  partners.invited += 1
  save()
  return partners.invited <= REWARD_VALUES.maxReferrals
}

/** Picks the prize first, then the wheel animates to it. */
export function spin(random = Math.random) {
  if (spinsLeft() < 1) throw new Error(`Win 5 rounds in ${TASK_LEAGUE.name} to unlock your spins.`)
  partners.spinsUsed += 1
  const total = WHEEL.reduce((s, w) => s + w.weight, 0)
  let r = random() * total
  const index = WHEEL.findIndex((w) => (r -= w.weight) < 0)
  const segment = WHEEL[index]
  let prize = null
  if (segment.kind === 'spin') partners.bonusSpins += segment.value
  else if (segment.kind !== 'none') prize = addPrize({ kind: segment.kind, value: segment.value, label: `${money(segment.value)} ${segment.kind === 'cashback' ? 'cashback' : 'free bet'}`, source: 'Lucky Wheel' })
  save()
  return { index, segment, prize }
}

export const activePrizes = () => partners.prizes.filter((p) => Date.parse(p.expiresAt) > Date.now())
