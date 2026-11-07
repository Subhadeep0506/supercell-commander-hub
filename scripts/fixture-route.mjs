// Shared fixture routing for the browser-check scripts.
//
// Both check-web.mjs and check-screens.mjs intercept the Clash of Clans proxy
// and answer from scripts/fixtures. Keeping the mapping here stops the two
// from drifting -- the first time they did, half the ranking assertions failed
// against a 404 rather than against the app.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, 'fixtures');


const CDN_STANDIN = resolve(here, '../src/assets/img/nav/clan.webp');

/**
 * Set FIXTURE_WARLOG=private to answer the war log with a bare 403, which is
 * what the real API returns for a clan that keeps its log private. That branch
 * has its own empty state and is otherwise unreachable from here.
 */
const PRIVATE_WAR_LOG = process.env.FIXTURE_WARLOG === 'private';

/**
 * Set FIXTURE_CDN=block to fail every CDN image instead of standing one in.
 *
 * That is what a restricted network actually does, and it is the only way to
 * see the bundled fallbacks -- with the stand-in answering, every remote badge
 * "succeeds" and the fallback branch never runs.
 */
const BLOCK_CDN = process.env.FIXTURE_CDN === 'block';


const NO_LEAGUE = process.env.FIXTURE_CWL === 'none';

/**
 * The 56 possible league wars live in one file keyed by war tag rather than 56
 * files, so `/clanwarleagues/wars/{tag}` is looked up rather than mapped.
 */
const LEAGUE_WARS = resolve(FIXTURES, 'coc-league-wars.json');


