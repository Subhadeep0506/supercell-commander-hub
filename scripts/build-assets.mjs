// Turns the raw fan-kit drop-in under assets/ into bundle-ready artwork under
// src/assets/, and generates the image registries.
//
//   node scripts/build-assets.mjs [--force]
//
// Why a build step at all: the source packs are ~185 MB, and seven Town Hall
// PNGs are 13-20 MB each while rendering at roughly 80 px. Shipping those
// unchanged makes the village and leaderboard screens crawl in the browser and
// bloats the APK for no visible gain.
//
// Why generated registries: React Native cannot resolve a dynamic image path.
// Every image has to be referenced by a static import that the bundler can see
// at build time, so the import list is written out rather than walked at
// runtime. Metro resolves each one to an opaque asset id (a number) and Vite to
// a URL string -- both are valid <Image source> values on their platform.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = resolve(root, 'assets/packs');
const FONTS_IN = resolve(root, 'assets/fonts');
const OUT = resolve(root, 'src/assets');
const IMG = join(OUT, 'img');
const FONTS_OUT = join(OUT, 'fonts');
// Anything under src/main/assets is packaged into the APK as-is.
const ANDROID_FONTS = resolve(root, 'android/app/src/main/assets/fonts');

// clash-of-clans-data: MIT, zero dependencies, no API key -- a static dataset
// of game JSON plus 2,264 images, and the upstream source our catalog.json was
// generated from. It is a devDependency: only the handful of images selected
// below are converted into the bundle.
const COC_DATA = resolve(root, 'node_modules/clash-of-clans-data');
const CATALOG = resolve(root, 'src/data/clash-book/catalog.json');
const CATALOG_EXTRA = resolve(root, 'src/data/clash-book/catalog-extra.json');

const force = process.argv.includes('--force');

/**
 * Each group maps one pack directory to one output directory and one registry.
 *
 * `max` is the longest edge after resize. Grid tiles never render above about
 * 96 px even at 3x, so 256 is generous; full-bleed artwork (Town Halls, the
 * book item stage, logos) can reach roughly 200 px, so 512 covers it.
 *
 * One registry per source group, mirroring the reference app's own split
 * between coc-art.ts and coc-detail-art.ts. Merging them would collide:
 * trophy.png exists in both coc/main and coc/icons, and the reference relies
 * on the detail copy winning.
 */
