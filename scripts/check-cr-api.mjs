// Drives every Clash Royale resource through the real connector, live.
//
//   node --use-system-ca scripts/check-cr-api.mjs
//   bun run check:cr-api
//
// This imports src/api/game-api.ts itself rather than restating its paths, so
// the two cannot drift: if `endpoint()` builds a URL the API rejects, this
// fails. Unlike the Clash of Clans checks, which run against generated
// fixtures because cocproxy is blocked here, the CR proxy is reachable -- so
// this is a real end-to-end test of the connector against Supercell.
//
// --use-system-ca is required. This machine does TLS inspection, so Node
// rejects every outbound HTTPS call with UNABLE_TO_GET_ISSUER_CERT_LOCALLY
// unless it is given the OS certificate store.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endpoint, gameRequestSchema } from '../src/api/game-api.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = {};
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = env.CR_PROXY_BASE || 'https://proxy.royaleapi.dev';
const KEY = env.CR_API_KEY;
if (!KEY) {
  console.error('CR_API_KEY is empty in .env. Nothing to check.');
  process.exit(1);
}


const TAG = process.env.CR_TAG ?? '#L8YV8P2CL';
const CLAN = process.env.CR_CLAN ?? '#QC8LCPUU';

let failures = 0;
const pass = (label, note) => console.log(`  ok   ${label.padEnd(26)} ${note}`);
const fail = (label, note) => {
  failures += 1;
  console.log(`  FAIL ${label.padEnd(26)} ${note}`);
};

const n = (v) => (Array.isArray(v) ? v.length : v == null ? 0 : 1);

/**
 * Validate through the schema, build the URL, fetch it, summarise the body.
 * A schema rejection is a failure here -- every request in this file is one
 * the app is expected to make.
 */
async function probe(label, request, shape) {
  const parsed = gameRequestSchema.safeParse(request);
  if (!parsed.success) {
    fail(label, `rejected by schema: ${parsed.error.issues[0]?.message}`);
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
    fail(label, `${path} -> ${error.message}`);
    return null;
  }
  const body = await response.text();
  if (!response.ok) {
    fail(label, `${path} -> ${response.status} ${body.slice(0, 70)}`);
    return null;
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    fail(label, `${path} -> 200 but body is not JSON`);
    return null;
  }
  pass(label, shape ? shape(json) : '200');
  return json;
}


function guard(label, request, expected) {
  const parsed = gameRequestSchema.safeParse(request);
  if (parsed.success) {
    fail(label, 'schema accepted a request it must reject');
    return;
  }
  const message = parsed.error.issues[0]?.message ?? '';
  if (expected && !message.includes(expected)) {
    fail(label, `rejected, but the message never mentions "${expected}": ${message}`);
    return;
  }
  pass(label, `rejected — ${message.slice(0, 58)}`);
}

console.log(`\nClash Royale connector, live against ${BASE}`);
console.log(`account ${TAG} · clan ${CLAN}\n`);

console.log('Player');
const player = await probe('player', { game: 'cr', resource: 'player', tag: TAG }, (j) =>
  `${j.name} · ${Object.keys(j).length} fields · ${n(j.cards)} cards · ${n(j.badges)} badges · ${n(j.achievements)} achievements`,
);
await probe('battles', { game: 'cr', resource: 'battles', tag: TAG }, (j) => {
  const modes = [...new Set(j.map((b) => b.gameMode?.name).filter(Boolean))];
  return `${j.length} battles · ${[...new Set(j.map((b) => b.type))].length} types · ${modes.length} modes`;
});
await probe('upcomingChests', { game: 'cr', resource: 'upcomingChests', tag: TAG }, (j) =>
  `${j.items.length} chests · indices ${j.items[0]?.index}..${j.items[j.items.length - 1]?.index}`,
);

console.log('\nCatalog');
const catalog = await probe('catalog', { game: 'cr', resource: 'catalog' }, (j) =>
  `${j.items.length} cards + ${j.supportItems?.length ?? 0} tower troops · ${j.items.filter((c) => c.maxEvolutionLevel > 0).length} evolve`,
);
if (player && catalog) {
  const owned = new Set((player.cards ?? []).map((c) => c.id));
  const locked = catalog.items.filter((c) => !owned.has(c.id)).length;
  pass('owned/locked split', `${owned.size} unlocked · ${locked} locked`);
}

