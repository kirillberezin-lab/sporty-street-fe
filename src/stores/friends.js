// Persisted friends and round invitations (GET /me/friends, /me/invitations). An accepted invitation
// enters the recipient with an auto-picked five they can edit before the deadline. Backends without
// these endpoints (404) simply hide the feature.
import { reactive } from 'vue'
import { api } from '../api/index.js'
import { ApiError } from '../api/client.js'
import { loadMyTeam } from './rounds.js'
import { session } from './session.js'

export const friends = reactive({ available: null, list: [], invitations: [], loadedFor: null })

const missing = (e) => e instanceof ApiError && e.status === 404

export async function loadFriends({ force = false } = {}) {
  if (!force && friends.loadedFor === session.username) return friends
  try {
    const [f, i] = await Promise.all([api.friends(), api.invitations()])
    Object.assign(friends, { available: true, list: f.items ?? [], invitations: i.items ?? [], loadedFor: session.username })
  } catch (e) {
    if (!missing(e)) throw e
    Object.assign(friends, { available: false, list: [], invitations: [], loadedFor: session.username })
  }
  return friends
}

export const incoming = () => friends.invitations.filter((i) => i.recipient.id === session.user?.id && i.status === 'PENDING')
export const sentFor = (roundId) => friends.invitations.filter((i) => i.sender.id === session.user?.id && i.roundId === roundId)

export async function inviteFriend(friend, roundId) {
  const inv = await api.invite(friend.id, roundId)
  friends.invitations = [inv, ...friends.invitations.filter((x) => x.id !== inv.id)]
  return inv
}

export async function respond(invitation, accept) {
  const inv = await (accept ? api.acceptInvitation(invitation.id) : api.declineInvitation(invitation.id))
  friends.invitations = friends.invitations.map((x) => (x.id === inv.id ? inv : x))
  if (accept) await loadMyTeam(inv.roundId).catch(() => null)
  return inv
}