const GROUPS = [
  { from: 'coc/main', to: 'coc', max: 512, registry: 'coc' },
  // Trimmed: these are small UI icons -- elixir, gold and clock fill only 4%
  // of their 256px canvas, so untrimmed they render as a 4px speck inside a
  // 20px box. Safe to trim because the ART_SCALE compensations all target
  // coc/main artwork, never this set.
  { from: 'coc/icons', to: 'coc-detail', max: 256, registry: 'cocDetail', trim: true },
  // Trimmed so every book tile fills its box equally. Two things depend on
  // this: the 60 gap-fillers from clash-of-clans-data are already tight, so
  // untrimmed fan-kit art would render visibly smaller beside them; and it
  // removes the need for the `_face` 2.8x correction, which only existed
  // because three hero portraits are crops floating in a large canvas.
  { from: 'coc/clash-book', to: 'coc-book', max: 256, registry: 'book', trim: true },
  { from: 'cr/cards', to: 'arena', max: 256, registry: 'arena' },
  { from: 'bs/main', to: 'arena', max: 256, registry: 'arena' },
  // Clash Royale artwork from RoyaleAPI/cr-api-assets, fetched by
  // scripts/fetch-cr-assets.mjs. Separate registries rather than one `arena`
  // group because the names collide across sets -- `legendary` is both an
  // arena and a chest tier -- and because two of them are addressed by a
  // generated id map rather than by name.
  //
  // Not trimmed: arena and league art is full-bleed, and cropping to the
  // alpha box would zoom each one differently.
  { from: 'cr/arenas', to: 'cr-arena', max: 256, registry: 'crArena' },
  { from: 'cr/leagues', to: 'cr-league', max: 256, registry: 'crLeague' },
  // Trimmed: these sit in rows beside each other at a fixed size, and the
  // source padding is uneven enough that untrimmed they render at visibly
  // different scales.
  { from: 'cr/chests', to: 'cr-chest', max: 256, registry: 'crChest', trim: true },
  // 128 rather than 256: badges never draw above 56px, and there are 182 of
  // them -- the difference is roughly 2MB of APK for pixels nothing shows.
  { from: 'cr/badges', to: 'cr-badge', max: 128, registry: 'crBadge', trim: true },
  // Player badges from the fan kit, fetched by scripts/fetch-fankit.mjs: 1,191
  // files, every badge family at every level. 128 for the same reason as the
  // clan crests -- they never draw above 48px -- which puts the whole set at
  // roughly 4MB.
  //
  // Not trimmed, unlike the crests. The source art is already uniformly
  // framed (content fills ~63% of a 256px canvas across the set), so trimming
  // would only rescale the handful of families whose art is tighter than the
  // rest and make them render larger than their neighbours in the same list.
  //
  // Quality 80 rather than the default 90: at 1,191 files the difference is
  // 3MB of APK, and these are soft gradient badges with no text or fine line
  // work for the extra bits to protect.
  { from: 'cr/player-badges', to: 'cr-playerbadge', max: 128, registry: 'crPlayerBadge', quality: 80 },
  { from: 'cr/tokens', to: 'cr-token', max: 128, registry: 'crToken', trim: true },
  // Hand-sourced icons. Trimmed because the set is mixed-origin -- menu icons
  // sit in a 216px box, the crowns in a much tighter one -- so untrimmed they
  // render at visibly different scales in the same metric grid.
  { from: 'cr/icons', to: 'cr-icon', max: 128, registry: 'crIcon', trim: true },
  // Path of Legend league badges. Distinct from `cr/leagues`, which holds the
  // older trophy-road art from cr-api-assets: `leagueNumber` on a player
  // refers to these.
  { from: 'cr/pol', to: 'cr-pol', max: 192, registry: 'crPol', trim: true },

  /*
   * ---- Brawl Stars ------------------------------------------------------
   *
   * From Brawlify/CDN via scripts/fetch-bs-assets.mjs. Every one of these is
   * filed under the numeric id the API returns -- 16000017.png is Tara,
   * 28000618.png is that player's icon -- so the registries below are keyed by
   * id string rather than by slug. `src/assets/slug.ts` is not involved
   * anywhere on the Brawl Stars side.
   *
   * None are trimmed. The sets are internally uniform (Brawlify normalises
   * them) and trimming would rescale the handful of tighter crops so they read
   * larger than their neighbours in the same grid -- the problem the player
   * badges comment describes.
   */
  // Collection grid tiles, with the rarity border baked into the art.
  { from: 'bs/brawler', to: 'bs-brawler', max: 192, registry: 'bsBrawler' },
  // Wide portraits for the brawler detail header; the only full-bleed set here.
  { from: 'bs/portrait', to: 'bs-portrait', max: 384, registry: 'bsPortrait' },
  // Filed as 48000000 + modeId. The offset is applied on lookup in
  // src/assets/brawl.ts, not here -- the filename stays what Brawlify called it.
  { from: 'bs/mode', to: 'bs-mode', max: 128, registry: 'bsMode' },
  { from: 'bs/badge', to: 'bs-badge', max: 128, registry: 'bsBadge' },
  // Keyed by league family name (Gold.png), not by id -- see fetch-bs-assets.
  { from: 'bs/rank', to: 'bs-rank', max: 128, registry: 'bsRank' },
  // Gadgets, star powers and gears in one set: their id spaces are disjoint
  // (23xxxxxx for the first two, 62xxxxxx for gears) and fetch-bs-assets fails
  // the build if that ever stops being true.
  //
  // 96 rather than 128: 470 files that never render above 32px in the kit
  // rows, and the step down is 1.7MB of APK for pixels nothing shows.
  { from: 'bs/kit', to: 'bs-kit', max: 96, registry: 'bsKit', quality: 78 },
  // Keyed 0-13, matching `prestigeLevel` directly.
  { from: 'bs/prestige', to: 'bs-prestige', max: 128, registry: 'bsPrestige' },
  // 1,405 player icons -- the largest set in the app after the Clash Book
  // levels, and the one that decides whether a roster row looks finished.
  //
  // 112 at quality 72. Brawlify already ships these as pngquant'd 8-bit
  // palette PNGs, so WebP has far less to win back than it does on the Royale
  // badges; at the original 128/80 the set alone was 8.7MB. The largest any of
  // them draws is the ~64px header avatar.
  { from: 'bs/icon', to: 'bs-icon', max: 112, registry: 'bsIcon', quality: 72 },
  // Map renders, keyed by `event.id`. 1,399 of them and the largest raw group
  // in the repo at 58.7 MB, which is why they draw at 256: the battle sheet
  // shows them as a 150pt-tall thumbnail and nothing else uses them.
  //
  // Not trimmed. These are full-bleed renders with no transparent margin to
  // crop, and trimming would rescale each map differently against its
  // neighbours in the same list.
  { from: 'bs/map', to: 'bs-map', max: 256, registry: 'bsMap', quality: 78 },
  // The four stat icons from the fan kit -- fame, xp, power points, prestige.
  // Trimmed, because the kit frames them very unevenly (xp fills its 500px
  // square, fame sits in a 1025x1200 canvas) and untrimmed they render at
  // visibly different weights in the same metric row.
  { from: 'bs/icons', to: 'bs-stat', max: 128, registry: 'bsStat', trim: true },
];

