import { reactive } from 'vue'

export const ui = reactive({ toasts: [] })
let seq = 0

/**
 * In-app banner styled like the lock-screen alerts from design 4.1.
 * @param {{title: string, body?: string, tone?: 'info'|'success'|'error', to?: string, duration?: number}} t
 */
export function toast(t) {
  const id = ++seq
  const item = { id, tone: 'info', duration: 4200, ...t }
  // A repeat (Re-pick, Retry…) replaces its older copy instead of stacking up.
  ui.toasts = ui.toasts.filter((x) => x.title !== item.title)
  ui.toasts.unshift(item)
  if (ui.toasts.length > 3) ui.toasts.pop()
  if (item.duration) setTimeout(() => dismiss(id), item.duration)
  return id
}

export function dismiss(id) {
  const i = ui.toasts.findIndex((t) => t.id === id)
  if (i >= 0) ui.toasts.splice(i, 1)
}

export function toastError(e, title = 'Something went wrong') {
  const body = e?.message ?? String(e)
  toast({ title, body: e?.traceId ? `${body} (trace ${e.traceId})` : body, tone: 'error', duration: 6000 })
}
