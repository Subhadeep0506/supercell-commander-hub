// Downloads Clash Royale artwork from RoyaleAPI/cr-api-assets into
// assets/packs/cr/, and writes the two id->file maps the app needs.
//
//   node --use-system-ca scripts/fetch-cr-assets.mjs
//   bun run fetch:cr-assets
//
// Why this exists: fankit.supercell.com is blocked on this network (Zscaler,
// "Online and Other Games"), and the `cr/` pack shipped with cards only -- no
// arenas, chests, clan badges or league badges. This repo has all four.
//
// Two of them cannot be addressed by name and need a generated map:
//
//   - Clan badges. The API returns `badgeId: 16000177` and *no* URL, unlike
//     Clash of Clans which gives badgeUrls. cr-api-data's alliance_badges.json
//     joins the id to the filename (`A_Char_Prince_03`).
//   - Arenas. The API returns `arena.id: 54000024`; arenas.json maps that to
//     an arena *number*, which is the filename (`arena11`).
//
// Upstream was last pushed 2026-03-05, so anything newer than that is absent
// -- see assets-req.md for exactly what still has to be sourced by hand.
//
// --use-system-ca is required: this machine does TLS inspection and Node
// otherwise rejects every HTTPS call.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = resolve(root, 'assets/packs/cr');
const DATA = resolve(root, 'src/data/cr');

const RAW = 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/';
const API = 'https://api.github.com/repos/RoyaleAPI/cr-api-assets/contents/';
const CR_DATA = 'https://royaleapi.github.io/cr-api-data/json/';

const force = process.argv.includes('--force');
let downloaded = 0;
let skipped = 0;
let failed = 0;

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/** Names in a repo directory, minus the extension. */
async function listDir(dir) {
  const entries = await json(`${API}${dir}`);
  return entries.filter((e) => e.type === 'file' && e.name.endsWith('.png')).map((e) => e.name);
}

/** Download one file unless it is already on disk. */
async function grab(repoPath, targetDir, name) {
  const target = resolve(targetDir, name);
  if (!force && existsSync(target)) {
    skipped += 1;
    return true;
  }
  try {
    const r = await fetch(RAW + repoPath, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) {
      failed += 1;
      console.log(`  FAIL ${repoPath} -> ${r.status}`);
      return false;
    }
    writeFileSync(target, Buffer.from(await r.arrayBuffer()));
    downloaded += 1;
    return true;
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${repoPath} -> ${error.message}`);
    return false;
  }
}

/** Download a list with a small concurrency cap, to stay polite to raw.github. */
async function grabAll(files, targetDir, label) {
  mkdirSync(targetDir, { recursive: true });
  const queue = [...files];
  const workers = Array.from({ length: 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await grab(job.from, targetDir, job.to);
    }
  });
  await Promise.all(workers);
  console.log(`  ${label.padEnd(10)} ${files.length} files`);
}

console.log('\nFetching Clash Royale artwork from RoyaleAPI/cr-api-assets\n');

// ---- Arenas and league badges --------------------------------------------
// Both live in the repo's `arenas/` directory but are different things: the
// arena ladder, and the Path of Legend league badges. They are split here so
// each gets its own registry and neither can shadow the other.
const arenaDir = await listDir('arenas');
await grabAll(
  arenaDir.filter((n) => /^arena\d+\.png$/.test(n)).map((n) => ({ from: `arenas/${n}`, to: n })),
  resolve(PACKS, 'arenas'),
  'arenas',
);
await grabAll(
  arenaDir
    .filter((n) => /^(league\d+|legendary)\.png$/.test(n))
    .map((n) => ({ from: `arenas/${n}`, to: n })),
  resolve(PACKS, 'leagues'),
  'leagues',
);

// ---- Chests ---------------------------------------------------------------
// `ic-chest-*` are small duplicate icons of chests already in the main set;
// taking both would double the bundle for no gain.
const chestDir = await listDir('chests');
await grabAll(
  chestDir.filter((n) => n.startsWith('chest-')).map((n) => ({ from: `chests/${n}`, to: n })),
  resolve(PACKS, 'chests'),
  'chests',
);

// ---- Clan badges ----------------------------------------------------------
const badgeDir = await listDir('badges');
await grabAll(
  badgeDir.map((n) => ({ from: `badges/${n}`, to: n })),
  resolve(PACKS, 'badges'),
  'badges',
);

// ---- Rarity tokens --------------------------------------------------------
// Four of the five rarities; there is no champion token upstream.
const tokenDir = await listDir('trade-tokens');
await grabAll(
  tokenDir.map((n) => ({ from: `trade-tokens/${n}`, to: n })),
  resolve(PACKS, 'tokens'),
  'tokens',
);

// ---- The two id maps ------------------------------------------------------
mkdirSync(DATA, { recursive: true });

const badgeRows = await json(`${CR_DATA}alliance_badges.json`);
const onDisk = new Set(badgeDir.map((n) => n.replace(/\.png$/, '')));
const badgeMap = {};
let unmappedBadges = 0;
for (const row of badgeRows) {
  if (onDisk.has(row.name)) badgeMap[row.id] = row.name;
  else unmappedBadges += 1;
}
writeFileSync(
  resolve(DATA, 'badge-map.json'),
  `${JSON.stringify(badgeMap, null, 0)}\n`,
);

const arenaRows = await json(`${CR_DATA}arenas.json`);
const arenaMap = {};
for (const row of arenaRows) {
  if (typeof row.id === 'number' && typeof row.arena === 'number') {
    arenaMap[row.id] = `arena${row.arena}`;
  }
}
writeFileSync(resolve(DATA, 'arena-map.json'), `${JSON.stringify(arenaMap, null, 0)}\n`);

console.log(`\n  badge-map.json  ${Object.keys(badgeMap).length} ids${
  unmappedBadges ? ` (${unmappedBadges} with no file)` : ''
}`);
console.log(`  arena-map.json  ${Object.keys(arenaMap).length} ids`);
console.log(
  `\n  downloaded ${downloaded} · skipped ${skipped} existing · failed ${failed}\n` +
    `  next: bun run build:assets\n`,
);
process.exit(failed ? 1 : 0);