/**
 * Bottom-nav icons.
 *
 * These are trimmed to their content before resizing. The source art has wildly
 * uneven transparent padding -- home_town-hall fills its canvas completely,
 * home_army-camp fills 25% -- so scaling the raw files to a uniform box makes
 * some icons look half the size of others. The reference stylesheet papered
 * over this with per-image transform hacks (war 2.2x, builder 3.2x); trimming
 * fixes the cause instead.
 */
const NAV_ICONS = [
  { file: 'coc/clash-book/home_town-hall.png', name: 'home' },
  // A shield reads as "war" at 24px. The catalog has no war building, and
  // army-camp turns to mush at this size.
  { file: 'coc/clash-book/home_seeking-shield.png', name: 'war' },
  { file: 'coc/clash-book/builder_builder-hall.png', name: 'builder' },
  { file: 'coc/clash-book/home_clan-castle.png', name: 'clan' },
  { file: 'coc/icons/trophy.png', name: 'rankings' },
  { file: 'coc/clash-book/book-icon.png', name: 'book' },
];

/**
 * Resource and currency icons, taken from clash-of-clans-data.
 *
 * The fan kit covers Gold, Elixir and Dark Elixir but nothing else, so four of
 * the seven upgrade-cost resources in the catalog -- Builder Gold, Builder
 * Elixir, "Builder Gold or Builder Elixir" and "Gold or Elixir" -- currently
 * render no icon at all. Keyed by the exact `upgradeCostResource` string the
 * catalog uses, so lookups need no normalisation.
 */
const RESOURCE_ICONS = [
  { file: 'images/other/gold.png', name: 'Gold' },
  { file: 'images/other/elixir.png', name: 'Elixir' },
  { file: 'images/other/dark-elixir.png', name: 'Dark Elixir' },
  { file: 'images/other/gold-b.png', name: 'Builder Gold' },
  { file: 'images/other/elixir-b.png', name: 'Builder Elixir' },
  { file: 'images/other/gold-c.png', name: 'Capital Gold' },
  { file: 'images/other/gem.png', name: 'Gems' },
  { file: 'images/other/xp.png', name: 'XP' },
  // Hero equipment is upgraded with ores, not elixir: the level rows carry
  // upgradeShinyOre / upgradeGlowingOre / upgradeStarryOre. Named to match the
  // field, so fieldLabel() output maps straight onto an icon.
  { file: 'images/other/ore/shiny-ore.png', name: 'Shiny Ore' },
  { file: 'images/other/ore/glowy-ore.png', name: 'Glowing Ore' },
  { file: 'images/other/ore/starry-ore.png', name: 'Starry Ore' },
];

/**
 * Clan Capital, clan label and league artwork, all from clash-of-clans-data.
 *
 * The clan detail sheet needs district tiles, a capital league badge and the
 * clan's label icons. The fan kit has none of these; the upstream dataset has
 * all of them, keyed by level or by a kebab-case name that matches what the
 * API returns once slugified.
 *
 * `halls/capital-hall` covers Capital Peak, whose tile shows the *capital*
 * hall level; `halls/district-hall` covers the other eight districts, each
 * showing its own districtHallLevel.
 */
const CAPITAL_DIRS = [
  { dir: 'images/clan-capital/halls/capital-hall/normal', prefix: 'capital-hall', max: 256 },
  { dir: 'images/clan-capital/halls/district-hall/normal', prefix: 'district-hall', max: 256 },
  { dir: 'images/clan-capital/leagues', prefix: 'capital-league', max: 128 },
  { dir: 'images/clan/labels', prefix: 'label', max: 128 },
];

/**
 * Town Halls 1-8, which the fan kit does not ship.
 *
 * `coc/main` carries only 9-18, so every roster row, ladder entry and war
 * member below TH9 rendered as a hole. The war league screen made that
 * unmissable -- a league group spans the whole range, and its Town Hall
 * legend runs down to TH3. clash-of-clans-data has the full set.
 *
 * Emitted into the same directory and registry as the fan-kit halls, at the
 * same size and untrimmed, so the two sets are indistinguishable in a list.
 * 9-18 are skipped here rather than overwritten: the official art wins.
 */
