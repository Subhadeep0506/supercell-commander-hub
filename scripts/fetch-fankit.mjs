import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = resolve(root, 'assets/packs');

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const indexDir = resolve(
  root,
  args.find((a) => a.startsWith('--index='))?.slice('--index='.length) ?? '..',
);


const WIDTH = 256;


const SINGLES = [
  { title: 'Clash_Royale_App_Icon', to: 'cr/icons/appicon.png' },
  // Repair points, River Race and the race log. The kit has no UI hammer; the
  // Hog Rider emote is a clean golden hammer once trimmed out of its frame.
  { title: 'emote_hog_rider_hammer', to: 'cr/icons/hammer.png' },
  // Fame. The kit has no fame drop either, and fame is scored in crowns.
  { title: 'Red Crown 2', to: 'cr/icons/fame.png' },
  // Card stats. The Wild Shard is the generic evolution currency, so it reads
  // as "evolution" without naming a card; the Champion wild card is the one
  // rarity token cr-api-assets does not ship.
  { title: 'Wild Shard', to: 'cr/icons/evolution.png' },
  { title: 'Champion Wild Card', to: 'cr/tokens/tt-champion.png' },
  // Achievements. Two of the twelve have art close enough to be worth a file
  // of their own rather than another reuse of the tournament wreath.
  { title: 'emote_king_tv_royale', to: 'cr/icons/tvroyale.png' },
  { title: 'emote_wizard_flame_on', to: 'cr/icons/streak.png' },
  // Favourite card.
  { title: 'emote_firecracker_heart', to: 'cr/icons/heart.png' },
  // Generic badge frame -- the fallback when a player badge has no art in the
  // kit, which is true of EmoteCollection and CollectionLevel.
  { title: 'Mastery_badge', to: 'cr/icons/mastery.png' },
  // Path of Legend, for the ladder chip and as the league fallback.
  { title: 'Path of Legends icon', to: 'cr/icons/pathoflegend.png' },
  // --- cr/pol ---------------------------------------------------------------
  // League 10. The other nine were hand-sourced; this completes the set, so
  // Ultimate Champion no longer falls back to the older trophy-road art.
  { title: 'icon_League_Badge_Ultimate_Champion', to: 'cr/pol/pol10.png' },
  { title: 'Chest_TowerTroops_Closed', to: 'cr/chests/chest-towertroop.png' },
  { title: 'Chest_Champion_Chest', to: 'cr/chests/chest-champion.png' },
  { title: 'Chest_Level_Up_Chest', to: 'cr/chests/chest-levelup.png' },
];


const BS_SINGLES = [
  // Fame. The kit files these per tier (icon_fame_1_1 .. icon_fame_meteoric);
  // `fameTierName` cannot be mapped onto them from two observed samples, so
  // the first is taken as the generic drop rather than guessing a tier ladder.
  { title: 'icon_fame_1_1', to: 'bs/icons/fame.png' },
  { title: 'icon_xp', to: 'bs/icons/xp.png' },
  // Power points: the currency that raises a brawler's power level, so it is
  // the honest picture for a "power 11" count.
  { title: 'icon_powerpoints_stack', to: 'bs/icons/power.png' },
  // The flat total-prestige mark. Preferred over prestiges/tiered from
  // Brawlify, whose art has the tier number drawn into it -- wrong on a tile
  // whose own value is the number.
  { title: 'icon_total_prestige', to: 'bs/icons/prestige.png' },
];

const COC_SINGLES = [
  { title: 'Barbarian_King_1', to: 'coc/clash-book/home_barbarian-king.png', width: 512 },
  // _3, not _1 or _2: both of those are posed on a grass-and-dirt platform,
  // which survives the alpha trim and leaves a lump of scenery under her in a
  // 62px tile. _3 is the same figure floating free, like the other four.
  { title: 'Archer_Queen_3', to: 'coc/clash-book/home_archer-queen.png', width: 512 },
  { title: 'Grand_Warden_1', to: 'coc/clash-book/home_grand-warden.png', width: 512 },
  { title: 'Royal_Champion_1', to: 'coc/clash-book/home_royal-champion.png', width: 512 },
  {
    title: 'Hero_Minion_Prince_01_NoShadow',
    to: 'coc/clash-book/home_minion-prince.png',
    width: 512,
  },
];


const UNSOURCED = [{ want: 'padlock icon', to: 'cr/icons/lock.png' }];


