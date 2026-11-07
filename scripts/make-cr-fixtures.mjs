// Captures REAL Clash Royale API responses into scripts/fixtures.
//
//   node --use-system-ca scripts/make-cr-fixtures.mjs
//   bun run build:cr-fixtures
//
// Unlike make-fixtures.mjs, which invents Clash of Clans responses because
// cocproxy.royaleapi.dev is blocked on this network, these are genuine
// captures -- the CR proxy is reachable. That makes them the first real
// fixtures in the project, and it means a shape change upstream shows up as a
// diff here rather than as a crash on a phone.
//
// Paths come from the app's own `endpoint()`, so the capture cannot drift from
// what the app requests.
//
// --use-system-ca is required: this machine does TLS inspection and Node
// otherwise fails every call with UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endpoint, gameRequestSchema } from '../src/api/game-api.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'scripts/fixtures');
mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = env.CR_PROXY_BASE || 'https://proxy.royaleapi.dev';
const KEY = env.CR_API_KEY;
if (!KEY) {
  console.error('CR_API_KEY is empty in .env.');
  process.exit(1);
}

const TAG = process.env.CR_TAG ?? '#L8YV8P2CL';
const CLAN = process.env.CR_CLAN ?? '#QC8LCPUU';

let failures = 0;

async function capture(file, request) {
  const parsed = gameRequestSchema.safeParse(request);
  if (!parsed.success) {
    failures += 1;
    console.log(`  FAIL ${file} — schema: ${parsed.error.issues[0]?.message}`);
    return null;
  }
  const path = endpoint(parsed.data);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${file} — ${error.message}`);
    return null;
  }
  const body = await response.text();
  if (!response.ok) {
    failures += 1;
    console.log(`  FAIL ${file} — ${response.status} ${body.slice(0, 60)}`);
    return null;
  }
  const json = JSON.parse(body);
  writeFileSync(resolve(OUT, file), `${JSON.stringify(json, null, 2)}\n`);
  const size = Array.isArray(json) ? `${json.length} rows` : `${Object.keys(json).length} keys`;
  console.log(`  ok   ${file.padEnd(28)} ${size}`);
  return json;
}


async function peek(request) {
  const parsed = gameRequestSchema.safeParse(request);
  if (!parsed.success) return null;
  try {
    const response = await fetch(`${BASE}${endpoint(parsed.data)}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(25000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * The last `count` finished months, newest first.
 *
 * A copy of the fallback in src/lib/royale-ladders.ts rather than an import:
 * that module resolves `@/api/game-api` through the bundler's alias, which
 * plain Node has no idea about.
 */
function finishedMonths(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (i + 1), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

console.log(`\nCapturing Clash Royale fixtures from ${BASE}`);
console.log(`account ${TAG} · clan ${CLAN}\n`);

await capture('cr-player.json', { game: 'cr', resource: 'player', tag: TAG });
await capture('cr-battlelog.json', { game: 'cr', resource: 'battles', tag: TAG });
await capture('cr-chests.json', { game: 'cr', resource: 'upcomingChests', tag: TAG });
await capture('cr-cards.json', { game: 'cr', resource: 'catalog' });
await capture('cr-clan.json', { game: 'cr', resource: 'clan', tag: CLAN });
await capture('cr-river-race.json', { game: 'cr', resource: 'riverRace', tag: CLAN });
await capture('cr-river-race-log.json', { game: 'cr', resource: 'riverRaceLog', tag: CLAN, limit: 10 });
await capture('cr-clan-search.json', { game: 'cr', resource: 'clanSearch', name: 'KING SLAYERS' });
await capture('cr-locations.json', { game: 'cr', resource: 'locations' });

/*
 * Seasons are derived from the clock rather than read off the response.
 *
 * The list intermittently answers with all 145 ids `null` -- caught live on
 * 2026-11-07 -- and the old `[...new Set(items.map(s => s.id))].pop()` then
 * produced `null`, so the Path of Legend capture 400'd and left a stale
 * fixture behind with no error anyone would notice. Season ids are calendar
 * months; walking back from today needs no endpoint. Same fallback the app
 * uses, see seasonIds in src/lib/royale-ladders.ts.
 */
await capture('cr-seasons.json', { game: 'cr', resource: 'seasons' });
let polSeason = null;
for (const season of finishedMonths(3)) {
  const rankings = await capture('cr-path-of-legend.json', {
    game: 'cr',
    resource: 'pathOfLegend',
    season,
    limit: 25,
  });
  if (rankings?.items?.length) {
    polSeason = season;
    /*
     * A ranked battle log, which nothing else in this directory contains.
     *
     * Every other CR battle fixture is the calibration account, which sits
     * below Legend arena and so only ever plays Trophy Road -- `type: "PvP"`,
     * a real `arena`, and a `leagueNumber` permanently stuck at 1. A ranked
     * battle is the mirror image: `type: "pathOfLegend"`, a meaningful
     * `leagueNumber`, and an `arena` that reads "Legendary Arena" whatever
     * league it was. The meta aggregation turns on telling those two apart,
     * so it needs one of each to test against.
     *
     * Top-ranked accounts play a lot of friendlies, so this walks down the
     * leaderboard until it finds a log that actually holds ranked battles.
     */
    for (const player of rankings.items.slice(0, 6)) {
      const log = await peek({ game: 'cr', resource: 'battles', tag: player.tag });
      if (Array.isArray(log) && log.some((b) => b?.type === 'pathOfLegend')) {
        await capture('cr-ranked-battlelog.json', {
          game: 'cr',
          resource: 'battles',
          tag: player.tag,
        });
        break;
      }
    }
    break;
  }
}
if (!polSeason) console.log('  note  no Path of Legend season answered; rankings not captured');

const boards = await capture('cr-leaderboards.json', { game: 'cr', resource: 'leaderboards' });
if (boards) {
  const first = boards.items.find((b) => b.name) ?? boards.items[0];
  await capture('cr-leaderboard-rankings.json', {
    game: 'cr',
    resource: 'leaderboardRankings',
    leaderboardId: first.id,
    limit: 25,
  });
}

await capture('cr-rank-clans.json', {
  game: 'cr',
  resource: 'leaderboard',
  board: 'clans',
  mode: 'home',
  limit: 25,
});
await capture('cr-rank-clanwars.json', {
  game: 'cr',
  resource: 'leaderboard',
  board: 'clans',
  mode: 'war',
  limit: 25,
});
await capture('cr-global-tournaments.json', { game: 'cr', resource: 'globalTournaments' });
// `/v1/events` -- a bare array of what is playable now. No timestamps at all,
// so Today lists these without a countdown. `description` is null for several.
await capture('cr-events.json', { game: 'cr', resource: 'events' });

console.log(
  failures ? `\n${failures} capture(s) failed\n` : `\nCaptured into scripts/fixtures.\n`,
);
process.exit(failures ? 1 : 0);
