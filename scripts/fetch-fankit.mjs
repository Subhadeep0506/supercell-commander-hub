// Downloads artwork from Supercell's fan kit into assets/packs/, driven by the
// fan-kit index JSONs.
//
//   node --use-system-ca scripts/fetch-fankit.mjs [--force] [--only=<group>]
//   bun run fetch:fankit
//
// Why this exists alongside fetch-cr-assets.mjs: that script pulls from
// RoyaleAPI/cr-api-assets, which was last published 2026-03-05 and has no
// player badges at all. The fan kit has 1,192 of them -- every badge family at
// every level -- plus the Ultimate Champion league badge and a handful of UI
// icons the hand-sourced set was missing.
//
// It does *not* scrape fankit.supercell.com, which is blocked on this network
// (Zscaler, "Online and Other Games"). It reads a pre-fetched index of the fan
// kit -- `<game>-fankit-images.json`, a list of {id, title, url, width,
// height} -- and downloads from media.ffycdn.net, the CDN those urls point at,
// which is reachable.
//
// The index lives outside this repo by default (it is ~7MB across three
// games). Point --index at wherever it sits; the default is the parent
// directory, which is where it was dropped.
//
// --use-system-ca is required: this machine does TLS inspection and Node
// otherwise rejects every HTTPS call.
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
  // --- cr/icons -------------------------------------------------------------
  // The game switcher in the header. Clash of Clans already ships
  // coc/main/game-icon.png and Brawl Stars bs/main/bsicon.png; Royale was the
  // only one of the three with no square icon anywhere in the repo, and a
  // wordmark cannot sit in a 34px tab beside two app icons.
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

async function grab(asset, to) {
  const target = resolve(PACKS, to);
  if (!force && existsSync(target)) {
    skipped += 1;
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  // Ask the CDN to resize. `resized_url` is a template with a {width}
  // placeholder; the plain url takes the same query parameter.
  const url = asset.resized_url
    ? asset.resized_url.replace('{width}', String(WIDTH))
    : `${asset.url}?width=${WIDTH}`;
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


async function grabAll(jobs, label) {
  if (!jobs.length) return;
  console.log(`${label}: ${jobs.length} image(s)`);
  const queue = [...jobs];
  const workers = Array.from({ length: 8 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await grab(job.asset, job.to);
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
