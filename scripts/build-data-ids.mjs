// Maps Supercell's numeric data IDs onto Clash Book catalog ids.
//
//   node scripts/build-data-ids.mjs
//
// The in-game village export identifies everything by a bare number --
// `{"data":1000012,"lvl":10,"cnt":4}` is four level-10 Air Defenses -- and
// carries no names at all. clash-of-clans-data puts that same number on every
// item as `dataId`, so this walks the package once and writes the lookup out.
//
// Generated rather than resolved at runtime: clash-of-clans-data is a
// devDependency of ~2,300 images and is not bundled, so the map has to be
// committed alongside the image registries for the APK to have it.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(root, 'node_modules/clash-of-clans-data/data');
const CATALOG = resolve(root, 'src/data/clash-book/catalog.json');
const CATALOG_EXTRA = resolve(root, 'src/data/clash-book/catalog-extra.json');
const OUT = resolve(root, 'src/data/clash-book/data-ids.json');


const OVERRIDES = {
  1000047: 'builder/botos-shack',
};

if (!existsSync(DATA)) {
  throw new Error('clash-of-clans-data is not installed -- run `bun install`');
}

/**
 * Upstream items carrying a dataId, indexed two ways.
 *
 * `bySourcePath` is the exact link -- the catalog records which upstream file
 * each entry was generated from. `byUpstreamId` is the fallback for the
 * fifteen-odd entries whose catalog id was renamed relative to upstream.
 */
const bySourcePath = new Map();
const byUpstreamId = new Map();
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const rel = path.slice(DATA.length + 1).split(sep).join('/');
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!item || item.dataId === undefined) continue;
      bySourcePath.set(rel, Number(item.dataId));
      if (item.id) byUpstreamId.set(String(item.id), Number(item.dataId));
    }
  }
})(DATA);

const catalog = [
  ...JSON.parse(readFileSync(CATALOG, 'utf8')),
  ...(existsSync(CATALOG_EXTRA) ? JSON.parse(readFileSync(CATALOG_EXTRA, 'utf8')) : []),
];

// Catalog ids are namespaced ("home/air-defense"); upstream ids are not
// ("air-defense"). The namespace is what keeps the two Wall entries apart, so
// it is the catalog id that gets stored.
const map = {};
const unlinked = [];
for (const item of catalog) {
  // Nested sub-items share their parent's source file, so resolving them here
  // would hand them the parent's dataId and overwrite it -- every base troop
  // with a Super Troop would then import as the Super Troop. None of them can
  // appear in a village export anyway: a Super Troop is a temporary boost and
  // the Ruin Knight is spawned, so neither is ever a thing you own.
  if (item.baseItemId) continue;

  // A village export covers the Home Village and Builder Base only, so Clan
  // Capital entries have nothing to decode -- and nineteen of them share a
  // bare id with a Home Village building ("wall", "inferno-tower"), which the
  // byUpstreamId fallback happily matched. Left in, capital/wall took over
  // dataId 1000010 and the player's 300 walls vanished from the Builder Plan.
  if (item.base === 'capital') continue;

  const dataId =
    (item.sourcePath ? bySourcePath.get(String(item.sourcePath).split(sep).join('/')) : undefined) ??
    byUpstreamId.get(String(item.id).split('/').pop());
  if (dataId === undefined) {
    unlinked.push(item.id);
    continue;
  }
  map[dataId] = item.id;
}

// Applied after the walk so a verified pair always wins over a slug collision.
const known = new Set(catalog.map((i) => i.id));
for (const [dataId, catalogId] of Object.entries(OVERRIDES)) {
  if (!known.has(catalogId)) {
    throw new Error(`override ${dataId} points at ${catalogId}, which is not in the catalog`);
  }
  map[dataId] = catalogId;
}

mkdirSync(dirname(OUT), { recursive: true });
const sorted = Object.fromEntries(
  Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0])),
);
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);

console.log(`data ids: ${Object.keys(sorted).length} of ${catalog.length} catalog items linked`);
// Magic items and Clan Capital entries never appear in a village export -- the
// export covers the Home Village and Builder Base only -- and a handful of
// Home Village items have no dataId upstream. All are skipped at import rather
// than guessed, so this is a note and not a failure.
const overridden = new Set(Object.values(OVERRIDES));
const notable = unlinked.filter(
  (id) => !id.startsWith('magic-items/') && !id.startsWith('capital/') && !overridden.has(id),
);
if (notable.length) {
  console.log(`  no dataId upstream (skipped at import): ${notable.join(', ')}`);
}
