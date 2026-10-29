// Back/close behaviour shared by every screen.

/** Pops the history stack when there is an in-app page behind; otherwise jumps to a safe parent. */
export function backOr(router, fallback = '/') {
  if (window.history.state?.back) router.back()
  else router.replace(fallback)
}

/**
 * Router guard: never stack a page on top of the identical page right below it.
 * "Going forward" to the previous entry (A → B → A) becomes a real back step, so the
 * back button can't bounce between two screens forever.
 */
export function preventBackLoops(router) {
  router.beforeEach((to) => {
    const state = window.history.state
    if (state?.back && state.current !== to.fullPath && state.back === to.fullPath) {
      setTimeout(() => router.back())
      return false
    }
  })
}
