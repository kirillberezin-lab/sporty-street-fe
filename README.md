# SportyStreet — frontend (PWA)

*Your five. Your country. Your moment.* Mobile-first installable web app for the SportyStreet
five-a-side live fantasy game, built from `sportystreet-design.html` and wired to the Sporty Street
backend (Java/Spring, `docs/openapi.json` + README of the backend repo).

Vue 3 (`<script setup>`, JavaScript) · Vue Router 5 · Vite 8 · vite-plugin-pwa (Workbox, custom service worker) ·
no UI kit — the design system from the mockup is ported to `src/styles/main.css`.

Aligned with the backend update of 2026-10-28: 60 real players (2024/25 snapshot of Real Madrid, FC Barcelona,
Manchester City, Liverpool, Bayern Munich, PSG) with photos, rounds **European Superstars** (open) and
**Champions Night** (draft), gifts Matchday Coffee / Football Store Discount / Club Scarf.

## Quick start

```sh
npm install
npm run dev:mock     # no backend needed: bundled mock API (same contract) + push relay
npm run dev          # real backend on http://localhost:8080 (start it with `npm run backend`, see below)
```

### Demo with the real backend (`../sporty-street`)

The backend lives in the sibling folder `../sporty-street` (override with `BACKEND_DIR=...`).
`scripts/backend.sh` starts it the way its README describes: `docker compose up --build` when Docker is installed,
otherwise PostgreSQL 16 from Homebrew (data in `.dev-data/postgres`) + JDK 21 + `./mvnw` with the `local` profile.
One-time prerequisites without Docker: `brew install postgresql@16` and a JDK 21 (`mise use -g java@temurin-21`
or `brew install openjdk@21`).

```sh
npm run backend         # terminal 1: database + backend on :8080 (first run downloads Maven deps); Ctrl+C stops it
npm run dev             # terminal 2: app on http://localhost:5173
npm run backend:reset   # fresh demo data right before showing (round deadline = now + 10 min)
npm run backend:status  # is everything up?
npm run backend:stop    # stop PostgreSQL after the demo
```

On a phone: `npx cloudflared tunnel --url http://localhost:5173` and open the `https://….trycloudflare.com` URL
(HTTPS is required for install and push).

Open http://localhost:5173. The app signs in a seeded demo user automatically (default `alice`, Brazil;
switch in **Profile → Settings → Demo account**). Other backend URL: `API_TARGET=http://host:8080 npm run dev`.
See `.env.example` for all settings.

The dev/preview servers proxy both `/api` and `/media` to the backend: player `imageUrl`s are same-origin paths
like `/media/players/kylian-mbappe.jpg`. A production reverse proxy must route both prefixes too.
The mock serves the photos straight from `../sporty-street/src/main/resources/static/media` when that folder exists
(or from `MOCK_MEDIA_DIR`); without them avatars fall back to initials.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server, `/api` proxied to `API_TARGET` (default `:8080`), dev push relay on `/api/v1/push/*` |
| `npm run dev:mock` | Same, but starts `server/mock-api.mjs` (port 8090) instead of the real backend — it mirrors the backend source: seed and ids, statuses, error codes, score components, simulator script |
| `npm run build` | Production build + service worker (`dist/`) |
| `npm run preview` / `preview:mock` | Serve the production build (installable PWA, offline shell) |
| `npm run mock` | Mock API alone on :8090 |

### Playing a full round (local backend or mock)

**Profile → Settings → Demo controls** drive the backend's local-profile endpoints:
build and lock your five in **European Superstars** (its entry deadline is 10 minutes after the backend starts;
the round then goes live by itself) → **Start (lock)** to go live now → **Simulator** (a match minute ≈ 2 s) →
make your sub in **Live tactics** → wait for the sub to activate → **Settle** → result, recap, RP, rewards.
**Champions Night** is a draft round: pick it and press **Open** (10-minute deadline). **Reset demo data** calls
`POST /dev/reset` and reseeds both rounds. Everyone starts with 0 RP — the first settled round pays 50 RP (+100 to the winner).

## Screens