const LOW_TOWN_HALLS = { dir: 'images/home/town-hall/normal', max: 8 };

/**
 * League badges for the player and clan ladders.
 *
 * Three separate league systems, and the two sources split cleanly between
 * them. clash-of-clans-data carries Builder Base and Ranked artwork already
 * named the way the API names the league once slugified -- "Wood League V"
 * slugifies to `wood-v`, which is the filename -- so those need no mapping.
 *
 * Builder Base art is per *tier* (42 badges), Ranked art is per *group* (one
 * badge shared by Barbarian 1-3), which is how each is drawn in game.
 *
 * Home Village trophy leagues are the gap: the dataset has no set at all, so
 * they come from the fan-kit drop-in below.
 */
const LEAGUE_DIRS = [
  { dir: 'images/builder/leagues', prefix: 'bb-league', max: 128 },
  { dir: 'images/ranked-battles/leagues', prefix: 'ranked-league', max: 128 },
];

/**
 * Home Village trophy league badges, kebab-named per league *family*
 * ("bronze.png", "legend.png") -- the fan kit has one badge per family rather
 * than one per roman-numeral tier, so the lookup drops the tier.
 *
 * Optional, like the war leagues: absent files leave the ladder falling back
 * to Town Hall art rather than failing the build.
 */
const TROPHY_LEAGUE_DIR = 'coc/leagues';

/**
 * Artwork with no source in either the fan kit or clash-of-clans-data, to be
 * dropped in by hand. Absent files are reported but do not fail the build --
 * every call site falls back to a text chip or a plain empty state, so the app
 * builds and runs without them.
 *
 *   assets/packs/coc/extra/raid-medal.png     Raid Medals currency icon
 *   assets/packs/coc/extra/empty-state.png    sad character for empty states
 *   assets/packs/coc/war-leagues/*.png        war league badges, kebab-named
 *                                             ("champion-i.png", "bronze-iii.png")
 */
const CAPITAL_DROP_INS = [
  { file: 'coc/extra/raid-medal.png', name: 'raid-medal', max: 128 },
  { file: 'coc/extra/empty-state.png', name: 'empty-state', max: 512 },
];
const WAR_LEAGUE_DIR = 'coc/war-leagues';

/** Optional artwork that is merely absent, as opposed to a build failure. */
const notes = [];

const kebab = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Every png in the package, indexed for slug lookup. */
function indexPackageImages() {
  const byDir = new Map();
  const byFile = new Map();
  if (!existsSync(join(COC_DATA, 'images'))) return { byDir, byFile, count: 0 };
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.png')) files.push(p.split(sep).join('/').slice(COC_DATA.length + 1));
    }
  })(join(COC_DATA, 'images'));
  for (const f of files) {
    const parts = f.split('/');
    byFile.set(slugify(parts[parts.length - 1].replace(/\.png$/, '')), f);
    for (let i = 1; i < parts.length - 1; i++) {
      const k = slugify(parts[i]);
      if (!byDir.has(k)) byDir.set(k, []);
      byDir.get(k).push(f);
    }
  }
  return { byDir, byFile, count: files.length };
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Prefer an explicit icon, then the highest level artwork, then anything. */
function bestOf(files) {
  const icon = files.find((f) => /\/icon\.png$/.test(f));
  if (icon) return icon;
  const levels = files
    .map((f) => [Number((f.match(/level-(\d+)\.png$/) || [])[1] ?? -1), f])
    .filter(([n]) => n >= 0)
    .sort((a, b) => b[0] - a[0]);
  if (levels.length) return levels[0][1];
  return files.find((f) => /\/normal\.png$/.test(f)) ?? files[0];
}

/**
 * Package artwork for a catalog item.
 *
 * `sourcePath` is exact -- it names the upstream data file this catalog entry
 * was generated from -- so it is tried first. Fifteen items have no `images`
 * field upstream even though their artwork exists, which is what the slug
 * fallback over the image tree is for.
 */
