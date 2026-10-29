// Port of the backend's reward catalogue (RewardSeed + RewardService.catalogue, Oct 29):
// two categories — Sporty Merch bought with RP, and SportyBet Rewards that unlock at lifetime
// leaderboard points (sum of final scores of settled rounds), cost 0 RP and are claimable once.
// Used by the mock core and by the app when a backend has no /rewards/catalogue yet.
import { uid } from './data.js'

const DEFS = [
  ['cap', 'Sporty Red Cap', 'Red cotton cap for matchday.', 'SPORTY_MERCH', 3000, 0, false, 'red-cap.png'],
  ['shirt', 'Sporty Red T-shirt', 'Red cotton T-shirt for your matchday outfit.', 'SPORTY_MERCH', 4500, 0, false, 'red-shirt.jpg'],
  ['hoodie', 'Sporty Red Hoodie', 'Warm red hoodie for evenings at the ground.', 'SPORTY_MERCH', 6000, 0, false, 'red-hoodie.jpg'],
  ['referral', 'Referral Reward', 'Free referral gift for every account. Local reward voucher.', 'SPORTYBET_REWARDS', 0, 0, true, 'referral.png'],
  ['free-bet', 'Free Bet', 'Unlock with 500 lifetime leaderboard points. Local reward voucher.', 'SPORTYBET_REWARDS', 0, 500, true, 'free-bet.png'],
  ['cashback', 'Cashback', 'Unlock with 3,000 lifetime leaderboard points. Local reward voucher.', 'SPORTYBET_REWARDS', 0, 3000, true, 'cashback.png'],
  ['wheel', 'Lucky Wheel', 'Unlock with 5,000 lifetime leaderboard points. Local reward voucher.', 'SPORTYBET_REWARDS', 0, 5000, true, 'wheel.png'],
]

export const REWARD_GIFTS = DEFS.map(([key, name, description, category, priceRp, requiredPoints, onePerUser, image]) => ({
  id: uid(`reward:${key}`), name, description, category, imageUrl: `/media/rewards/${image}`, priceRp, requiredPoints, onePerUser,
}))

export const REWARD_CATEGORIES = [
  { code: 'SPORTY_MERCH', name: 'Sporty Merch', currency: 'RP' },
  { code: 'SPORTYBET_REWARDS', name: 'SportyBet Rewards', currency: 'LEADERBOARD_POINTS' },
]

/** RewardService.catalogue: personalised state of every gift. */
export function buildCatalogue({ balanceRp, ranking, gifts = REWARD_GIFTS, claimedGiftIds = [] }) {
  const claimed = new Set(claimedGiftIds)
  const points = ranking?.points ?? 0
  return {
    wallet: { balanceRp },
    leaderboard: ranking,
    categories: REWARD_CATEGORIES,
    items: gifts.map((gift) => {
      const unlocked = points >= (gift.requiredPoints ?? 0)
      const affordable = balanceRp >= gift.priceRp
      const done = Boolean(gift.onePerUser) && claimed.has(gift.id)
      return {
        gift, unlocked, affordable, claimed: done, canClaim: unlocked && affordable && !done,
        pointsNeeded: Math.max(0, (gift.requiredPoints ?? 0) - points), rpNeeded: Math.max(0, gift.priceRp - balanceRp),
        lockReason: done ? 'ALREADY_CLAIMED' : !unlocked ? 'LEADERBOARD_POINTS' : !affordable ? 'INSUFFICIENT_RP' : null,
      }
    }),
  }
}
