<script setup>
// Profile (design 9.1) from GET /me/profile: level/XP, stats, badges, top Home Hero, round history
// and overall leaderboard rank. Older backends: the same figures derived from my results here.
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/index.js'
import Avatar from '../components/Avatar.vue'
import Flag from '../components/Flag.vue'
import Icon from '../components/Icon.vue'
import TabBar from '../components/TabBar.vue'
import { num, ordinal, shortDate, topPercent } from '../lib/format.js'
import { lineKind } from '../lib/liveDiff.js'
import { shortName } from '../lib/players.js'
import { pointsAfter } from '../lib/recap.js'
import { demo } from '../stores/demo.js'
import { loadParticipants, loadResult, loadRounds, phaseOf, rounds } from '../stores/rounds.js'
import { session } from '../stores/session.js'

const server = ref(null) // /me/profile
onMounted(async () => {
  api.profile().then((p) => (server.value = p), () => null)
  await loadRounds()
  for (const r of rounds.list.filter((x) => phaseOf(x) === 'settled' && rounds.teams[x.id])) {
    loadResult(r.id).catch(() => {})
    loadParticipants(r.id)
  }
})

const played = computed(() => rounds.list.filter((r) => rounds.teams[r.id]))
const settled = computed(() => played.value.filter((r) => rounds.results[r.id]))
const scores = computed(() => played.value.map((r) => rounds.results[r.id]?.finalScore ?? rounds.teams[r.id]?.score ?? 0))
const avg = computed(() => (scores.value.length ? Math.round(scores.value.reduce((a, b) => a + b, 0) / scores.value.length) : 0))
const best = computed(() => {
  const ranks = settled.value.map((r) => ({ rank: rounds.results[r.id].finalRank, total: rounds.participants[r.id] }))
  if (!ranks.length) return '—'
  const b = ranks.sort((a, c) => a.rank / (a.total || 1) - c.rank / (c.total || 1))[0]
  return b.rank === 1 ? '1st' : topPercent(b.rank, b.total) ?? `#${b.rank}`
})
const xp = computed(() => scores.value.reduce((a, b) => a + b, 0) * 10 + demo.streak.count * 20 + Object.keys(demo.claimed).length * 50)
const level = computed(() => Math.floor(xp.value / 1000) + 1)
const LEVELS = ['Rookie', 'Sunday Player', 'Street Baller', 'Squad Player', 'Playmaker', 'Street Captain', 'Gaffer', 'Legend']
const smartSubs = computed(() => {
  const subs = settled.value.filter((r) => demo.subs[r.id] && rounds.teams[r.id]?.subsUsed)
  if (!subs.length) return '—'
  const smart = subs.filter((r) => pointsAfter(rounds.results[r.id].breakdown, demo.subs[r.id].incomingPlayerId, demo.subs[r.id].effectiveAt) > 0)
  return `${Math.round((smart.length / subs.length) * 100)}%`
})
const topHero = computed(() => {
  const tally = new Map()
  for (const r of settled.value) {
    const team = rounds.teams[r.id]
    for (const l of rounds.results[r.id].breakdown?.timeline ?? []) {
      if (lineKind(l) !== 'HOME_HERO') continue
      const p = [...(team?.starters ?? []), team?.bench].find((s) => s?.player?.id === l.playerId)?.player
      if (p) tally.set(p.name, (tally.get(p.name) ?? 0) + l.points)
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return top ? shortName(top[0]) : '—'
})
const BADGE_LOOK = { SUPER_SUB: ['⚡', 'var(--gold-50)'], STREAK: ['🔥', 'var(--red-50)'], PATRIOT: ['⭐', 'var(--green-50)'], RECRUITER: ['🤝', 'var(--blue-50)'], WINNER: ['👑', 'var(--gold-50)'] }
/** One view model for both sources. */
const view = computed(() => {
  const p = server.value
  if (!p) {
    return {
      level: level.value, title: LEVELS[Math.min(level.value - 1, LEVELS.length - 1)], xpIn: xp.value % 1000, xpFor: 1000,
      rounds: played.value.length, avg: avg.value, best: best.value, smartSubs: smartSubs.value, hero: topHero.value, heroPlayer: null,
      badges: localBadges.value, rank: null,
      history: played.value.map((r) => ({ roundId: r.id, name: r.name, status: r.status, startsAt: r.entryDeadline, score: rounds.results[r.id]?.finalScore ?? rounds.teams[r.id]?.score ?? 0, rank: rounds.results[r.id]?.finalRank ?? null, earnedRp: rounds.results[r.id]?.totalAwardedRp ?? 0 })),
    }
  }
  const st = p.stats
  return {
    level: p.progress.level, title: p.progress.title, xpIn: p.progress.xpInLevel, xpFor: p.progress.xpForNextLevel,
    rounds: st.roundsPlayed, avg: Math.round(st.averagePoints), best: st.bestFinish ? ordinal(st.bestFinish) : '—',
    smartSubs: st.substitutions ? `${st.smartSubs}/${st.substitutions}` : '—', hero: p.topHomeHero ? shortName(p.topHomeHero.name) : '—',
    heroPlayer: p.topHomeHero ? { name: p.topHomeHero.name, imageUrl: p.topHomeHero.imageUrl } : null,
    badges: p.badges.map((b) => ({ icon: BADGE_LOOK[b.code]?.[0] ?? '🏅', label: b.name, on: b.unlocked, bg: BADGE_LOOK[b.code]?.[1] ?? 'var(--bg)' })),
    rank: p.leaderboard, wins: st.wins, streak: st.streakDays, bio: p.bio, joinedAt: p.joinedAt,
    history: p.roundHistory.items, historyTotal: p.roundHistory.total,
  }
})
const localBadges = computed(() => [
  { icon: '⚡', label: 'Super Sub', on: smartSubs.value !== '—' && smartSubs.value !== '0%', bg: 'var(--gold-50)' },
  { icon: '🔥', label: `${Math.max(demo.streak.count, 2)} streak`, on: demo.streak.count >= 2, bg: 'var(--red-50)' },
  { icon: '⭐', label: 'Patriot', on: topHero.value !== '—', bg: 'var(--green-50)' },
  { icon: '🤝', label: 'Recruiter', on: demo.invites > 0, bg: 'var(--blue-50)' },
  { icon: '👑', label: 'Winner', on: settled.value.some((r) => rounds.results[r.id].finalRank === 1), bg: 'var(--gold-50)' },
])
</script>

<template>
  <div class="screen">
    <header class="head on-dark" style="padding-bottom: 18px">
      <div class="top">
        <span />
        <RouterLink to="/settings" class="icon-btn" aria-label="Settings"><Icon name="settings" :size="22" /></RouterLink>
      </div>
      <div class="row g12" style="padding: 0 16px">
        <div style="position: relative">
          <Avatar :name="session.user?.displayName" :src="session.user?.avatarUrl" color="#5B3A29" size="xl" />
          <span class="badge hh lvl">{{ view.level }}</span>
        </div>
        <div class="col g4 f1">
          <span class="h2">{{ session.user?.displayName }}</span>
          <div class="row g6">
            <Flag v-if="session.countryName" :country="session.countryName" />
            <span class="sm soft-w">{{ session.countryName ?? 'No home country' }} · @{{ session.user?.username }}</span>
          </div>
          <div class="col g2">
            <div class="row between"><span class="xs b" style="color: var(--gold)">{{ view.title }} · Lvl {{ view.level }}</span><span class="xs" style="color: #9AA0A9">{{ num(view.xpIn) }}/{{ num(view.xpFor) }} XP</span></div>
            <div class="prog y" style="background: #33373F"><i :style="{ width: `${(view.xpIn / view.xpFor) * 100}%` }" /></div>
          </div>
        </div>
      </div>
    </header>
    <main class="ct">
      <RouterLink v-if="view.rank" to="/leaderboard" class="card dark row">
        <div class="ibox" style="background: rgba(255,255,255,.1); color: var(--gold)"><Icon name="trophy" :size="22" /></div>
        <div class="col g2 f1"><span class="xs soft-w">Overall leaderboard</span><b>{{ ordinal(view.rank.rank) }} · {{ num(view.rank.points) }} pts</b></div>
        <Icon name="chevron" :size="18" />
      </RouterLink>
      <div class="row g6">
        <div class="stat w"><b>{{ view.rounds }}</b><span>Rounds</span></div>
        <div class="stat w"><b>{{ view.avg }}</b><span>Avg pts</span></div>
        <div class="stat w"><b>{{ view.best }}</b><span>Best finish</span></div>
      </div>
      <div class="row g6">
        <div v-if="view.wins != null" class="stat w"><b>{{ view.wins }}</b><span>Wins</span></div>
        <div class="stat w"><b class="grn">{{ view.smartSubs }}</b><span>Smart subs</span></div>
        <div class="stat w row g6" style="align-items: center"><Avatar v-if="view.heroPlayer" :player="view.heroPlayer" size="xs" /><div class="col g2" style="min-width: 0"><b class="ellipsis">{{ view.hero }}</b><span>Top Home Hero</span></div></div>
      </div>
      <div class="sec-t"><span class="h3">Badges · {{ view.badges.filter((b) => b.on).length }}/{{ view.badges.length }}</span></div>
      <div class="row g6">
        <div v-for="b in view.badges" :key="b.label" class="col g4 f1 items-center" :style="b.on ? '' : 'opacity:.35'">
          <div class="ibox" :style="{ width: '52px', height: '52px', borderRadius: '16px', fontSize: '24px', background: b.on ? b.bg : '#E8EAEE' }">{{ b.icon }}</div>
          <span class="xs b tc">{{ b.label }}</span>
        </div>
      </div>
      <div class="sec-t"><span class="h3">Round history{{ view.historyTotal ? ` · ${view.historyTotal}` : '' }}</span><RouterLink to="/play">Play</RouterLink></div>
      <div class="card flat">
        <div v-if="!view.history.length" class="li"><span class="sm m">No rounds yet — build your first five.</span></div>
        <RouterLink v-for="h in view.history" :key="h.roundId" :to="h.rank != null ? `/rounds/${h.roundId}/result` : `/rounds/${h.roundId}`" class="li">
          <div class="col g2 f1">
            <b class="sm">{{ h.name }}</b>
            <span class="xs m">{{ shortDate(h.startsAt) }} · {{ h.rank != null ? (topPercent(h.rank, rounds.participants[h.roundId]) ?? `#${h.rank}`) : phaseOf(h) === 'live' ? 'Live now' : 'Squad in' }}</span>
          </div>
          <b>{{ h.score }}</b>
          <span v-if="h.rank != null" class="pill y">+{{ h.earnedRp }}</span>
          <span v-else class="pill o">{{ phaseOf(h) === 'live' ? 'LIVE' : 'Open' }}</span>
        </RouterLink>
      </div>
      <div class="row g6">
        <RouterLink to="/notifications" class="btn md ghost f1"><Icon name="bell" :size="18" />Inbox</RouterLink>
        <RouterLink to="/settings" class="btn md ghost f1"><Icon name="settings" :size="18" />Settings</RouterLink>
      </div>
    </main>
    <TabBar />
  </div>
</template>

<style scoped>
.lvl { width: 28px; height: 28px; font-size: 12px; border-color: var(--dark); top: auto; bottom: -2px; right: -2px; }
</style>
