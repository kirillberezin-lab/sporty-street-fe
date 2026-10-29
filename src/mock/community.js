// Port of the backend's CommunityService (local profile): read-only, simulated social content for
// Leagues, Rivalries, Banter and Back a manager. Same shapes as the API (docs/community-api.md).
// Used by the mock core (dev:mock and the static build) and by the app itself when it talks to an
// older backend that has no /leagues yet.
import seed from './community-seed.js'
import { uid } from './data.js'

const MODE = 'SIMULATED'
const FILTERS = ['ALL', 'FRIENDS', 'TOP_FORM', 'CREATORS']

/**
 * @param users      { [username]: { displayName, avatarUrl } } — real accounts override the seed
 * @param fail       (status, code, message) => never — throws the caller's API error
 * @param roundOf    (roundId) => { name, status } (throws when unknown)
 * @param autoPick   (roundId, user) => { starters, captainPlayerId } — illustrative five
 * @param mediaBase  prefix for /media/... urls (static build under a sub-path)
 */
export function createCommunity({ users = {}, fail, roundOf, autoPick, mediaBase = '', now = Date.now(), data = seed }) {
  const profiles = new Map(data.profiles.map((p) => [p.id, p]))
  const media = (url) => (url && url.startsWith('/') ? `${mediaBase}${url}` : url)

  function person(id, viewer) {
    const p = profiles.get(id)
    if (!p) fail(404, 'NOT_FOUND', 'Resource not found')
    const user = p.username ? users[p.username] : null
    return {
      id: p.id, displayName: user?.displayName ?? p.displayName, teamName: p.teamName,
      avatarUrl: media(user?.avatarUrl ?? p.avatarUrl), creator: p.creator, fans: p.fans, isYou: id === viewer,
    }
  }
  function league(id) {
    const l = data.leagues.find((x) => x.id === id)
    if (!l) fail(404, 'NOT_FOUND', 'Resource not found')
    return l
  }
  function members(l, viewer) {
    const ordered = [...l.members].sort((a, b) => b.score - a.score || a.profileId.localeCompare(b.profileId))
    let rank = 0
    return ordered.map((m, i) => {
      if (i === 0 || ordered[i - 1].score !== m.score) rank = i + 1
      return { profile: person(m.profileId, viewer), rank, score: m.score, wins: m.wins }
    })
  }
  function card(l, viewer) {
    const list = members(l, viewer)
    const mine = list.find((m) => m.profile.isYou)
    const creator = l.creatorId ? person(l.creatorId, viewer) : null
    return {
      id: l.id, slug: l.slug, name: l.name, type: l.type, format: l.format, inviteCode: l.inviteCode,
      imageUrl: media(l.imageUrl), avatarUrl: creator ? creator.avatarUrl : media(l.imageUrl), creator,
      description: l.description, memberCount: list.length, joined: Boolean(mine), myRank: mine?.rank ?? null,
      seasonRounds: l.seasonRounds, roundsRemaining: l.roundsRemaining, memberPreview: list.slice(0, 4).map((m) => m.profile),
    }
  }
  function page(items, p = 0, size = 20) {
    p = Number(p)
    size = Number(size)
    if (!(p >= 0) || !(size >= 1) || size > 100) fail(400, 'VALIDATION_FAILED', 'page >= 0 and size 1–100 required')
    return { dataMode: MODE, items: items.slice(p * size, p * size + size), page: p, size, total: items.length }
  }
  const friend = (m, viewer) => m.friendOf.includes(viewer) || data.managers.some((x) => x.profileId === viewer && x.friendOf.includes(m.profileId))

  return {
    leagues(viewer, scope = 'MINE', p, size) {
      if (!['MINE', 'DISCOVER', 'ALL'].includes(scope)) fail(400, 'VALIDATION_FAILED', 'scope must be MINE, DISCOVER or ALL')
      const cards = data.leagues.map((l) => card(l, viewer))
        .filter((l) => scope === 'ALL' || (scope === 'MINE' ? l.joined : l.type === 'CREATOR' && !l.joined))
      return page(cards, p, size)
    },
    detail(id, viewer) {
      const l = league(id)
      return { dataMode: MODE, readOnly: true, league: card(l, viewer), members: members(l, viewer) }
    },
    table: (id, viewer, p, size) => page(members(league(id), viewer), p, size),
    rivalries(id, viewer) {
      league(id)
      const flip = (v) => (v === 'W' ? 'L' : v === 'L' ? 'W' : 'D')
      const items = data.rivalries
        .filter((r) => r.leagueId === id && (r.leftProfileId === viewer || r.rightProfileId === viewer))
        .map((r) => {
          const left = r.leftProfileId === viewer
          return {
            id: r.id, you: person(viewer, viewer), opponent: person(left ? r.rightProfileId : r.leftProfileId, viewer),
            wins: left ? r.leftWins : r.rightWins, losses: left ? r.rightWins : r.leftWins, draws: r.draws,
            recentForm: left ? r.recentForm : r.recentForm.map(flip),
          }
        })
      const challenges = data.challenges
        .filter((c) => c.leagueId === id && (c.fromProfileId === viewer || c.toProfileId === viewer))
        .map((c) => ({ id: c.id, from: person(c.fromProfileId, viewer), to: person(c.toProfileId, viewer), direction: c.toProfileId === viewer ? 'INCOMING' : 'OUTGOING', roundLabel: c.roundLabel, status: c.status }))
      return { dataMode: MODE, readOnly: true, items, challenges }
    },
    banter(id, viewer, p, size) {
      league(id)
      const texts = Object.fromEntries(data.presets.map((x) => [x.id, x.text]))
      const messages = data.messages
        .filter((m) => m.leagueId === id)
        .sort((a, b) => a.minutesAgo - b.minutesAgo)
        .map((m) => ({ id: m.id, author: person(m.authorId, viewer), presetId: m.presetId, text: texts[m.presetId], createdAt: new Date(now - m.minutesAgo * 60_000).toISOString(), reactions: m.reactions }))
      return { dataMode: MODE, readOnly: true, messages: page(messages, p, size), quickMessages: data.presets }
    },
    async managers(roundId, viewer, filter = 'ALL', p = 0, size = 20) {
      if (!FILTERS.includes(filter)) fail(400, 'VALIDATION_FAILED', 'filter must be ALL, FRIENDS, TOP_FORM or CREATORS')
      const round = await roundOf(roundId)
      const selected = data.managers
        .filter((m) => m.profileId !== viewer)
        .filter((m) => filter === 'FRIENDS' ? friend(m, viewer) : filter === 'TOP_FORM' ? m.topForm : filter === 'CREATORS' ? profiles.get(m.profileId).creator : true)
        .sort((a, b) => b.averagePoints - a.averagePoints || a.profileId.localeCompare(b.profileId))
      const slice = page(selected, p, size)
      const items = await Promise.all(slice.items.map(async (m) => {
        const pr = profiles.get(m.profileId)
        // Preview selections are generated; never another user's saved lineup.
        const pick = await autoPick(roundId, { id: pr.id, username: pr.username, countryId: uid(`country:${pr.countryCode}`) })
        return {
          profile: person(pr.id, viewer), friend: friend(m, viewer), topForm: m.topForm, averagePoints: m.averagePoints,
          topFinishes: m.topFinishes, recentRounds: m.recentRounds, target: m.target, multiplier: m.multiplier,
          recentForm: m.recentForm, squadPreview: pick.starters, captainPlayerId: pick.captainPlayerId,
        }
      }))
      return { dataMode: MODE, readOnly: true, roundId, roundName: round.name, roundStatus: round.status, items, page: slice.page, size: slice.size, total: slice.total }
    },
  }
}
