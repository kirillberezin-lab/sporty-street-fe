// Missions (design 8.2). Progress comes from real game data where the backend has it
// (teams, substitutions, results); rewards are illustrative until a missions service exists.
import { lineKind } from '../lib/liveDiff.js'
import { demo } from './demo.js'
import { notify } from './notify.js'
import { rounds } from './rounds.js'

function teams() {
  return Object.values(rounds.teams).filter(Boolean)
}
function results() {
  return Object.values(rounds.results).filter(Boolean)
}

export function missionList() {
  const ts = teams()
  const rs = results()
  const heroScored = rs.some((r) => r.breakdown?.timeline?.some((l) => lineKind(l) === 'HOME_HERO')) ||
    ts.some((t) => t.homeHeroPlayerId && (t.starters.find((s) => s.player.id === t.homeHeroPlayerId)?.points ?? 0) >= 4)
  const defs = [
    { id: 'enter', period: 'daily', title: 'Enter any round', icon: 'check', reward: 50, progress: ts.length ? 1 : 0, target: 1, to: '/play' },
    { id: 'sub', period: 'daily', title: 'Make your live substitution', icon: 'swap', reward: 100, progress: ts.some((t) => t.subsUsed > 0) ? 1 : 0, target: 1, to: '/play' },
    { id: 'back', period: 'daily', title: 'Back a manager', icon: 'trophy', reward: 200, progress: demo.backings.length ? 1 : 0, target: 1, to: '/back' },
    { id: 'share', period: 'daily', title: 'Share a squad card', icon: 'share', reward: 25, progress: Math.min(1, demo.shares), target: 1, to: '/play' },
    { id: 'invite', period: 'weekly', title: 'Challenge a friend', icon: 'userPlus', reward: 200, progress: Math.min(1, demo.invites), target: 1, to: '/play' },
    { id: 'hero', period: 'weekly', title: 'Home Hero gets a goal or assist', icon: 'star', reward: 75, progress: heroScored ? 1 : 0, target: 1 },
    { id: 'win', period: 'weekly', title: 'Finish 1st in a round', icon: 'trophy', reward: 100, progress: rs.some((r) => r.finalRank === 1) ? 1 : 0, target: 1 },
    { id: 'alerts', period: 'season', title: 'Turn on tactical alerts', icon: 'bell', reward: 50, progress: notify.permission === 'granted' ? 1 : 0, target: 1, to: '/settings' },
    { id: 'five', period: 'season', title: 'Play 5 rounds', icon: 'ball', reward: 300, progress: Math.min(5, ts.length), target: 5, to: '/play' },
  ]
  return defs.map((m) => ({ ...m, done: m.progress >= m.target, claimed: Boolean(demo.claimed[m.id]) }))
}

export const claimable = () => missionList().filter((m) => m.done && !m.claimed)