| Design | Route | Data |
| --- | --- | --- |
| 1.1 Splash | inline in `index.html` (shown while the session boots) | — |
| 1.2 Value carousel, 1.6 How scoring works | `/welcome` | `GET /rules` |
| ~~1.3 Sign in, 1.4 Home country, 1.5 Competitions~~ | removed as requested | auto `POST /dev/login` |
| 2.1 Home | `/` | rounds, my-team, results (live card updates over SSE) |
| 2.2 Rounds list | `/play` | `GET /rounds`, leaderboard totals |
| 2.3 Round detail | `/rounds/:id` | `GET /rounds/{id}` |
| 3.1/3.4 Squad builder (Home Hero made prominent) | `/rounds/:id/build` | auto-pick, create team / update lineup |
| 3.2 Player picker, 3.3 Player sheet | `/rounds/:id/pick` | `GET /rounds/{id}/players` (position, name, countryId) |
| 3.5 Review & lock | sheet in the builder | `POST /rounds/{id}/teams` (Idempotency-Key) / `PUT /teams/{id}/lineup` (expectedVersion) |
| 3.6 Locked in + share card | `/rounds/:id/locked`, challenge landing `/c/:code` | team snapshot, players by id |
| 4.1 Tactical alerts | system notifications + in-app banners + inbox | SSE diff → alerts, Web Push |
| 4.2 Live tactics, 4.3 Substitution | `/rounds/:id/live` | SSE stream, score breakdown, `POST /teams/{id}/substitutions` |
| 4.4 Live standings | `/rounds/:id/standings` | SSE leaderboard (top 100) + rivals from challenge links |
| 5.1 Result, 5.2 Recap | `/rounds/:id/result`, `/rounds/:id/recap` | `GET /rounds/{id}/result` |
| 6.1–6.4 Leagues, league, create, creator league | `/leagues…` | **local demo data** |
| 7.1/7.2 Back a manager | `/back` | real live leaderboard + local fan points |
| 8.1 Rewards, 8.3 Voucher | `/rewards`, `/rewards/vouchers/:id` | wallet, gifts, purchase (Idempotency-Key), purchases, history |
| 8.2 Missions | `/rewards/missions` | progress from real play, rewards illustrative |
| 9.1 Profile, 9.2 Notifications, 9.3 Settings | `/profile`, `/notifications`, `/settings` | results + local inbox/settings |

The backend's rules differ from the mockup, and the UI follows the backend: five starters from **five different
countries** + one bench, free formation, **no credits** (the credits bar became a "countries" bar), captain ×2,
**late goals ×2 from 75'**, Home Hero = the starter from your home country, +2 per goal/assist outside multipliers,
one substitution active 60 s after confirming. Leagues, backing, missions and notifications are not in the backend
("Intentionally absent" in its README), so those screens run on local demo data and say so.

## PWA

* Manifest (standalone, maskable icons, shortcuts), Workbox precache of the app shell, SPA fallback for deep links,
  update prompt ("A new version is ready"), install prompt on Android/desktop and Add-to-Home-Screen guide on iOS.
* Works offline as a shell (the game itself needs the server; offline shows a retry screen).
* Install/push need a **secure context**: `localhost` or HTTPS. To try it on a phone, tunnel the dev/preview server:

  ```sh
  npx cloudflared tunnel --url http://localhost:5173
  ```

  Open the `https://….trycloudflare.com` URL on the phone (Vite already allows `*.trycloudflare.com`,
  `*.ngrok-free.app`, `*.loca.lt`). Plain `http://192.168.x.x` will not install and has no service worker.

## Tactical alerts (design 4.1) — Web Push

**Yes, lock-screen notifications are possible from a PWA**, with these platform rules:

| Platform | Lock-screen push with the app closed |
| --- | --- |
| Android (Chrome, Edge, Samsung Internet, Firefox) | ✅ in the browser and as an installed app |
| iOS / iPadOS 16.4+ | ✅ **only after "Add to Home Screen"**, permission asked from a tap inside the installed app |
| iOS < 16.4 | ❌ (in-app banners only) |
| Desktop Chrome / Edge / Firefox / Safari (macOS 13+) | ✅ |

What the app does:

1. Opt-in from a tap (Home card, 3.5 review toggle, Settings) → `Notification.requestPermission()` →
   `pushManager.subscribe()` with the server's VAPID key → subscription sent to the server.
