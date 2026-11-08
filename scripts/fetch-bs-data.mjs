// Generates the Brawl Stars brawler metadata the API refuses to give us.
//
//   node --use-system-ca --no-warnings scripts/fetch-bs-data.mjs
//
// `/v1/brawlers` returns only `{id, name, starPowers, gadgets, gears,
// hyperCharges}`. No rarity, no class, no description, no artwork pointer. So
// a brawler card can show what you own and nothing about what the brawler *is*
// -- and the collection grid is the biggest thing on the Home screen.
//
// The gap is filled the same way `clash-of-clans-data` fills the Clash of Clans
// one: a static dataset, converted at build time into one small committed JSON,
// with no runtime dependency on the source. Here the source is the game's own
// csv_logic tables, mirrored per game version by tailsjs/brawl-stars-assets.
//
// Why GitHub raw rather than a data API: api.brawlify.com answers ECONNRESET on
// the development network and cdn.brawlify.com answers a Zscaler 403, while
// raw.githubusercontent.com is reachable. Every fetch in this repo that has to
// work from here goes through GitHub.
//
// Output: src/data/bs/brawler-meta.json, committed. Re-run only when Supercell
// ships new brawlers, after bumping BS_DATA_VERSION.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(root, 'src/data/bs');
const OUT = resolve(OUT_DIR, 'brawler-meta.json');

/**
 * The game version whose tables we read.
 *
 * Pinned deliberately. The upstream repo carries ~200 version directories and
 * adds one every few weeks; resolving "latest" at fetch time would mean two
 * runs a week apart could generate different data with no edit in between,
 * which is exactly the kind of drift a committed artefact exists to prevent.
 *
 * Bump by hand when new brawlers appear, then re-run and commit the result.
 * The validation below fails loudly if the pinned version has gone stale --
 * a brawler the live API knows about but these tables do not is a hard error,
 * not a silently missing rarity badge.
 */
const BS_DATA_VERSION = '70.648';
const BASE = `https://raw.githubusercontent.com/tailsjs/brawl-stars-assets/master/${BS_DATA_VERSION}/csv_logic/`;

/** The newest capture, used to validate that every live brawler resolves. */
const DUMP = resolve(root, '../brawl-stars-player-api-dump_v2.json');

/**
 * Supercell's CSV dialect.
 *
 * Two header rows -- column names, then column types -- before any data, and
 * fields may be quoted with embedded commas and doubled quotes. `characters.csv`
 * has 185 columns and `cards.csv` 1,551 rows, so a naive `split(',')` mangles
 * both: brawler names and ability descriptions contain commas.
 */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function csv(name) {
  const response = await fetch(BASE + name);
  if (!response.ok) {
    throw new Error(
      `${name} answered ${response.status}. Is BS_DATA_VERSION='${BS_DATA_VERSION}' still a directory in tailsjs/brawl-stars-assets?`,
    );
  }
  return parseCsv(await response.text());
}

/** Column index by name, from the first header row. */
const column = (rows, name) => rows[0].indexOf(name);

/** Data rows only: skip both header rows, drop continuation rows. */
const entities = (rows) => rows.slice(2).filter((r) => r[0] && r[0].trim());

console.log(`Reading csv_logic tables from game version ${BS_DATA_VERSION}...`);

/*
 * ---- class ---------------------------------------------------------------
 *
 * characters.csv lists every spawnable thing in the game -- brawlers, their
 * pets, turrets, bosses, loot boxes. Only `Type === 'Hero'` rows are brawlers,
 * and *their* order is the brawler id order: the nth Hero row is id
 * 16000000 + n. That is the only link between these tables and the API, which
 * shares no name with them -- Shelly is "ShotgunGirl" here, Brock is
 * "RocketGirl", Tara is "BlackHole".
 */
const characters = await csv('characters.csv');
const charType = column(characters, 'Type');
const charClass = column(characters, 'ClassArchetype');
const heroes = entities(characters).filter((r) => r[charType] === 'Hero');

