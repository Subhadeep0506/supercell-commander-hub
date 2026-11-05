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

const seasons = await capture('cr-seasons.json', { game: 'cr', resource: 'seasons' });
if (seasons) {
  const latest = [...new Set(seasons.items.map((s) => s.id))].pop();
  await capture('cr-path-of-legend.json', {
    game: 'cr',
    resource: 'pathOfLegend',
    season: latest,
    limit: 25,
  });
}

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