function playerBadges(assets) {
  const out = [];
  const seen = new Set();
  for (const asset of assets) {
    const match = /^badge_(.+)_lv(\d+)$/.exec(asset.title ?? '');
    if (!match) continue;
    const name = `${slug(match[1])}-lv${Number(match[2])}`;
    // The index has a handful of duplicate titles; first wins.
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ asset, to: `cr/player-badges/${name}.png` });
  }
  return out;
}

/** `MiniP.E.K.K.A` -> `minipekka`; `top_ranked_finishes` -> `toprankedfinishes`. */
function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function loadIndex(game) {
  const file = resolve(indexDir, `${game}-fankit-images.json`);
  if (!existsSync(file)) {
    throw new Error(
      `No fan-kit index at ${file}. Pass --index=<dir> pointing at the ` +
        `directory holding ${game}-fankit-images.json.`,
    );
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.assets)) throw new Error(`${file} has no assets array.`);
  return parsed.assets;
}

let downloaded = 0;
let skipped = 0;
let failed = 0;

async function grab(asset, to, width = WIDTH) {
  const target = resolve(PACKS, to);
  if (!force && existsSync(target)) {
    skipped += 1;
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  // Ask the CDN to resize. `resized_url` is a template with a {width}
  // placeholder; the plain url takes the same query parameter.
  const url = asset.resized_url
    ? asset.resized_url.replace('{width}', String(width))
    : `${asset.url}?width=${width}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      failed += 1;
      console.log(`  FAIL ${asset.title} -> ${response.status}`);
      return;
    }
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${asset.title} -> ${error.message}`);
  }
}

/** Download with a small concurrency cap, to stay polite to the CDN. */
async function grabAll(jobs, label) {
  if (!jobs.length) return;
  console.log(`${label}: ${jobs.length} image(s)`);
  const queue = [...jobs];
  const workers = Array.from({ length: 8 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await grab(job.asset, job.to, job.width);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const assets = loadIndex('clash-royale');
  const byTitle = new Map();
  for (const asset of assets) if (!byTitle.has(asset.title)) byTitle.set(asset.title, asset);

  const jobs = [];
  if (!only || only === 'icons') {
    for (const single of SINGLES) {
      const asset = byTitle.get(single.title);
      if (!asset) {
        failed += 1;
        console.log(`  FAIL ${single.title} -> not in the fan-kit index`);
        continue;
      }
      jobs.push({ asset, to: single.to });
    }
    await grabAll(jobs, 'Clash Royale icons');
  }

  if (!only || only === 'badges') {
    await grabAll(playerBadges(assets), 'Clash Royale player badges');
  }

  if (!only || only === 'coc-heroes') {
    // A third index: the heroes live in the Clash of Clans kit.
    const cocByTitle = new Map();
    for (const asset of loadIndex('clash-of-clans')) {
      if (!cocByTitle.has(asset.title)) cocByTitle.set(asset.title, asset);
    }
    const cocJobs = [];
    for (const single of COC_SINGLES) {
      const asset = cocByTitle.get(single.title);
      if (!asset) {
        failed += 1;
        console.log(`  FAIL ${single.title} -> not in the fan-kit index`);
        continue;
      }
      cocJobs.push({ asset, to: single.to, width: single.width });
    }
    await grabAll(cocJobs, 'Clash of Clans heroes');
  }

  if (!only || only === 'bs-icons') {
    // A second index: the stat icons live in the Brawl Stars kit, not Royale's.
    const bsByTitle = new Map();
    for (const asset of loadIndex('brawl-stars')) {
      if (!bsByTitle.has(asset.title)) bsByTitle.set(asset.title, asset);
    }
    const bsJobs = [];
    for (const single of BS_SINGLES) {
      const asset = bsByTitle.get(single.title);
      if (!asset) {
        failed += 1;
        console.log(`  FAIL ${single.title} -> not in the fan-kit index`);
        continue;
      }
      bsJobs.push({ asset, to: single.to });
    }
    await grabAll(bsJobs, 'Brawl Stars stat icons');
  }

  console.log(`\n${downloaded} downloaded, ${skipped} already present, ${failed} failed.`);
  for (const gap of UNSOURCED) {
    console.log(`  not in the kit: ${gap.want} (would land as ${gap.to})`);
  }
  console.log('Next: bun run build:assets');
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