2. `src/lib/liveDiff.js` turns consecutive SSE snapshots + score breakdowns into alerts: **points events**
   ("+20 pts · Osimhen scored! Late goal ×2 · Captain ×2"), **sub moments** (a starter booked while your sub is
   available), **sub activated**, **lock reminder** (30 min before the deadline) and **full time** recap.
3. While the app is open the same alerts appear as in-app banners and in the inbox (9.2).
4. The service worker (`src/sw.js`) shows pushes, deep-links taps to the right screen and stores alerts that arrive
   while the app is closed so the inbox stays complete.

The backend has no push sender yet, so **`server/push-relay.mjs` (runs inside `vite`/`vite preview`) implements
it for development**: it keeps subscriptions, follows each subscribed user's SSE streams and sends real Web Push
(VAPID, aes128gcm via FCM/Mozilla/Apple). Checked against a local HTTPS push-service stub: test, lock-reminder,
points and full-time pushes arrived with VAPID auth and decrypted with the device keys; delivery through the real
FCM/APNs still has to be confirmed on a phone. **Settings → Send a test alert** pushes a sample in 5 s — lock the
phone to see it.

For production the backend should implement the same contract (the client needs no changes):

```
GET    /api/v1/push/config         → { "vapidPublicKey": "<base64url P-256 public key>" }
POST   /api/v1/push/subscriptions  ← { "subscription": PushSubscriptionJSON, "prefs": { "enabled", "tactical", "lock", "recaps", "social", "quietHours", "tzOffset" } }
DELETE /api/v1/push/subscriptions  ← { "endpoint": "…" }
POST   /api/v1/push/test           ← { "delaySeconds": 5, "title", "body", "url" }   (optional)
Push payload (JSON, encrypted): { "id", "type": "points|sub_moment|sub_active|lock|result", "title", "body", "tag", "url", "roundId", "createdAt", "requireInteraction"? }
```

Triggers can reuse the scoring events the backend already has (goal/assist of a team's active player, a card on a
starter while `subsRemaining > 0`, pending substitution activation, settlement, `entryDeadline − 30 min`).
Java: `nl.martijndwars:web-push` or `com.interaso:webpush`. Keep it to ~3 pushes per round (the relay caps points alerts at 3).

## Sharing with a friend (design 3.6)

**Possible and implemented:**

* **Challenge a friend** — native share sheet (Web Share API level 2) with a rendered PNG squad card + text + link.
  Works on Android Chrome, iOS/iPadOS Safari and installed PWAs; on desktops without a share sheet the text is copied.
* **WhatsApp** — `https://wa.me/?text=…` deep link (opens the app on phones, WhatsApp Web on desktop).
* **Story** — a 1080×1920 story image through the share sheet (pick Instagram/WhatsApp Status), or downloaded where
  file sharing is unsupported.
* **Copy link** — Clipboard API with a fallback.

The link `/c/<code>` packs round id, team id, the five player ids, captain/hero and the name into ~160 url-safe
characters (`src/lib/challenge.js`), because the backend has no challenge endpoint. The friend lands on the same round,
sees the five to beat (players fetched by id) and builds theirs; the challenger is then highlighted as a rival in the
live standings and in league rivalries. Limitations: on iOS links open in Safari, not in the installed app
(no link capturing); rich previews in chats use the static `og:image` (set `PUBLIC_URL` for an absolute URL) —
per-squad previews would need server-side rendered OG tags.

## Rewards, profile, friends (backend update of 29 Oct, `docs/profile-play-rewards-api.md`)

* **Rewards** reads `GET /rewards/catalogue`, which has two categories:
  * **SportyBet Rewards** are free, claimable once, and unlocked by lifetime leaderboard points:
    Referral 0, Free Bet 500, Cashback 3,000, Lucky Wheel 5,000.
  * **Sporty Merch** costs RP: Cap 3,000, T-shirt 4,500, Hoodie 6,000.

  Claiming and buying both go through `POST /gifts/{id}/purchases`. A claimed Lucky Wheel gives one
  spin on this device. The creatives come from `public/rewards/*.webp`.
* **Profile** reads `/me/profile`: XP and level, stats, badges, top Home Hero, history and overall rank.
  The **overall leaderboard** is at `/leaderboard`, from `GET /leaderboard`.
* **Friends and invitations:**
  * On *Squad locked in*, use "Invite friends to this round".
  * The recipient sees an invitation card on Home with Accept & join, which auto-picks a five, or Decline.
