<script setup>
// Invite friends to a round (POST /friends/{id}/invitations). They see it on Home and enter with
// one tap; the Team Player badge unlocks when someone accepts.
import { computed, ref, watch } from 'vue'
import { num } from '../lib/format.js'
import { friends, inviteFriend, loadFriends, sentFor } from '../stores/friends.js'
import { toastError } from '../stores/ui.js'
import Avatar from './Avatar.vue'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({ open: Boolean, round: { type: Object, default: null } })
defineEmits(['close'])
const busy = ref(null)

watch(() => props.open, (v) => v && loadFriends({ force: true }).catch(() => {}))
const sent = computed(() => new Map(sentFor(props.round?.id).map((i) => [i.recipient.id, i])))
const STATUS = { PENDING: 'Invited', ACCEPTED: 'Joined ✓', DECLINED: 'Declined', EXPIRED: 'Expired' }

async function invite(f) {
  busy.value = f.id
  try {
    await inviteFriend(f, props.round.id)
  } catch (e) {
    toastError(e, 'Could not invite')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <BottomSheet :open="open" @close="$emit('close')">
    <span class="h2">Invite friends</span>
    <span class="t">They get an invitation to {{ round?.name }} and join with one tap — then tweak their five before the lock.</span>
    <div v-if="friends.available === false" class="note"><span>Friends arrive with the next backend update. Share your challenge link instead.</span></div>
    <div v-else-if="!friends.list.length" class="col g6"><div v-for="i in 3" :key="i" class="skel" style="height: 52px" /></div>
    <div v-else class="col g6">
      <div v-for="f in friends.list" :key="f.id" class="opt">
        <Avatar :name="f.displayName" :src="f.avatarUrl" size="sm" />
        <span class="col g2 f1" style="text-align: left"><b class="sm">{{ f.displayName }}</b><span class="xs m">{{ num(f.leaderboardPoints) }} leaderboard pts</span></span>
        <span v-if="sent.get(f.id)" class="pill" :class="sent.get(f.id).status === 'ACCEPTED' ? 'g' : 'o'">{{ STATUS[sent.get(f.id).status] }}</span>
        <button v-else class="btn xs" :disabled="busy === f.id" @click="invite(f)"><span v-if="busy === f.id" class="spin" />Invite</button>
      </div>
    </div>
  </BottomSheet>
</template>
