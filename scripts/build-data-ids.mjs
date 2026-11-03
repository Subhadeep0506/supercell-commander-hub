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
const OUT = resolve(root, 'src/data/clash-book/data-ids.json');

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

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));

// Catalog ids are namespaced ("home/air-defense"); upstream ids are not
// ("air-defense"). The namespace is what keeps the two Wall entries apart, so
// it is the catalog id that gets stored.
const map = {};
const unlinked = [];
for (const item of catalog) {
  const dataId =
    (item.sourcePath ? bySourcePath.get(String(item.sourcePath).split(sep).join('/')) : undefined) ??
    byUpstreamId.get(String(item.id).split('/').pop());
  if (dataId === undefined) {
    unlinked.push(item.id);
    continue;
  }
  map[dataId] = item.id;
}

mkdirSync(dirname(OUT), { recursive: true });
const sorted = Object.fromEntries(
  Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0])),
);
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);

console.log(`data ids: ${Object.keys(sorted).length} of ${catalog.length} catalog items linked`);
// Magic items never appear in a village export, and a handful of the newest
// buildings have no dataId upstream yet. Both are skipped at import rather
// than guessed, so this is a note and not a failure.
const notable = unlinked.filter((id) => !id.startsWith('magic-items/'));
if (notable.length) {
  console.log(`  no dataId upstream (skipped at import): ${notable.join(', ')}`);
}