function resolvePackageImage(item, index) {
  // Generated entries name their own artwork. This has to win over the
  // sourcePath probe: a nested sub-item shares its parent's source file, so
  // probing it would hand Super Barbarian the plain Barbarian's icon.
  if (item.imagePath) return item.imagePath;
  if (item.sourcePath) {
    const p = join(COC_DATA, 'data', item.sourcePath);
    if (existsSync(p)) {
      const up = JSON.parse(readFileSync(p, 'utf8'));
      if (up.images?.icon) return up.images.icon;
      const withArt = (up.levels || []).filter((r) => r.images);
      const last = withArt[withArt.length - 1];
      const img = last && (last.images.normal || Object.values(last.images)[0]);
      if (img) return img;
    }
  }
  for (const key of [slugify(item.id.split('/').pop()), slugify(item.name)]) {
    if (index.byDir.has(key)) return bestOf(index.byDir.get(key));
    if (index.byFile.has(key)) return index.byFile.get(key);
  }
  return undefined;
}

// The three game logos sit at the root of their own pack.
const LOGOS = [
  { file: 'coc/Clash_of_Clans_logo.png', name: 'coc', max: 512 },
  { file: 'cr/Clash_Royale_Logo.png', name: 'cr', max: 512 },
  { file: 'bs/Brawl_Stars_Logo.png', name: 'bs', max: 512 },
];

if (!existsSync(PACKS)) {
  throw new Error(`No packs found at ${PACKS}. See assets/README.md.`);
}

if (force && existsSync(IMG)) rmSync(IMG, { recursive: true });
mkdirSync(IMG, { recursive: true });

let converted = 0;
let skipped = 0;
let bytesIn = 0;
let bytesOut = 0;
const failures = [];

async function convert(source, targetDir, name, max, { trim = false, quality = 90 } = {}) {
  mkdirSync(targetDir, { recursive: true });
  const target = join(targetDir, `${name}.webp`);
  bytesIn += statSync(source).size;

  // Skip work when the output is already newer than its input.
  if (!force && existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) {
    bytesOut += statSync(target).size;
    skipped++;
    return true;
  }
  try {
    const pipeline = sharp(source);
    // trim() crops to the alpha bounding box, so every nav icon ends up
    // filling its own canvas and renders at the same visual weight.
    if (trim) pipeline.trim({ threshold: 0 });
    await pipeline
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toFile(target);
    bytesOut += statSync(target).size;
    converted++;
    return true;
  } catch (error) {
    failures.push(`${source}: ${error.message}`);
    return false;
  }
}

/** Registry name -> [{ lookup, path }]. */
const registries = { coc: [], cocDetail: [], cocCapital: [], cocLeague: [], book: [], bookExtra: [], bookLevel: [], arena: [], crArena: [], crLeague: [], crChest: [], crBadge: [], crPlayerBadge: [], crToken: [], crIcon: [], crPol: [], bsBrawler: [], bsPortrait: [], bsMode: [], bsBadge: [], bsRank: [], bsKit: [], bsPrestige: [], bsIcon: [], bsStat: [], bsMap: [], logo: [], nav: [], resource: [] };

/** Guard against two packs contributing the same key to one registry. */
function add(registry, lookup, path) {
  const existing = registries[registry].find((e) => e.lookup === lookup);
  if (existing) {
    failures.push(`duplicate key "${lookup}" in registry ${registry}: ${existing.path} vs ${path}`);
    return;
  }
  registries[registry].push({ lookup, path });
}

for (const group of GROUPS) {
  const dir = join(PACKS, group.from);
  if (!existsSync(dir)) {
    failures.push(`missing pack directory: ${group.from}`);
    continue;
  }
  const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  for (const file of files) {
    const name = basename(file, extname(file));
    const ok = await convert(join(dir, file), join(IMG, group.to), name, group.max, {
      trim: group.trim === true,
      quality: group.quality,
    });
    // Lookup key is the bare filename. For the Clash Book the catalog id
    // "home/hero-hall" maps to the file "home_hero-hall", so callers translate
    // with id.replace(/\//g, '_') -- inverting the filename here instead would
    // be guesswork about which underscore was originally a slash.
    if (ok) add(group.registry, name, `./img/${group.to}/${name}.webp`);
  }
}

for (const logo of LOGOS) {
  const source = join(PACKS, logo.file);
  if (!existsSync(source)) {
    failures.push(`missing logo: ${logo.file}`);
    continue;
  }
  const ok = await convert(source, join(IMG, 'logo'), logo.name, logo.max);
  if (ok) add('logo', logo.name, `./img/logo/${logo.name}.webp`);
}

// --- clash-of-clans-data passes -------------------------------------------
const pkgIndex = indexPackageImages();
if (pkgIndex.count === 0) {
  failures.push('clash-of-clans-data is not installed -- run `bun install` (devDependency)');
}