console.log('\nClan');
await probe('clan', { game: 'cr', resource: 'clan', tag: CLAN }, (j) =>
  `${j.name} · ${j.members} members · score ${j.clanScore} · war trophies ${j.clanWarTrophies}`,
);
await probe('riverRace', { game: 'cr', resource: 'riverRace', tag: CLAN }, (j) =>
  `${j.state} · ${j.periodType} period ${j.periodIndex} · ${n(j.clans)} clans · ${n(j.periodLogs)} period logs`,
);
const log = await probe(
  'riverRaceLog',
  { game: 'cr', resource: 'riverRaceLog', tag: CLAN, limit: 3 },
  (j) => `${j.items.length} seasons · cursor ${j.paging?.cursors?.after ? 'present' : 'none'}`,
);
if (log?.paging?.cursors?.after) {
  await probe(
    'riverRaceLog page 2',
    { game: 'cr', resource: 'riverRaceLog', tag: CLAN, limit: 3, after: log.paging.cursors.after },
    (j) => `${j.items.length} seasons`,
  );
}
await probe('clanSearch', { game: 'cr', resource: 'clanSearch', name: 'KING SLAYERS' }, (j) =>
  `${j.items.length} clans`,
);

console.log('\nLadders');
await probe('locations', { game: 'cr', resource: 'locations' }, (j) =>
  `${j.items.length} locations · ${j.items.filter((l) => l.isCountry).length} countries`,
);
const seasons = await probe('seasons', { game: 'cr', resource: 'seasons' }, (j) => {
  const unique = [...new Set(j.items.map((s) => s.id))];
  return `${j.items.length} entries · ${unique.length} unique · ${unique[0]} .. ${unique[unique.length - 1]}`;
});
if (seasons) {
  const latest = [...new Set(seasons.items.map((s) => s.id))].pop();
  await probe(
    'pathOfLegend',
    { game: 'cr', resource: 'pathOfLegend', season: latest, limit: 3 },
    (j) => `season ${latest} · ${j.items.length} players · top elo ${j.items[0]?.eloRating}`,
  );
}
const boards = await probe('leaderboards', { game: 'cr', resource: 'leaderboards' }, (j) => {
  const named = j.items.filter((b) => b.name);
  return `${j.items.length} ladders · ${named.length} named · e.g. ${named[0]?.name}`;
});
if (boards) {
  const first = boards.items.find((b) => b.name) ?? boards.items[0];
  await probe(
    'leaderboardRankings',
    { game: 'cr', resource: 'leaderboardRankings', leaderboardId: first.id, limit: 3 },
    (j) => `${first.name ?? first.id} · ${j.items.length} players · top score ${j.items[0]?.score}`,
  );
}
await probe(
  'leaderboard clans',
  { game: 'cr', resource: 'leaderboard', board: 'clans', mode: 'home', limit: 3 },
  (j) => `${j.items.length} clans`,
);
await probe(
  'leaderboard clanwars',
  { game: 'cr', resource: 'leaderboard', board: 'clans', mode: 'war', locationId: 57000006, limit: 3 },
  (j) => `${j.items.length} clans (location 57000006)`,
);

console.log('\nTournaments');
await probe('globalTournaments', { game: 'cr', resource: 'globalTournaments' }, (j) =>
  j.items.length ? `${j.items.length} live` : 'none running (an empty list is the normal answer)',
);
const found = await probe(
  'tournamentSearch',
  { game: 'cr', resource: 'tournamentSearch', name: 'royale' },
  (j) => `${j.items.length} tournaments`,
);
if (found?.items?.length) {
  await probe(
    'tournament',
    { game: 'cr', resource: 'tournament', tag: found.items[0].tag },
    (j) => `${j.name} · ${j.status} · ${n(j.membersList)}/${j.maxCapacity} members`,
  );
}

console.log('\nGuards (these must be refused, not fetched)');
guard('cr player ladder', { game: 'cr', resource: 'leaderboard', board: 'players' }, 'pathOfLegend');
guard('cr leaderboard default', { game: 'cr', resource: 'leaderboard' }, 'pathOfLegend');
guard('cr currentwar', { game: 'cr', resource: 'war', tag: CLAN });
guard('cr warlog', { game: 'cr', resource: 'warLog', tag: CLAN });
guard('coc riverRace', { game: 'coc', resource: 'riverRace', tag: CLAN });
guard('coc clanwars ladder', { game: 'coc', resource: 'leaderboard', board: 'clans', mode: 'war' });
guard('pathOfLegend no season', { game: 'cr', resource: 'pathOfLegend' }, 'season');
guard('pathOfLegend bad season', { game: 'cr', resource: 'pathOfLegend', season: 'latest' });
guard('leaderboardRankings no id', { game: 'cr', resource: 'leaderboardRankings' });
guard('bad tag', { game: 'cr', resource: 'riverRace', tag: 'nope' });

console.log(
  failures ? `\n${failures} failed\n` : '\nAll Clash Royale resources reachable through the connector.\n',
);
process.exit(failures ? 1 : 0);
