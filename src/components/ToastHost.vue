<script setup>
import { useRouter } from 'vue-router'
import { dismiss, ui } from '../stores/ui.js'
import { markRead, notify } from '../stores/notify.js'

const router = useRouter()

function open(t) {
  dismiss(t.id)
  if (t.to) {
    const match = notify.inbox.find((a) => a.url === t.to && a.title === t.title)
    if (match) markRead(match.id)
    router.push(t.to)
  }
}
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <button v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.tone" @click="open(t)">
        <span class="app-ic">S5</span>
        <span class="col g2 f1">
          <span class="row between"><b class="sm">{{ t.title }}</b><span class="xs m">now</span></span>
          <span v-if="t.body" class="sm" style="line-height: 1.35">{{ t.body }}</span>
        </span>
      </button>
    </TransitionGroup>
  </div>
</template>