// Resource icons the fan kit has no equivalent for.
for (const icon of RESOURCE_ICONS) {
  const source = join(COC_DATA, icon.file);
  if (!existsSync(source)) {
    failures.push(`missing resource icon: ${icon.file}`);
    continue;
  }
  const name = slugify(icon.name);
  const ok = await convert(source, join(IMG, 'resource'), name, 96, { trim: true });
  if (ok) add('resource', icon.name, `./img/resource/${name}.webp`);
}

// Clan Capital districts, capital leagues and clan labels.
for (const group of CAPITAL_DIRS) {
  const dir = join(COC_DATA, group.dir);
  if (!existsSync(dir)) {
    failures.push(`missing capital art directory: ${group.dir}`);
    continue;
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    // "level-7.png" -> "capital-hall-7"; "legend.png" -> "capital-league-legend".
    const stem = basename(file, '.png').replace(/^level-/, '');
    const key = `${group.prefix}-${kebab(stem)}`;
    const ok = await convert(join(dir, file), join(IMG, 'coc-capital'), key, group.max, {
      trim: true,
    });
    if (ok) add('cocCapital', key, `./img/coc-capital/${key}.webp`);
  }
}

// Town Halls 1-8 from the dataset, joining 9-18 from the fan kit.
{
  const dir = join(COC_DATA, LOW_TOWN_HALLS.dir);
  if (!existsSync(dir)) {
    failures.push(`missing town hall art directory: ${LOW_TOWN_HALLS.dir}`);
  } else {
    for (let level = 1; level <= LOW_TOWN_HALLS.max; level++) {
      const source = join(dir, `level-${level}.png`);
      if (!existsSync(source)) {
        failures.push(`missing town hall art: level-${level}.png`);
        continue;
      }
      const key = `town-hall-${level}`;
      const ok = await convert(source, join(IMG, 'coc'), key, 512);
      if (ok) add('coc', key, `./img/coc/${key}.webp`);
    }
  }
}

// Builder Base and Ranked league badges, straight from the dataset. Filenames
// already match what the API name slugifies to, so the stem is the key.
for (const group of LEAGUE_DIRS) {
  const dir = join(COC_DATA, group.dir);
  if (!existsSync(dir)) {
    failures.push(`missing league art directory: ${group.dir}`);
    continue;
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const key = `${group.prefix}-${kebab(basename(file, '.png'))}`;
    const ok = await convert(join(dir, file), join(IMG, 'coc-league'), key, group.max, {
      trim: true,
    });
    if (ok) add('cocLeague', key, `./img/coc-league/${key}.webp`);
  }
}

// Home Village trophy leagues. Drop-in only -- the dataset has no set.
const trophyLeagueDir = join(PACKS, TROPHY_LEAGUE_DIR);
if (!existsSync(trophyLeagueDir)) {
  notes.push(`optional art not supplied: assets/packs/${TROPHY_LEAGUE_DIR}/ (trophy league badges)`);
} else {
  for (const file of readdirSync(trophyLeagueDir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f))) {
    const key = `league-${kebab(basename(file, extname(file)))}`;
    const ok = await convert(join(trophyLeagueDir, file), join(IMG, 'coc-league'), key, 128, {
      trim: true,
    });
    if (ok) add('cocLeague', key, `./img/coc-league/${key}.webp`);
  }
}

// Hand-supplied artwork with no upstream source. Optional by design.
for (const icon of CAPITAL_DROP_INS) {
  const source = join(PACKS, icon.file);
  if (!existsSync(source)) {
    notes.push(`optional art not supplied: assets/packs/${icon.file}`);
    continue;
  }
  const ok = await convert(source, join(IMG, 'coc-capital'), icon.name, icon.max, { trim: true });
  if (ok) add('cocCapital', icon.name, `./img/coc-capital/${icon.name}.webp`);
}

// War league badges. The API exposes war leagues as id + name with no icon
// URL, and neither source carries them, so these are drop-in only.
const warLeagueDir = join(PACKS, WAR_LEAGUE_DIR);
if (!existsSync(warLeagueDir)) {
  notes.push(`optional art not supplied: assets/packs/${WAR_LEAGUE_DIR}/ (war league badges)`);
} else {
  for (const file of readdirSync(warLeagueDir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f))) {
    const key = `war-league-${kebab(basename(file, extname(file)))}`;
    const ok = await convert(join(warLeagueDir, file), join(IMG, 'coc-capital'), key, 128, {
      trim: true,
    });
    if (ok) add('cocCapital', key, `./img/coc-capital/${key}.webp`);
  }
}

