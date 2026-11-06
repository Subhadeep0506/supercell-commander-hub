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

/**
 * Width requested from the CDN.
 *
 * Every url takes `?width=N` and the originals run to 8000px, so asking for
 * the size we actually want keeps the download from being gigabytes. 256 is
 * the largest any of this art renders at (3x on a 80px tile) and build-assets
 * downsamples from there.
 */
const WIDTH = 256;

/**
 * Hand-picked single images: fan-kit title -> pack path.
 *
 * Keyed by title because that is the only stable handle the index gives -- the
 * numeric ids are internal to the fan kit and the CDN urls are opaque hashes.
 *
 * Several of these are emotes or logos rather than purpose-built icons. That
 * is deliberate and is the same trade assets-req.md already records: a
 * right-feeling picture at 24px beats a hole in the row, and the fan kit has
 * no icon for "repair points" or "TV Royale" to be had.
 */
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

/**
 * A padlock for locked cards, which the kit does not have.
 *
 * Searching both fan-kit indexes for /lock/i turns up `Banner_LockStockAndBarrel`
 * and a furnace emote -- a banner and an animation, neither of which reads as
 * "you have not found this card". The collection tile therefore prints the word
 * LOCKED instead. Add a title here if one ever ships and the tile picks it up;
 * tracked in assets-req.md.
 */
const UNSOURCED = [{ want: 'padlock icon', to: 'cr/icons/lock.png' }];

/**
 * Player badges: every `badge_<Family>_lv<N>` in the kit.
 *
 * 1,192 images, 129 families. The API returns a badge `name` and `level` and
 * an `iconUrls.large` on api-assets.clashroyale.com -- which 403s on this
 * network, and which is a cold network request on every other one. Bundling
 * the whole set is ~4MB at 128px and makes the badge list render offline.
 *
 * The filename keeps the family and level separable (`xbow-lv5`) so
 * royale.ts can join an API badge to it without a generated map.
 */
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

/** Download with a small concurrency cap, to stay polite to the CDN. */
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