export function fixtureFor(url) {
  // Must precede the /currentwar rule: the league group hangs off that same
  // path, so the looser pattern would answer it with the regular-war fixture
  // and the league tab would render a war that is not in any league.
  if (/\/currentwar\/leaguegroup/.test(url)) return 'coc-league-group.json';
  if (/\/currentwar/.test(url)) return 'coc-war.json';
  // Both sit under /clans/{tag}/, so they must precede the /clans/ catch-all.
  if (/\/capitalraidseasons/.test(url)) {
    return /[?&]after=/.test(url) ? 'coc-capital-raids-2.json' : 'coc-capital-raids.json';
  }
  if (/\/warlog/.test(url)) return 'coc-war-log.json';
  if (/rankings\/capitals/.test(url)) return 'coc-rank-clans-capital.json';
  if (/rankings\/clans-builder-base/.test(url)) return 'coc-rank-clans-builder.json';
  if (/rankings\/clans/.test(url)) return 'coc-rank-clans-home.json';
  if (/rankings\/players-builder-base/.test(url)) return 'coc-rank-players-builder.json';
  // The one paged ladder, so the cursor walk the boards now do is exercised.
  // Page two has ranks 26-50, which is how a check tells a real second page
  // from the first one served twice.
  if (/rankings\/players/.test(url)) {
    return /[?&]after=/.test(url) ? 'coc-rank-players-home-2.json' : 'coc-rank-players-home.json';
  }
  if (/\/locations\?/.test(url)) return 'coc-locations.json';
  if (/\/clans\?name=/.test(url)) return 'coc-clans-search.json';
  if (/\/clans\//.test(url)) return 'coc-clan.json';
  if (/\/players\//.test(url)) return 'coc-player.json';
  return null;
}



let topTags;
function isTopLadderTag(url) {
  if (!topTags) {
    try {
      const pol = JSON.parse(readFileSync(resolve(FIXTURES, 'cr-path-of-legend.json'), 'utf8'));
      topTags = new Set((pol.items ?? []).map((p) => String(p.tag).replace('#', '').toUpperCase()));
    } catch {
      topTags = new Set();
    }
  }
  const tag = /\/players\/([^/]+)\//.exec(url)?.[1] ?? '';
  return topTags.has(decodeURIComponent(tag).replace('#', '').toUpperCase());
}

export function crFixtureFor(url) {
  if (/\/players\/[^/]+\/battlelog/.test(url)) {
    return isTopLadderTag(url) ? 'cr-ranked-battlelog.json' : 'cr-battlelog.json';
  }
  if (/\/players\/[^/]+\/upcomingchests/.test(url)) return 'cr-chests.json';
  if (/\/players\//.test(url)) return 'cr-player.json';
  if (/\/currentriverrace/.test(url)) return 'cr-river-race.json';
  if (/\/riverracelog/.test(url)) return 'cr-river-race-log.json';
  if (/\/clans\?name=/.test(url)) return 'cr-clan-search.json';
  if (/\/clans\//.test(url)) return 'cr-clan.json';
  if (/\/cards/.test(url)) return 'cr-cards.json';
  // Path of Legend must precede the bare rankings rule -- it lives under
  // /locations/global/pathoflegend/{season}/rankings/players.
  if (/\/pathoflegend\//.test(url)) return 'cr-path-of-legend.json';
  if (/rankings\/clanwars/.test(url)) return 'cr-rank-clanwars.json';
  if (/rankings\/clans/.test(url)) return 'cr-rank-clans.json';
  if (/\/locations\/global\/seasons/.test(url)) return 'cr-seasons.json';
  // Singular `/leaderboard/{id}` is the rankings call; plural is the registry.
  if (/\/leaderboards/.test(url)) return 'cr-leaderboards.json';
  if (/\/leaderboard\//.test(url)) return 'cr-leaderboard-rankings.json';
  if (/\/globaltournaments/.test(url)) return 'cr-global-tournaments.json';
  // A bare array of what is playable now, with no timestamps on it at all.
  if (/\/v1\/events(\?|$)/.test(url)) return 'cr-events.json';
  if (/\/locations\?/.test(url)) return 'cr-locations.json';
  return null;
}


const bsGhost = () => process.env.FIXTURE_BS_PLAYER === 'ghost';


const BS_OWNER = 'Q8R0UP09R';


export function bsFixtureFor(url) {
  if (/\/players\/[^/]+\/battlelog/.test(url)) return 'bs-battlelog.json';
  if (/\/players\//.test(url)) {
    if (bsGhost()) return 'bs-player-ghost.json';
    const tag = decodeURIComponent(/\/players\/([^/?]+)/.exec(url)?.[1] ?? '').toUpperCase();
    return tag.includes(BS_OWNER) ? 'bs-player.json' : 'bs-player-member.json';
  }
  if (/\/clubs\/[^/]+\/members/.test(url)) return 'bs-club-members.json';
  if (/\/clubs\//.test(url)) return 'bs-club.json';
  // Per-brawler ladders must precede the bare rankings rules.
  if (/rankings\/[^/]+\/brawlers\//.test(url)) return 'bs-brawler-rankings.json';
  if (/rankings\/[^/]+\/clubs/.test(url)) return 'bs-rank-clubs.json';
  if (/rankings\/[^/]+\/players/.test(url)) return 'bs-rank-players.json';
  // `/brawlers/{id}` before the bare catalog, same reasoning.
  if (/\/brawlers\/\d+/.test(url)) return 'bs-brawler.json';
  if (/\/brawlers/.test(url)) return 'bs-brawlers.json';
  if (/\/events\/rotation/.test(url)) return 'bs-events.json';
  if (/\/gamemodes/.test(url)) return 'bs-gamemodes.json';
  return null;
}


const WAR_DAY = process.env.FIXTURE_CR_RACE === 'warday';


const WITH_POL = process.env.FIXTURE_CR_POL === 'present';


const LIVE_TOURNAMENT = process.env.FIXTURE_CR_TOURNAMENT === 'live';

function liveTournaments() {
  const stamp = (offsetMs) => {
    const d = new Date(Date.now() + offsetMs);
    const p = (n) => String(n).padStart(2, '0');
    return (
      `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000Z`
    );
  };
  return {
    items: [
      {
        tag: '#GT2026A',
        title: 'Event_MegaDraftChallenge',
        startTime: stamp(-6 * 3600_000),
        endTime: stamp(30 * 3600_000),
        gameMode: { id: 72000006, name: 'MegaDraft' },
        maxLosses: 3,
        minExpLevel: 8,
        tournamentLevel: 11,
      },
    ],
  };
}

function playerWithPathOfLegend() {
  const player = JSON.parse(readFileSync(resolve(FIXTURES, 'cr-player.json'), 'utf8'));
  return {
    ...player,
    leagueStatistics: {
      currentSeason: { trophies: 8120, bestTrophies: 8300 },
      previousSeason: { id: '2026-10', trophies: 7905, bestTrophies: 8010 },
      bestSeason: { id: '2026-07', rank: 4120, trophies: 8402 },
    },
    currentPathOfLegendSeasonResult: { leagueNumber: 9, trophies: 1840, rank: null },
    lastPathOfLegendSeasonResult: { leagueNumber: 9, trophies: 1655, rank: 20314 },
    bestPathOfLegendSeasonResult: { leagueNumber: 10, trophies: 2290, rank: 8801 },
  };
}

function warDayRace() {
  const race = JSON.parse(readFileSync(resolve(FIXTURES, 'cr-river-race.json'), 'utf8'));
  return {
    ...race,
    periodType: 'warDay',
    periodIndex: 4,
    periodLogs: [
      {
        periodIndex: 3,
        items: (race.clans ?? []).map((clan, i) => ({
          clanTag: clan.tag,
          pointsEarned: 1200 - i * 150,
          progressStartOfDay: i * 100,
          progressEndOfDay: i * 100 + 1200 - i * 150,
          endOfDayRank: i + 1,
          progressEarned: 1200 - i * 150,
          numOfDefensesRemaining: 3 - i,
        })),
      },
    ],
  };
}


export async function serveFixtures(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();

    if (url.includes('api-assets.clashofclans.com') || url.includes('api-assets.clashroyale.com')) {
      if (BLOCK_CDN) return void req.abort();
      return void req.respond({
        status: 200,
        contentType: 'image/webp',
        body: readFileSync(CDN_STANDIN),
      });
    }

    if (url.includes('/api/cr/')) {
      // Must precede the generic /players/ rule below, and must not catch
      // /battlelog or /upcomingchests, which hang off the same path.
      if (WITH_POL && /\/players\/[^/]+(\?|$)/.test(url)) {
        return void req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(playerWithPathOfLegend()),
        });
      }
      if (LIVE_TOURNAMENT && /\/globaltournaments/.test(url)) {
        return void req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(liveTournaments()),
        });
      }
      if (WAR_DAY && /\/currentriverrace/.test(url)) {
        return void req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(warDayRace()),
        });
      }
      const crName = crFixtureFor(url);
      const crFile = crName ? resolve(FIXTURES, crName) : null;
      if (!crFile || !existsSync(crFile)) {
        return void req.respond({ status: 404, contentType: 'application/json', body: '{}' });
      }
      return void req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: readFileSync(crFile, 'utf8'),
      });
    }

    if (url.includes('/api/bs/')) {
      const bsName = bsFixtureFor(url);
      const bsFile = bsName ? resolve(FIXTURES, bsName) : null;
      if (!bsFile || !existsSync(bsFile)) {
        // A 404 is the honest answer for a path with no fixture, and it is
        // also what the service returns for an empty battle log -- which the
        // Stats screen has its own empty state for.
        return void req.respond({ status: 404, contentType: 'application/json', body: '{}' });
      }
      return void req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: readFileSync(bsFile, 'utf8'),
      });
    }

    if (!url.includes('/api/coc/')) return void req.continue();

    if (NO_LEAGUE && /\/currentwar\/leaguegroup/.test(url)) {
      return void req.respond({
        status: 404,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ reason: 'notFound' }),
      });
    }

    // One file, keyed by war tag. An unknown tag 404s exactly as the API does
    // once a season has rolled over and its wars have aged out.
    if (/\/clanwarleagues\/wars\//.test(url)) {
      const tag = decodeURIComponent(url.split('/clanwarleagues/wars/')[1] ?? '');
      const wars = existsSync(LEAGUE_WARS) ? JSON.parse(readFileSync(LEAGUE_WARS, 'utf8')) : {};
      const found = wars[tag];
      return void req.respond({
        status: found ? 200 : 404,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(found ?? { reason: 'notFound' }),
      });
    }

    if (PRIVATE_WAR_LOG && /\/warlog/.test(url)) {
      return void req.respond({
        status: 403,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ reason: 'accessDenied', message: 'War log is private.' }),
      });
    }

    const name = fixtureFor(url);
    const file = name ? resolve(FIXTURES, name) : null;
    if (!file || !existsSync(file)) {
      return void req.respond({ status: 404, contentType: 'application/json', body: '{}' });
    }
    req.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(file, 'utf8'),
    });
  });
}