/** brawler id -> { code, class }. `code` joins into cards.csv. */
const byId = new Map(
  heroes.map((row, index) => [
    16000000 + index,
    { code: row[0], className: row[charClass] || '' },
  ]),
);
console.log(`  characters.csv: ${heroes.length} Hero rows`);

/*
 * ---- rarity --------------------------------------------------------------
 *
 * cards.csv holds four-ish rows per brawler: the unlock card, a health card
 * and one per ability. Only the `unlock` row carries the brawler's own rarity;
 * the others are all `common` regardless of the brawler, so filtering on type
 * is not optional -- without it every brawler reads as Common.
 */
const cards = await csv('cards.csv');
const cardType = column(cards, 'Type');
const cardTarget = column(cards, 'Target');
const cardRarity = column(cards, 'Rarity');
const rarityByCode = new Map();
for (const row of entities(cards)) {
  if (row[cardType] === 'unlock' && row[cardRarity]) {
    rarityByCode.set(row[cardTarget], row[cardRarity]);
  }
}
console.log(`  cards.csv: ${rarityByCode.size} unlock cards`);

/*
 * ---- ranked bands --------------------------------------------------------
 *
 * The player object gives `rankedElo` and `rankedRankName` but no sense of
 * progress -- "GOLD I, 1968" says nothing about how close the next tier is.
 * These rows carry the Elo band for each of the 19 ranks, so the Home screen
 * can draw a real meter instead of a bare number, and a per-tier colour.
 */
const ranks = await csv('ranked_ranks.csv');
const rankIdx = {
  rank: column(ranks, 'Rank'),
  min: column(ranks, 'MinELO'),
  max: column(ranks, 'MaxELO'),
  hex: column(ranks, 'HexColor'),
};
const rankedRanks = entities(ranks).map((row) => ({
  name: row[0],
  rank: Number(row[rankIdx.rank]),
  minElo: Number(row[rankIdx.min]),
  maxElo: Number(row[rankIdx.max]),
  // "0xFF9900" -> "#FF9900". Not the ARGB form `nameColor` uses.
  hex: `#${String(row[rankIdx.hex] || '').replace(/^0x/i, '')}`,
}));
console.log(`  ranked_ranks.csv: ${rankedRanks.length} ranks`);

/*
 * ---- validation ----------------------------------------------------------
 *
 * Every brawler the live API returns must resolve to both a class and a
 * rarity. A partial table would ship a grid where some cards silently lose
 * their rarity badge and their filter bucket -- which looks like a rendering
 * bug rather than stale data, and is the failure this check exists to make
 * impossible. Writing nothing is better than writing most of it.
 */
const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
const catalog = dump.requests.find((r) => r.id === 'brawler-catalog')?.response?.body?.items;
if (!Array.isArray(catalog) || !catalog.length) {
  throw new Error(`No brawler catalog found in ${DUMP}`);
}

const brawlers = {};
const missing = [];
for (const brawler of catalog) {
  const hero = byId.get(brawler.id);
  const rarity = hero ? rarityByCode.get(hero.code) : undefined;
  if (!hero?.className || !rarity) {
    missing.push(`${brawler.name} (${brawler.id}) class=${hero?.className || '-'} rarity=${rarity || '-'}`);
    continue;
  }
  brawlers[brawler.id] = { name: brawler.name, code: hero.code, class: hero.className, rarity };
}

if (missing.length) {
  throw new Error(
    `${missing.length} of ${catalog.length} brawlers did not resolve:\n  ${missing.join('\n  ')}\n` +
      `BS_DATA_VERSION='${BS_DATA_VERSION}' is probably older than the live game. Bump it and re-run.`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ version: BS_DATA_VERSION, brawlers, rankedRanks }, null, 2)}\n`,
);

const tally = (pick) =>
  Object.values(brawlers).reduce((acc, b) => ({ ...acc, [pick(b)]: (acc[pick(b)] || 0) + 1 }), {});
console.log(`\n${catalog.length}/${catalog.length} brawlers resolved.`);
console.log('  rarity:', tally((b) => b.rarity));
console.log('  class :', tally((b) => b.class));
console.log(`\nWrote ${OUT}`);
