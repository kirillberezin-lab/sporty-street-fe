// Seed data for the local mock, mirroring the Sporty Street backend's `local` profile
// (DemoSeed, GameSeed, RewardSeed and seed/football-2024-25.json in the backend repo).
// Ids use the same derivation as the backend — java.util.UUID.nameUUIDFromBytes — so ids
// are identical in the mock and in a freshly seeded backend. Runs in Node and in the browser.
import { md5 } from './md5.js'

/** java.util.UUID.nameUUIDFromBytes(name.getBytes(UTF_8)) */
export function uid(name) {
  const b = md5(name)
  b[6] = (b[6] & 0x0f) | 0x30
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// 2024/25 snapshot from the backend seed: [name, position, country code, imageUrl]
export const COUNTRY_DATA = [
  ['BRA', 'Brazil'],
  ['FRA', 'France'],
  ['ENG', 'England'],
  ['ESP', 'Spain'],
  ['ARG', 'Argentina'],
  ['DEU', 'Germany'],
  ['PRT', 'Portugal'],
  ['ITA', 'Italy'],
  ['NLD', 'Netherlands'],
  ['URY', 'Uruguay'],
  ['BEL', 'Belgium'],
  ['HRV', 'Croatia'],
  ['POL', 'Poland'],
  ['NOR', 'Norway'],
  ['EGY', 'Egypt'],
  ['HUN', 'Hungary'],
  ['COL', 'Colombia'],
  ['SCO', 'Scotland'],
  ['CAN', 'Canada'],
  ['KOR', 'South Korea'],
  ['MAR', 'Morocco'],
]
export const CLUB_DATA = [
  ['Real Madrid', 'ESP', [
    ['Thibaut Courtois', 'GK', 'BEL', '/media/players/thibaut-courtois.jpg'],
    ['Jude Bellingham', 'MID', 'ENG', '/media/players/jude-bellingham.jpg'],
    ['Vinícius Júnior', 'FWD', 'BRA', '/media/players/vinicius-junior.jpg'],
    ['Kylian Mbappé', 'FWD', 'FRA', '/media/players/kylian-mbappe.jpg'],
    ['Rodrygo', 'FWD', 'BRA', '/media/players/rodrygo.jpg'],
    ['Federico Valverde', 'MID', 'URY', '/media/players/federico-valverde.jpg'],
    ['Eduardo Camavinga', 'MID', 'FRA', '/media/players/eduardo-camavinga.jpg'],
    ['Aurélien Tchouaméni', 'MID', 'FRA', '/media/players/aurelien-tchouameni.jpg'],
    ['Luka Modrić', 'MID', 'HRV', '/media/players/luka-modric.jpg'],
    ['Ferland Mendy', 'DEF', 'FRA', '/media/players/ferland-mendy.jpg'],
  ]],
  ['FC Barcelona', 'ESP', [
    ['Marc-André ter Stegen', 'GK', 'DEU', '/media/players/marc-andre-ter-stegen.jpg'],
    ['Robert Lewandowski', 'FWD', 'POL', '/media/players/robert-lewandowski.jpg'],
    ['Lamine Yamal', 'FWD', 'ESP', '/media/players/lamine-yamal.jpg'],
    ['Raphinha', 'FWD', 'BRA', '/media/players/raphinha.jpg'],
    ['Pedri', 'MID', 'ESP', '/media/players/pedri.jpg'],
    ['Gavi', 'MID', 'ESP', '/media/players/gavi.jpg'],
    ['Frenkie de Jong', 'MID', 'NLD', '/media/players/frenkie-de-jong.png'],
    ['Ronald Araújo', 'DEF', 'URY', '/media/players/ronald-araujo.jpg'],
    ['Jules Koundé', 'DEF', 'FRA', '/media/players/jules-kounde.jpg'],
    ['Dani Olmo', 'MID', 'ESP', '/media/players/dani-olmo.jpg'],
  ]],
  ['Manchester City', 'ENG', [
    ['Ederson', 'GK', 'BRA', '/media/players/ederson.jpg'],
    ['Erling Haaland', 'FWD', 'NOR', '/media/players/erling-haaland.jpg'],
    ['Kevin De Bruyne', 'MID', 'BEL', '/media/players/kevin-de-bruyne.jpg'],
    ['Phil Foden', 'MID', 'ENG', '/media/players/phil-foden.jpg'],
    ['Bernardo Silva', 'MID', 'PRT', '/media/players/bernardo-silva.jpg'],
    ['Rodri', 'MID', 'ESP', '/media/players/rodri.jpg'],
    ['Rúben Dias', 'DEF', 'PRT', '/media/players/ruben-dias.jpg'],
    ['John Stones', 'DEF', 'ENG', '/media/players/john-stones.jpg'],
    ['İlkay Gündoğan', 'MID', 'DEU', '/media/players/ilkay-gundogan.jpg'],
    ['Jérémy Doku', 'FWD', 'BEL', '/media/players/jeremy-doku.jpg'],
  ]],
  ['Liverpool', 'ENG', [
    ['Alisson Becker', 'GK', 'BRA', '/media/players/alisson-becker.jpg'],
    ['Mohamed Salah', 'FWD', 'EGY', '/media/players/mohamed-salah.jpg'],
    ['Virgil van Dijk', 'DEF', 'NLD', '/media/players/virgil-van-dijk.jpg'],
    ['Trent Alexander-Arnold', 'DEF', 'ENG', '/media/players/trent-alexander-arnold.jpg'],
    ['Alexis Mac Allister', 'MID', 'ARG', '/media/players/alexis-mac-allister.jpg'],
    ['Dominik Szoboszlai', 'MID', 'HUN', '/media/players/dominik-szoboszlai.jpg'],
    ['Luis Díaz', 'FWD', 'COL', '/media/players/luis-diaz.jpg'],
    ['Cody Gakpo', 'FWD', 'NLD', '/media/players/cody-gakpo.jpg'],
    ['Darwin Núñez', 'FWD', 'URY', '/media/players/darwin-nunez.jpg'],
    ['Andrew Robertson', 'DEF', 'SCO', '/media/players/andrew-robertson.jpg'],
  ]],
  ['Bayern Munich', 'DEU', [
    ['Manuel Neuer', 'GK', 'DEU', '/media/players/manuel-neuer.jpg'],
    ['Harry Kane', 'FWD', 'ENG', '/media/players/harry-kane.jpg'],
    ['Jamal Musiala', 'MID', 'DEU', '/media/players/jamal-musiala.jpg'],
    ['Joshua Kimmich', 'MID', 'DEU', '/media/players/joshua-kimmich.jpg'],
    ['Thomas Müller', 'FWD', 'DEU', '/media/players/thomas-muller.jpg'],
    ['Leroy Sané', 'FWD', 'DEU', '/media/players/leroy-sane.jpg'],
    ['Serge Gnabry', 'FWD', 'DEU', '/media/players/serge-gnabry.jpg'],
    ['Alphonso Davies', 'DEF', 'CAN', '/media/players/alphonso-davies.jpg'],
    ['Kim Min-jae', 'DEF', 'KOR', '/media/players/kim-min-jae.jpg'],
    ['Michael Olise', 'FWD', 'FRA', '/media/players/michael-olise.jpg'],
  ]],
  ['Paris Saint-Germain', 'FRA', [
    ['Gianluigi Donnarumma', 'GK', 'ITA', '/media/players/gianluigi-donnarumma.jpg'],
    ['Achraf Hakimi', 'DEF', 'MAR', '/media/players/achraf-hakimi.jpg'],
    ['Marquinhos', 'DEF', 'BRA', '/media/players/marquinhos.jpg'],
    ['Nuno Mendes', 'DEF', 'PRT', '/media/players/nuno-mendes.jpg'],
    ['Vitinha', 'MID', 'PRT', '/media/players/vitinha.jpg'],
    ['Fabián Ruiz', 'MID', 'ESP', '/media/players/fabian-ruiz.jpg'],
    ['João Neves', 'MID', 'PRT', '/media/players/joao-neves.jpg'],
    ['Ousmane Dembélé', 'FWD', 'FRA', '/media/players/ousmane-dembele.jpg'],
    ['Bradley Barcola', 'FWD', 'FRA', '/media/players/bradley-barcola.jpg'],
    ['Gonçalo Ramos', 'FWD', 'PRT', '/media/players/goncalo-ramos.jpg'],
  ]],
]

export const COUNTRIES = COUNTRY_DATA.map(([code, name]) => ({ id: uid(`country:${code}`), code, name }))
const country = (code) => COUNTRIES.find((c) => c.code === code)

export const CLUBS = CLUB_DATA.map(([name, code], i) => ({ id: uid(`club:${i}`), name, countryId: country(code).id }))

export const PLAYERS = CLUB_DATA.flatMap(([, , players], c) =>
  players.map(([name, position, code, imageUrl], p) => ({
    id: uid(`player:${c}:${p}`),
    name,
    position,
    countryId: country(code).id,
    countryName: country(code).name,
    clubId: CLUBS[c].id,
    clubName: CLUBS[c].name,
    imageUrl,
    clubIndex: c,
    playerIndex: p,
  })),
)

const HOME = ['BRA', 'FRA', 'ENG', 'ESP', 'ARG', 'DEU']
export const USERS = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'henry'].map((username, i) => ({
  id: uid(`user:${username}`),
  username,
  displayName: username[0].toUpperCase() + username.slice(1),
  countryId: i < HOME.length ? country(HOME[i]).id : null,
  avatarUrl: `/media/avatars/${username}.jpg`, // V5__user_avatars + DemoSeed
}))

