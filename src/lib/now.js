// One shared 1-second clock for countdowns instead of an interval per component.
import { onBeforeUnmount, ref } from 'vue'

const now = ref(Date.now())
let timer = null
let users = 0

export function useNow() {
  users += 1
  if (!timer) timer = setInterval(() => (now.value = Date.now()), 1000)
  onBeforeUnmount(() => {
    users -= 1
    if (users === 0) {
      clearInterval(timer)
      timer = null
    }
  })
  return now
}
