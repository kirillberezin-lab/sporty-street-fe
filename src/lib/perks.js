// Rewards has two categories (backend RewardService.catalogue, Oct 29):
//  1. Sporty Merch — bought with RP earned from rounds.
//  2. SportyBet Rewards — free (0 RP), claimable once, unlocked by lifetime leaderboard points:
//       Referral Reward 0 · Free Bet 500 · Cashback 3,000 · Lucky Wheel 5,000
// The app renders the catalogue as the server sends it; this file only holds the look of the
// SportyBet creatives (public/rewards/*.webp, lighter than the backend PNGs) and the wheel.
const env = import.meta.env
const BASE = env.BASE_URL

export const CURRENCY = env.VITE_REWARD_CURRENCY || 'ZMW'
export const money = (n) => `${CURRENCY} ${n}`

/** Creative + copy per SportyBet reward, keyed by gift name. Unknown gifts use their imageUrl. */
const LOOKS = {
  'Referral Reward': { image: 'referral.webp', emoji: '🤝', bg: 'linear-gradient(135deg,#15803D,#052E16)', cta: 'Claim now', url: env.VITE_PARTNER_REFER_URL, betting: true, share: true },
  'Free Bet': { image: 'freebet.webp', emoji: '🎟️', bg: 'linear-gradient(135deg,#0E7A3E,#053B1E)', cta: 'Claim', url: env.VITE_PARTNER_FREEBET_URL, betting: true },
  Cashback: { image: 'cashback.webp', emoji: '💸', bg: 'linear-gradient(135deg,#B91C1C,#450A0A)', cta: 'Get reward', url: env.VITE_PARTNER_CASHBACK_URL, betting: true },
  'Lucky Wheel': { image: 'wheel.webp', emoji: '🎡', bg: 'linear-gradient(135deg,#F5B400,#B45309)', cta: 'Claim', url: env.VITE_PARTNER_WHEEL_URL, betting: false, wheel: true },
}
export function perkLook(gift) {
  const look = LOOKS[gift?.name]
  return look
    ? { ...look, image: `${BASE}rewards/${look.image}`, url: look.url || null }
    : { image: gift?.imageUrl ?? null, emoji: '🎁', bg: 'linear-gradient(135deg,#3A3F47,#14171C)', cta: 'Claim', url: null, betting: false }
}

export const isPerk = (item) => item?.gift?.category === 'SPORTYBET_REWARDS'
export const isMerch = (item) => item?.gift?.category === 'SPORTY_MERCH'

/** Wheel segments, clockwise from 12 o'clock. `weight` is the relative chance. */
export const WHEEL = [
  { id: 'fb5', label: '5', sub: `${CURRENCY} free bet`, kind: 'free-bet', value: 5, weight: 22, color: '#E41827' },
  { id: 'spin', label: '+1', sub: 'Free spin', kind: 'spin', value: 1, weight: 14, color: '#1A1D23' },
  { id: 'cb5', label: '5', sub: `${CURRENCY} cashback`, kind: 'cashback', value: 5, weight: 16, color: '#F5B400', ink: '#14171C' },
  { id: 'fb10', label: '10', sub: `${CURRENCY} free bet`, kind: 'free-bet', value: 10, weight: 14, color: '#12A150' },
  { id: 'none', label: '😅', sub: 'Next time', kind: 'none', value: 0, weight: 18, color: '#3A3F47' },
  { id: 'fb20', label: '20', sub: `${CURRENCY} free bet`, kind: 'free-bet', value: 20, weight: 9, color: '#2563EB' },
  { id: 'cb10', label: '10', sub: `${CURRENCY} cashback`, kind: 'cashback', value: 10, weight: 6, color: '#7C3AED' },
  { id: 'jackpot', label: '50', sub: 'Jackpot', kind: 'free-bet', value: 50, weight: 1, color: '#B45309' },
]