export const GIFTS = [
  ['Matchday Coffee', 'One coffee to enjoy on matchday.', 'FOOD'],
  ['Football Store Discount', '15% off your next football merchandise purchase.', 'SHOPPING'],
  ['Club Scarf', "A scarf in your favourite club's colours.", 'MERCH'],
].map(([name, description, category], i) => ({ id: uid(`gift:${i}`), name, description, category, imageUrl: null, priceRp: 50 * (i + 1) }))

/** Rules.defaults() */
export const RULES = {
  version: 1,
  starterCount: 5,
  benchCount: 1,
  distinctStarterCountries: true,
  base: { APPEARANCE: 1, GOAL: 5, ASSIST: 3, YELLOW_CARD: -1, RED_CARD: -3, OWN_GOAL: 0 },
  captainMultiplier: 2,
  homeHero: { GOAL: 2, ASSIST: 2, repeatable: true, multiplied: false },
  twist: { type: 'LATE_GOALS_X2', fromMatchMinute: 75, multiplier: 2 },
  subActivationDelaySeconds: 60,
  rewards: { participationRp: 50, winnerBonusRp: 100 },
}

/** GameSeed: round 1 OPEN, round 2 DRAFT; three fixtures (clubs 0–1, 2–3, 4–5) kicking off at the deadline. */
export function seedRounds(now = Date.now(), subDelaySeconds = RULES.subActivationDelaySeconds) {
  const start = now + 600_000
  return [1, 2].map((r) => ({
    id: uid(`round:${r}`),
    name: r === 1 ? 'European Superstars' : 'Champions Night',
    status: r === 1 ? 'OPEN' : 'DRAFT',
    entryDeadline: start,
    subWindowOpensAt: start,
    subWindowClosesAt: start + 21_600_000,
    rules: { ...RULES, subActivationDelaySeconds: subDelaySeconds },
    stateVersion: 0,
    settledAt: null,
    fixtures: [0, 1, 2].map((f) => ({
      id: uid(`fixture:${r}:${f}`),
      roundId: uid(`round:${r}`),
      provider: 'simulator',
      homeClubId: CLUBS[f * 2].id,
      homeClubName: CLUBS[f * 2].name,
      awayClubId: CLUBS[f * 2 + 1].id,
      awayClubName: CLUBS[f * 2 + 1].name,
      kickoffAt: start,
    })),
  }))
}
