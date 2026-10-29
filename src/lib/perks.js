// Rewards has two categories (product + backend decision, Oct 29):
//  1. Sporty merch store — bought with RP earned from rounds and missions.
//  2. Partner rewards (these creatives) — never bought:
//       Free bet        open: a welcome free bet gift to claim
//       Refer a friend  open: a free bet for every friend who joins
//       Cashback        locked: reach #1 in the Lagos Ballers league
//       Lucky Wheel     locked: win 5 rounds in the Lagos Ballers league
//
// Creatives live in public/rewards/*.webp. Partner links come from VITE_PARTNER_*_URL at build time.
const env = import.meta.env
const BASE = env.BASE_URL

export const CURRENCY = env.VITE_REWARD_CURRENCY || 'ZMW'
export const money = (n) => `${CURRENCY} ${n}`

export const REWARD_VALUES = { freeBetGift: 10, cashback: 15, wheelSpins: 3, referral: 20, maxReferrals: 10 }

/** The league whose standing unlocks the performance rewards (community seed slug). */
export const TASK_LEAGUE = { slug: 'lagos-ballers', name: 'Lagos Ballers' }

export const PARTNER_OFFERS = [
  {
    id: 'free-bet',
    title: 'Free bet',
    image: `${BASE}rewards/freebet.webp`,
    bg: 'linear-gradient(135deg,#0E7A3E,#053B1E)',
    emoji: '🎟️',
    task: null,
    summary: `Your reward is unlocked — claim your ${money(REWARD_VALUES.freeBetGift)} free bet gift.`,
    url: env.VITE_PARTNER_FREEBET_URL || null,
    terms: 'Min. odds 1.5. Valid 7 days. Winnings exclude the stake.',
    betting: true,
  },
  {
    id: 'refer',
    title: 'Refer a friend',
    image: `${BASE}rewards/referral.webp`,
    bg: 'linear-gradient(135deg,#15803D,#052E16)',
    emoji: '🤝',
    task: null,
    summary: `${money(REWARD_VALUES.referral)} free bet for every friend who joins and plays a round.`,
    url: env.VITE_PARTNER_REFER_URL || null,
    terms: `Up to ${REWARD_VALUES.maxReferrals} friends a month.`,
    betting: true,
  },
  {
    id: 'cashback',
    title: 'Cashback',
    image: `${BASE}rewards/cashback.webp`,
    bg: 'linear-gradient(135deg,#B91C1C,#450A0A)',
    emoji: '💸',
    task: { type: 'rank', target: 1, label: `Reach #1 in ${TASK_LEAGUE.name}` },
    summary: `Top your friends' league and get ${money(REWARD_VALUES.cashback)} virtual cashback.`,
    url: env.VITE_PARTNER_CASHBACK_URL || null,
    terms: 'Virtual cashback is paid as bonus funds. Valid 7 days.',
    betting: true,
  },
  {
    id: 'lucky-wheel',
    title: 'Lucky Wheel',
    image: `${BASE}rewards/wheel.webp`,
    bg: 'linear-gradient(135deg,#F5B400,#B45309)',
    emoji: '🎡',
    task: { type: 'wins', target: 5, label: `Win 5 rounds in ${TASK_LEAGUE.name}` },
    summary: `Five round wins in ${TASK_LEAGUE.name} unlock ${REWARD_VALUES.wheelSpins} Lucky Wheel spins.`,
    url: env.VITE_PARTNER_WHEEL_URL || null,
    terms: 'Prizes expire after 7 days.',
    betting: false,
  },
]

export const offerById = (id) => PARTNER_OFFERS.find((o) => o.id === id) ?? null

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

// RP shop: merchandise only (coffee and scarf were dropped). The backend seed still has them.
export const HIDDEN_GIFTS = ['Matchday Coffee', 'Club Scarf']
