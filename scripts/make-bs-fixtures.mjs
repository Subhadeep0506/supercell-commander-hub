// Extracts the Brawl Stars fixtures from the captured API dumps.
//
//   node scripts/make-bs-fixtures.mjs
//   bun run build:bs-fixtures
//
// Unlike scripts/make-fixtures.mjs, which *invents* Clash of Clans responses,
// almost everything here is a real captured 200. bsproxy.royaleapi.dev answers
// a Zscaler 403 on this network -- so does cocproxy, while Clash Royale's
// proxy works -- which means the Brawl Stars screens can never be rendered
// against the live service here. These are the only way to see them at all.
//
// Source of record: native/brawl-stars-player-api-dump_v2.json, captured from
// #Q8R0UP09R (79,407 trophies, 108 brawlers, Gold I) and his club
// #80UP98LY8. The first dump is not used -- its battlelog 404'd, which is the
// whole reason a second capture exists.
//
// Two fixtures are synthetic and say so in the file: the player and club
// ranking ladders were never captured in either dump. They are built from the
// PlayerRanking row shape the brawler ladder *did* return, so the screens have
// something to render, and the parser treats a bare array and an {items}
// envelope alike in case the real thing differs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'scripts/fixtures');
const DUMP = resolve(root, '../brawl-stars-player-api-dump_v2.json');

const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
const byId = new Map(dump.requests.map((r) => [r.id, r]));

function body(id, expectStatus = 200) {
  const request = byId.get(id);
  if (!request) throw new Error(`No request "${id}" in ${DUMP}`);
  if (request.response?.status !== expectStatus) {
    throw new Error(`Request "${id}" is ${request.response?.status}, expected ${expectStatus}`);
  }
  return request.response.body;
}

mkdirSync(OUT, { recursive: true });
const written = [];
function write(name, value) {
  writeFileSync(resolve(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  written.push(name);
}

/* ---- real captures ----------------------------------------------------- */

write('bs-player', body('player'));
write('bs-battlelog', body('player-battlelog'));
write('bs-club', body('club'));
write('bs-club-members', body('club-members'));
write('bs-brawlers', body('brawler-catalog'));
write('bs-brawler', body('battle-brawler-detail'));
write('bs-brawler-rankings', body('battle-brawler-rankings'));
write('bs-events', body('events-rotation'));
write('bs-gamemodes', body('game-modes'));

// A club member with an ordinary profile, for the roster fan-out.
write('bs-player-member', body('member-player'));

/*
 * The ghost.
 *
 * #2V09YC92LY appears in the battle log on a power-10 Dynamike with 1,267
 * trophies, and his profile answers 200 with zero trophies, expLevel 1, one
 * brawler and `club: {}`. Missing entirely: nameColor, rankedRankName,
 * highestSeasonRankedRankName, highestAllTimeRankedRankName.
 *
 * It is the only way to reach the "reset or inactive" notice, and the only
 * fixture that exercises every optional field being absent at once.
 */
write('bs-player-ghost', body('opponent-player'));

/* ---- synthetic --------------------------------------------------------- */


const seed = body('battle-brawler-rankings').items;
const TAG_ALPHABET = '0289PYLQGRJCUV';
function fakeTag(index) {
  let n = index + 1;
  let body = '';
  while (n > 0) {
    body = TAG_ALPHABET[n % TAG_ALPHABET.length] + body;
    n = Math.floor(n / TAG_ALPHABET.length);
  }
  return `#${body.padStart(5, '2')}`;
}

write('bs-rank-players', {
  _synthetic: 'Never captured. Rows follow the PlayerRanking schema; see make-bs-fixtures.mjs.',
  items: Array.from({ length: 25 }, (_, i) => {
    const base = seed[i % seed.length];
    return {
      tag: i < seed.length ? base.tag : fakeTag(i),
      name: i < seed.length ? base.name : `Brawler ${i + 1}`,
      nameColor: base.nameColor,
      icon: base.icon,
      trophies: 92000 - i * 1150,
      rank: i + 1,
      // Deliberately a name with no tag, matching the real shape.
      ...(i % 3 === 0 ? { club: { name: `Club ${i + 1}` } } : {}),
    };
  }),
  paging: { cursors: { after: 'eyJwb3MiOjI1fQ==' } },
});

write('bs-rank-clubs', {
  _synthetic: 'Never captured. Rows follow the ClubRanking schema; see make-bs-fixtures.mjs.',
  items: Array.from({ length: 25 }, (_, i) => ({
    tag: fakeTag(100 + i),
    name: `Top Club ${i + 1}`,
    trophies: 2400000 - i * 31000,
    rank: i + 1,
    memberCount: 30 - (i % 4),
    badgeId: 8000000 + (i % 60),
  })),
  paging: { cursors: { after: 'eyJwb3MiOjI1fQ==' } },
});

console.log(`Wrote ${written.length} fixtures to scripts/fixtures:`);
console.log(`  ${written.join('\n  ')}`);