* **Play:**
  * Format chips come from `round.format` (Quick, Matchday, Special), and player counts from `participantCount`.
  * `/me/round-history` tells which rounds need `/my-team`.
* **Older backends** answer 404 on these endpoints. The app then falls back to the bundled catalogue
  (`src/mock/rewards.js`), computes the profile locally, and hides friends. The mock
  (`dev:mock` and GitHub Pages) implements all of them.

Run a second backend next to yours (new version, own database):

```bash
BACKEND_PORT=8081 BACKEND_DB=sportystreet_v6 npm run backend
```

```bash
API_TARGET=http://localhost:8081 npm run dev
```

## Social screens (community API)

Leagues, Rivalries, Banter, creator leagues and Back a manager read the backend's read-only community
API (`GET /leagues…`, `/backing/managers`, see the backend's `docs/community-api.md`). Avatars come from
`avatarUrl` in `/me`, leaderboards and community objects. A backend without these endpoints answers
404. In that case the app uses the bundled port of `CommunityService` (`src/mock/community.js`),
so the screens look the same. Joining or creating leagues, quick messages, reactions and backings
with fan points are local previews.

After a backend update, run `npm run sync-media ../sporty-street`. It refreshes `public/media`
(players, avatars, league art and their credits) and `src/mock/community-seed.js`.

## Hosting

### GitHub Pages (static demo, no backend)

GitHub Pages serves files only, so the Java backend cannot run there. The static build runs the game server in the
browser instead (`VITE_STATIC=1`): `src/mock/core.js` answers every API call and replaces the SSE stream, and its state
is saved in `localStorage`.

* **Rounds run on a shared clock.** A new round kicks off every 6 minutes (`VITE_ROUND_EVERY_MIN`). Each round has two
  open rounds queued behind it, 16–24 bot managers, and a seeded, realistic match script: goals, assists, cards, VAR
  corrections and the late-goal twist. The round plays 90 minutes in about 3 minutes and settles itself. Every device
  computes the same events at the same time, so a challenge link puts the friend's five into the same round on the
  other phone, and it scores the same there.
* Close the app and come back later: the rounds catch up, finished rounds are settled, and RP is credited.
* Alerts arrive while the app is open, including in a background tab, as system notifications: kick-off, goals, cards,
  sub moment, sub active, half-time, the twist window, rank moves and full time. **Lock-screen push with the app
  closed needs a server**, which Pages does not have.
* Each player starts with 100 RP (a `WELCOME` entry), so gifts can be redeemed straight away.

Deploy:

1. Copy the backend's photos into `public/media` with `npm run sync-media`, then commit them. The static build has no
   backend to serve `/media`. `vite preview` also serves them before proxying to the backend.
2. On GitHub, open Settings → Pages → Source and choose **GitHub Actions**.
3. Push to `main`. `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and deploys the site to
   `https://<owner>.github.io/<repo>/`.

Locally:

```bash
npm run dev:static
```

```bash
BASE_PATH=/sporty-street-fe/ npm run build:static && npm run preview:static
```

### Frontend on Render (or any Node host) with the real backend

`vite preview` serves `dist/` and proxies `/api` and `/media` to `API_TARGET`. For a hosted backend the proxy
rewrites `Host` (`changeOrigin`), so routing by host (Render, Fly, Railway) works. `*.onrender.com` is allowed. Add
other hosts with `ALLOWED_HOSTS=a.example.com,.example.org`.

```bash
API_TARGET=https://<backend>.onrender.com npm run build && API_TARGET=https://<backend>.onrender.com npx vite preview --host 0.0.0.0 --port $PORT
```

The browser only ever talks to the frontend origin, so the backend needs no CORS and keeps its cookie session.

## Round stream — notes for the backend

`GET /api/v1/rounds/{id}/stream` (`LiveController`) is consumed by `src/stores/live.js`. It drives Live tactics,
Standings and every in-app alert, and the push relay polls the same data. What would help:

1. **Match clock.** The snapshot has no match minute. The app polls `GET /dev/simulator` for it, which exists only
   in the `local` profile, so in production there is no minute, no half-time and no twist countdown. Add
   `payload.clock = { matchMinute, phase: PRE|LIVE|HT|FT }`, as the mock does.
2. **Live scores and events.** Nothing in the payload says what happened in the matches; only the team breakdown
   does, after a separate `GET /teams/{id}/score-breakdown`. Add `payload.matches[]` with fixtureId, club names,
   home/away goals and the last ~8 events (minute, type, playerId, playerName, side). The mock sends exactly this,
   and the UI ("Around the grounds") already reads it.
3. **Full snapshot every 2 s for every client.** `publish()` rebuilds round, team, standings and result for each
   connection every 2 s, even when nothing changed: N clients × 2 transactions per second. Send only when
   `stateVersion` changed, or cache one envelope per round and version, and add the user's team on top.
4. **Breakdown in the stream.** Add `myTeam.timeline`, or a `breakdownVersion`. The app currently refetches
   `/score-breakdown` on every score change.
5. **Reconnect.** There is no `id:` field and no `retry:`. Send `id: <stateVersion>` and `retry: 3000`, so
   `Last-Event-ID` works and clients back off evenly.
6. **Lifecycle.** The emitter timeout is 30 minutes, after which the client reconnects, which is fine. Complete the
   emitters of a settled round after the final snapshot so connections do not linger. Settled rounds are also
   streamed every 2 s forever.
7. **Auth.** `EventSource` cannot send headers, so the stream relies on the `dev_user` cookie (`Path=/api`). Keep
   cookie auth working for this endpoint when real login arrives.

## Project structure

```
server/            dev-only Node helpers (not shipped)
  mock-api.mjs     HTTP + SSE wrapper around src/mock/core.js (`npm run dev:mock`)
  push-relay.mjs   Web Push sender + subscription store (see above)
  vite-plugin.mjs  mounts both into vite dev/preview
src/
  mock/            backend mock shared by Node and the static build: core.js (contract, scoring, simulator,
                   autopilot schedule), data.js (seed, same ids as the backend), md5.js
  api/             fetch client (errors, 401 re-login, idempotent retries) and endpoints; local.js runs the
                   mock in the page for the static build
  stores/          reactive stores: session, rounds, draft, live (SSE), notify, rewards, demo, missions
  lib/             liveDiff (alerts), challenge links, share + canvas cards, PWA, formatting, rules copy
  components/      pitch, Home Hero card, sheets, alerts sheet, toasts…
  views/           one file per screen
  sw.js            service worker (precache, push, notification click)
```

## Backend facts the app relies on

Checked against the backend source (not only the OpenAPI snapshot):

* Round statuses `DRAFT → OPEN → LIVE → SETTLED`; an open round goes live automatically at its entry deadline.
  `GET /rounds` lists only OPEN and LIVE, so the app also loads `?status=SETTLED`; drafts are never listed
  (demo controls know the seed's draft id).
* Page size is limited to 100 (more → 400). A round has 60 players, loaded once and filtered in the app:
  the server's `position` filter is an exact match on `GK/DEF/MID/FWD`. `displayStats` is empty for now.
* Score lines: `BASE` (event type in `explanation`), `LATE_GOAL_BONUS`, `CAPTAIN_BONUS`, `HOME_HERO_BONUS`.
* `/result` answers `422 ROUND_NOT_SETTLED` before settlement. A substitution must keep five countries
  (`422 DUPLICATE_COUNTRY`), so a bench player can only replace the starter from his own country — the builder
  and the substitution sheet show this upfront. Settlement waits for pending subs and the simulator (`409 ROUND_BUSY`).
* The simulator gives every player the same events (goals at 5', 74', 75', 81', assists at 15', bookings at 30'),
  plus voided/corrected/delayed events and goals right at the substitution cut-off. Alerts from one snapshot are
  therefore grouped into a single notification, and the sub moment is sent once per round.
* Player photos are Wikimedia Commons images with per-photo licences (`/media/players/credits.json`); the
  **Photo credits** screen and the player sheet show author and licence, as the backend README asks.

## Notes

* Auth is the backend's local-profile mock (`/dev/login` cookie session, auto re-login on 401); real auth will
  replace `src/stores/session.js`.
* Live data follows the backend README: SSE snapshots replace state (newer `stateVersion`, or same version with
  newer `asOf`), the match minute comes from `GET /dev/simulator` locally, `409 VERSION_CONFLICT` reloads the team.
* Gift codes are demo entitlements; mission rewards and fan points are illustrative until those services exist.
