import { createRouter, createWebHistory } from 'vue-router'
import { preventBackLoops } from './lib/nav.js'
import { session } from './stores/session.js'
import Home from './views/Home.vue'

const routes = [
  { path: '/welcome', component: () => import('./views/Onboarding.vue') },
  { path: '/', component: Home, meta: { tab: true, theme: '#E41827' } },
  { path: '/play', component: () => import('./views/Play.vue'), meta: { tab: true, theme: '#FFFFFF' } },
  { path: '/leagues', component: () => import('./views/Leagues.vue'), meta: { tab: true, theme: '#FFFFFF' } },
  { path: '/rewards', component: () => import('./views/Rewards.vue'), meta: { tab: true, theme: '#E41827' } },
  { path: '/profile', component: () => import('./views/Profile.vue'), meta: { tab: true, theme: '#1A1D23' } },
  { path: '/rounds/:id', component: () => import('./views/RoundDetail.vue'), meta: { theme: '#1E1417' } },
  { path: '/rounds/:id/build', component: () => import('./views/SquadBuilder.vue') },
  { path: '/rounds/:id/pick', component: () => import('./views/PlayerPicker.vue') },
  { path: '/rounds/:id/locked', component: () => import('./views/LockedIn.vue'), meta: { theme: '#1A1D23' } },
  { path: '/rounds/:id/live', component: () => import('./views/LiveTactics.vue'), meta: { theme: '#E41827' } },
  { path: '/rounds/:id/standings', component: () => import('./views/Standings.vue') },
  { path: '/rounds/:id/result', component: () => import('./views/Result.vue'), meta: { theme: '#1A1D23' } },
  { path: '/rounds/:id/recap', component: () => import('./views/Recap.vue') },
  { path: '/c/:code', component: () => import('./views/Challenge.vue'), meta: { public: true, theme: '#1A1D23' } },
  { path: '/leagues/new', component: () => import('./views/CreateLeague.vue') },
  { path: '/leagues/creator/:id', component: () => import('./views/CreatorLeague.vue'), meta: { theme: '#EA6A17' } },
  { path: '/leagues/:id', component: () => import('./views/LeagueDetail.vue'), meta: { theme: '#1A1D23' } },
  { path: '/back', component: () => import('./views/BackManager.vue') },
  { path: '/rewards/missions', component: () => import('./views/Missions.vue') },
  { path: '/rewards/vouchers', component: () => import('./views/Vouchers.vue') },
  { path: '/rewards/vouchers/:id', component: () => import('./views/Voucher.vue') },
  { path: '/notifications', component: () => import('./views/Notifications.vue') },
  { path: '/settings', component: () => import('./views/Settings.vue') },
  { path: '/rules', component: () => import('./views/Rules.vue') },
  { path: '/credits', component: () => import('./views/Credits.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({ history: createWebHistory(), routes })

preventBackLoops(router)

router.beforeEach((to) => {
  if (!session.onboarded && to.path !== '/welcome' && !to.meta.public) {
    return { path: '/welcome', query: { next: to.fullPath } }
  }
})

/** Status bar colour follows the screen header (Android/desktop; iOS uses the manifest colour). */
router.afterEach((to) => {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', to.meta.theme ?? '#FFFFFF')
})
