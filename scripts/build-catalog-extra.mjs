// Generates the Clash Book entries the community catalog never exposed.
//
//   node scripts/build-catalog-extra.mjs
//
// catalog.json is copied verbatim from the reference app by
// sync-reference-data.mjs, so it cannot be appended to -- the next sync would
// discard the additions. This writes a sibling file instead, and
// src/lib/clash-book.ts concatenates the two into BOOK_ITEMS.
//
// Three families are missing, all for the same reason: the walk that produced
// catalog.json only visits top-level category directories.
//
//   Super Troops   nested as `superTroop` inside the base troop's entry. All
//                  17 are already in catalog.json with full level tables --
//                  they were being shipped and never rendered.
//   Ruin Knight    nested as `ruinKnight` inside Ruin Witch, same story.
//   Clan Capital   a whole directory the reference app never imported. ~88
//                  items, already in catalog shape upstream.
//
// Artwork is the one thing that must come from the package: catalog.json
// strips every `images` field. Each generated entry carries an `imagePath`
// that build-assets.mjs resolves ahead of its usual sourcePath probe -- nested
// items share their parent's sourcePath, so without it Super Barbarian would
// be handed the plain Barbarian's icon.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COC_DATA = resolve(root, 'node_modules/clash-of-clans-data');
const DATA = join(COC_DATA, 'data');
const CATALOG = resolve(root, 'src/data/clash-book/catalog.json');
const OUT = resolve(root, 'src/data/clash-book/catalog-extra.json');

if (!existsSync(DATA)) {
  throw new Error('clash-of-clans-data is not installed -- run `bun install`');
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const extra = [];

/** `images.icon` for an upstream file, else the highest level's artwork. */
function iconFrom(node) {
  if (node?.images?.icon) return node.images.icon;
  const withArt = (node?.levels ?? []).filter((r) => r.images);
  const last = withArt[withArt.length - 1];
  return last ? (last.images.normal ?? Object.values(last.images)[0]) : undefined;
}

/** Reads the upstream file a catalog entry was generated from. */
function upstream(sourcePath) {
  if (!sourcePath) return undefined;
  const p = join(DATA, String(sourcePath).split(/[\\/]/).join(sep));
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined;
}

// ---------------------------------------------------------------------------
// Super Troops and Ruin Knight, lifted out of their base troop's entry.
//
// The nested object is already a complete item -- id, name, description,
// stats and a level table. It only needs the catalog's envelope fields and a
// `baseItemId` so the book can link the two cards in both directions.
// ---------------------------------------------------------------------------

/** Nested sub-items, keyed by the field they hang off the parent on. */
const NESTED = [
  { field: 'superTroop', category: 'super-troop' },
  { field: 'ruinKnight', category: 'troop' },
];

for (const parent of catalog) {
  for (const { field, category } of NESTED) {
    const node = parent[field];
    if (!node) continue;
    const up = upstream(parent.sourcePath);
    // `levels` is kept as-is: Super Troop levels continue the base troop's
    // numbering (Super Barbarian is levels 8-12, not 1-5), which is also what
    // the player API reports, so playerLevelIndex lines up untouched.
    const { images, ...rest } = node;
    extra.push({
      ...rest,
      id: `${parent.base}/${node.id}`,
      base: parent.base,
      category,
      baseItemId: parent.id,
      sourcePath: parent.sourcePath,
      imagePath: iconFrom(up?.[field]),
    });
  }
}

// ---------------------------------------------------------------------------
// Clan Capital -- a directory the reference app never imported at all.
// ---------------------------------------------------------------------------

/**
 * Upstream writes `clan_capital`; the app's village filter uses `capital`.
 *
 * Ids are namespaced the same way the rest of the catalog is, which is what
 * keeps the Clan Capital Super Barbarian apart from the Home Village one --
 * they share a name but nothing else, including their stats.
 */
const capital = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const rel = path.slice(DATA.length + 1).split(sep).join('/');
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      // The leagues and forge files are rate tables, not items: no id, and
      // nothing a Clash Book card could show.
      if (!item?.id || !item.category) continue;
      const { images, ...rest } = item;
      capital.push({
        ...rest,
        id: `capital/${item.id}`,
        base: 'capital',
        sourcePath: rel,
        imagePath: iconFrom(item),
        // Level rows carry artwork paths the catalog strips everywhere else.
        levels: (item.levels ?? []).map(({ images: _drop, ...row }) => row),
      });
    }
  }
})(join(DATA, 'clan-capital'));
extra.push(...capital);

// ---------------------------------------------------------------------------
// Items the dataset has no entry for at all.
//
// B.O.T.O's Shack is the only id in a real village export that resolves to
// nothing (dataId 1000047, confirmed against a player's own id table). Without
// a stub it is dropped silently at import, which is the failure mode this
// whole file exists to stop.
// ---------------------------------------------------------------------------
extra.push({
  id: 'builder/botos-shack',
  name: "B.O.T.O's Shack",
  description:
    'Not covered by the community reference. Recognised on import so it is not silently dropped, but no level table or upgrade costs are available for it.',
  base: 'builder',
  category: 'other',
  levels: [],
  // Neither the fan kit nor the package has artwork for it, so build-assets
  // skips it instead of reporting a missing image.
  noArtwork: true,
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(extra, null, 2)}\n`);

const count = (c) => extra.filter((i) => i.category === c).length;
console.log(`catalog extra: ${extra.length} entries -> ${OUT.slice(root.length + 1)}`);
console.log(`  super troops: ${count('super-troop')}`);
console.log(`  clan capital: ${capital.length}`);
console.log(`  other:        ${extra.length - count('super-troop') - capital.length}`);

const noArt = extra.filter((i) => !i.imagePath);
if (noArt.length) console.log(`  no imagePath: ${noArt.map((i) => i.id).join(', ')}`);