// Fill Clash Book gaps: the fan-kit pack covers 205 of the 265 catalog items,
// and the design has shown a text fallback for the other 60 since the
// reference app. The upstream dataset has artwork for all of them.
//
// catalog-extra.json is read alongside it so the generated entries -- Super
// Troops, Ruin Knight and the whole Clan Capital -- get tiles the same way.
// The fan kit has artwork for none of them, so every one takes this path.
if (pkgIndex.count > 0 && existsSync(CATALOG)) {
  const catalog = [
    ...JSON.parse(readFileSync(CATALOG, 'utf8')),
    ...(existsSync(CATALOG_EXTRA) ? JSON.parse(readFileSync(CATALOG_EXTRA, 'utf8')) : []),
  ];
  const haveFanKit = new Set(
    existsSync(join(PACKS, 'coc/clash-book'))
      ? readdirSync(join(PACKS, 'coc/clash-book')).map((f) => basename(f, extname(f)))
      : [],
  );
  for (const item of catalog) {
    const key = item.id.replace(/\//g, '_');
    if (haveFanKit.has(key)) continue;
    // Entries the dataset does not cover at all declare it, so the tile
    // falling back to a name is the intended result rather than a failure.
    if (item.noArtwork) continue;
    const rel = resolvePackageImage(item, pkgIndex);
    if (!rel || !existsSync(join(COC_DATA, rel))) {
      failures.push(`no artwork anywhere for ${item.id}`);
      continue;
    }
    const ok = await convert(join(COC_DATA, rel), join(IMG, 'coc-book-extra'), key, 256, {
      trim: true,
    });
    if (ok) add('bookExtra', key, `./img/coc-book-extra/${key}.webp`);
  }
}

/**
 * Per-level artwork.
 *
 * A level-1 and a level-14 Inferno Tower are different buildings to look at,
 * and the dataset renders every one of them -- 1,607 images across 241 items.
 * Until this pass existed the app showed one picture per catalog id, so the
 * Clash Book's level slider changed every number on the card except the
 * picture.
 *
 * The mapping is rebuilt from upstream rather than read off our own catalog:
 * `catalog.json` is copied verbatim from the reference app, which strips
 * `levels[].images` (checked -- zero rows carry it). `sourcePath` names the
 * upstream file exactly, which is the same handle resolvePackageImage uses.
 *
 * Not everything has a level set. Heroes, pets, spells, hero equipment,
 * guardians and Super Troops ship a single `icon.png` upstream, so they are
 * absent here by design and `bookArtAt` falls back to the one image. That is
 * not a gap to chase -- the art genuinely does not exist.
 *
 * Keys are `home_inferno-tower_l12`. `@` would be a nicer separator but React
 * Native strips every character outside [a-z0-9_] when it derives an Android
 * drawable name, so it would vanish from the identifier on the device only.
 */
const LEVEL_KEY = (id, level) => `${id.replace(/\//g, '_')}_l${level}`;

if (pkgIndex.count > 0 && existsSync(CATALOG)) {
  const catalog = [
    ...JSON.parse(readFileSync(CATALOG, 'utf8')),
    ...(existsSync(CATALOG_EXTRA) ? JSON.parse(readFileSync(CATALOG_EXTRA, 'utf8')) : []),
  ];
  // One read per upstream file, not one per level row.
  const upstream = new Map();
  const readUpstream = (sourcePath) => {
    if (upstream.has(sourcePath)) return upstream.get(sourcePath);
    const p = join(COC_DATA, 'data', sourcePath);
    let value;
    try {
      value = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined;
    } catch {
      value = undefined;
    }
    upstream.set(sourcePath, value);
    return value;
  };

  let levelItems = 0;
  for (const item of catalog) {
    if (!item.sourcePath) continue;
    // A nested sub-item shares its parent's source file, so walking the
    // parent's levels here would hand Super Barbarian the plain Barbarian's
    // renders at every level. `baseItemId` is what marks one -- 17 Super
    // Troops and the Ruin Knight.
    //
    // Deliberately *not* keyed on `imagePath`: the 88 Clan Capital entries
    // generated by build-catalog-extra.mjs carry one, but it only names the
    // single icon they chose. Their `sourcePath` is their own file and their
    // level art is real, so an imagePath guard here silently cost the whole
    // Clan Capital its per-level renders.
    if (item.baseItemId) continue;
    const up = readUpstream(item.sourcePath);
    const levels = Array.isArray(up?.levels) ? up.levels : [];
    // Nineteen upstream files repeat their first level rows -- Air Defense
    // declares level 1 and 2 twice in its eighteen rows for a sixteen-level
    // building. Both copies name the same image, so the second is dropped
    // rather than reported as a collision.
    const seen = new Set();
    let wrote = 0;
    for (const row of levels) {
      const level = Number(row?.level);
      if (!Number.isFinite(level) || !row?.images) continue;
      if (seen.has(level)) continue;
      seen.add(level);
      // `normal` is the plain render; the alternates are mode art (an Inferno
      // Tower's multi-target barrel, a depleted collector) and would make the
      // same building look like a different one as the slider moved.
      const rel = row.images.normal ?? Object.values(row.images)[0];
      if (typeof rel !== 'string' || !existsSync(join(COC_DATA, rel))) continue;
      const key = LEVEL_KEY(item.id, level);
      // Trimmed, matching the coc/clash-book group: the base icon and the
      // level render sit in the same tile, and an untrimmed one beside a
      // trimmed one reads as a size change rather than a level change.
      const ok = await convert(join(COC_DATA, rel), join(IMG, 'coc-level'), key, 256, {
        trim: true,
      });
      if (ok) {
        add('bookLevel', key, `./img/coc-level/${key}.webp`);
        wrote++;
      }
    }
    if (wrote > 0) levelItems++;
  }
  if (levelItems === 0) failures.push('no per-level artwork resolved from clash-of-clans-data');
}

for (const icon of NAV_ICONS) {
  const source = join(PACKS, icon.file);
  if (!existsSync(source)) {
    failures.push(`missing nav icon: ${icon.file}`);
    continue;
  }
  // 96px: 4x the 24px render box, so it stays crisp on a 3x screen.
  const ok = await convert(source, join(IMG, 'nav'), icon.name, 96, { trim: true });
  if (ok) add('nav', icon.name, `./img/nav/${icon.name}.webp`);
}

/**
 * Fonts are copied, and renamed on the way.
 *
 * On Android React Native resolves `fontFamily` to a file in
 * `app/src/main/assets/fonts/`, so the filename *is* the family name. The
 * fan-kit files ship as `cr-Clash_Bold.otf`, which would mean writing
 * `fontFamily: 'cr-Clash_Bold'` everywhere; these names match the fonts' own
 * PostScript names instead (verified from each file's name table).
 *
 * Copying straight into the Android assets directory also removes the need for
 * a separate `npx react-native-asset` link step before every build.
 */
const FONT_FILES = [
  { from: 'cr-Clash_Bold.otf', to: 'Clash-Bold.otf' },
  { from: 'cr-Clash_Regular.otf', to: 'Clash-Regular.otf' },
  { from: 'lilitaone-regular.ttf', to: 'LilitaOne.ttf' },
];

mkdirSync(FONTS_OUT, { recursive: true });
mkdirSync(ANDROID_FONTS, { recursive: true });
let fonts = 0;
if (existsSync(FONTS_IN)) {
  const { copyFileSync } = await import('node:fs');
  for (const font of FONT_FILES) {
    const source = join(FONTS_IN, font.from);
    if (!existsSync(source)) {
      failures.push(`missing font: assets/fonts/${font.from}`);
      continue;
    }
    copyFileSync(source, join(FONTS_OUT, font.to));
    copyFileSync(source, join(ANDROID_FONTS, font.to));
    fonts++;
  }
}

function writeRegistry(name, entries) {
  const sorted = [...entries].sort((a, b) => a.lookup.localeCompare(b.lookup));
  const ident = (i) => `a${i}`;
  const imports = sorted.map((e, i) => `import ${ident(i)} from '${e.path}';`).join('\n');
  const body = sorted.map((e, i) => `  ${JSON.stringify(e.lookup)}: ${ident(i)},`).join('\n');
  const file = `// GENERATED by scripts/build-assets.mjs -- do not edit.
// ${sorted.length} images. Rebuild with \`bun run build:assets\`.
import type { ImageSourcePropType } from 'react-native';

${imports}

export const ${name}Images: Record<string, ImageSourcePropType> = {
${body}
};
`;
  writeFileSync(join(OUT, `registry.${name}.ts`), file);
  return sorted.length;
}

const counts = Object.fromEntries(
  Object.entries(registries).map(([name, entries]) => [name, writeRegistry(name, entries)]),
);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const summary = Object.entries(counts)
  .map(([name, n]) => `${name} ${n}`)
  .join(', ');
console.log(
  `assets: ${converted} converted, ${skipped} unchanged, ${fonts} fonts\n` +
    `        ${mb(bytesIn)} source -> ${mb(bytesOut)} output\n` +
    `        registries: ${summary}`,
);
if (notes.length) {
  console.log(`\n${notes.length} optional, falling back in the UI:`);
  for (const n of notes) console.log(`  ${n}`);
}
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}
