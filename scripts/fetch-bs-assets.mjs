// Downloads Brawl Stars artwork into assets/packs/bs/ for build-assets.mjs.
//
//   node --use-system-ca --no-warnings scripts/fetch-bs-assets.mjs [--force] [--only=<group>]
//   bun run fetch:bs-assets
//
// Source is Brawlify/CDN, which is the only set of Brawl Stars art keyed by the
// *numeric ids the API actually returns*. That matters more than it sounds:
// `/v1/players/{tag}` gives `icon: {id: 28000618}` and `badgeId: 8000021`, and
// the official fan kit files the same images under names like
// `profile_icon_ranked_godzilla`. There is no id -> name mapping anywhere, so
// the fan kit cannot answer "draw this player's icon" at all. Brawlify can.
//
// It pulls from raw.githubusercontent.com rather than cdn.brawlify.com. Both
// serve identical bytes -- the CDN is a Cloudflare Pages mirror of this repo --
// but the CDN answers a Zscaler 403 on this network while GitHub raw does not.
// Same reasoning as fetch-fankit.mjs preferring media.ffycdn.net.
//
// --use-system-ca is required: this machine does TLS inspection and Node
// otherwise rejects every HTTPS call.
//
// Maps were originally left out of this script -- 1,399 files and 58.7 MB --
// and loaded at runtime from cdn.brawlify.com instead. That was the only
// artwork in the app behind a network call, and it never resolved on the
// development network, so the expanded battle always showed its fallback and
// the map could not be reviewed at all. They are bundled now as 256px
// thumbnails, which is the size the battle sheet draws them at, and the app no
// longer fetches artwork at runtime from anywhere.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = resolve(root, 'assets/packs/bs');

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);

const REPO = 'Brawlify/CDN';
const BRANCH = 'master';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

/**
 * Source directory -> pack directory.
 *
 * `into` groups several sources into one pack dir where their id spaces do not
 * overlap. Gadgets, star powers and gears all land in `kit`: gadget and star
 * power ids share the 23xxxxxx space but are unique within it, and gears are
 * 62xxxxxx. The collision check below enforces that rather than trusting it.
 *
 * `regular` is used for gadgets and star powers rather than `borderless`.
 * Brawlify marks borderless deprecated and it shows: it is missing 28 of the
 * 222 ids the live catalog returns, while regular has all 222.
 *
 * Hypercharges have no artwork in any source -- Brawlify has no hypercharge
 * directory, and the fan kit carries art for only eight of the 106 that exist.
 * Those rows render as a named chip with no icon; see BsBrawlerDetail.
 */
const GROUPS = [
  // Square tiles with the rarity border baked in -- the collection grid.
  { name: 'brawler', from: 'brawlers/borders/', into: 'brawler' },
  // Wide portraits for the brawler detail header.
  { name: 'portrait', from: 'brawlers/portraits/', into: 'portrait' },
  // Keyed by 48000000 + modeId. NOT by modeId: the API's `modeId` is 5 for
  // Brawl Ball and the file is 48000005.png. build-assets keeps the filename,
  // and src/assets/brawl.ts applies the offset on lookup.
  { name: 'mode', from: 'game-modes/regular/', into: 'mode' },
  { name: 'badge', from: 'club-badges/regular/', into: 'badge' },
  // Keyed by league *name* (Gold.png, Mythic.png), not by id. The player object
  // gives `rankedRankName: "GOLD I"`, whose first word is the family -- a
  // mapping we can verify, unlike ranked/tiered's 58000xxx ids which have no
  // documented relationship to `rankedRank`.
  { name: 'rank', from: 'ranked/regular/', into: 'rank' },
  { name: 'kit', from: 'gadgets/regular/', into: 'kit' },
  { name: 'kit', from: 'star-powers/regular/', into: 'kit' },
  { name: 'kit', from: 'gears/regular/', into: 'kit' },
  // Keyed 0-13, matching `prestigeLevel` / `totalPrestigeLevel` directly.
  { name: 'prestige', from: 'prestiges/tiered/', into: 'prestige' },
  // 1,405 files, ~12.6 MB. The largest group by a wide margin and the one that
  // makes every player row, roster row and leaderboard row look right.
  { name: 'icon', from: 'profile-icons/regular/', into: 'icon' },
  // Keyed by `event.id`, which is what a battle log row and a rotation slot
  // both carry -- 1,399 files, the largest raw group at 58.7 MB before the
  // build step scales them down.
  { name: 'map', from: 'maps/regular/', into: 'map' },
];

console.log(`Listing ${REPO}@${BRANCH}...`);
const tree = await fetch(
  `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`,
).then((r) => {
  if (!r.ok) throw new Error(`GitHub tree listing failed: ${r.status}`);
  return r.json();
});
if (tree.truncated) throw new Error('GitHub truncated the tree listing; cannot enumerate assets.');

const paths = tree.tree.filter((t) => t.type === 'blob' && t.path.endsWith('.png')).map((t) => t.path);

/** Everything to download, after collision checking. */
const jobs = [];
/** pack-relative destination -> source path, to catch two sources colliding. */
const claimed = new Map();

for (const group of GROUPS) {
  if (only && group.name !== only) continue;
  const matches = paths.filter((p) => p.startsWith(group.from));
  if (!matches.length) throw new Error(`No files under ${group.from} -- has the repo moved?`);

  for (const path of matches) {
    const file = path.slice(group.from.length);
    const dest = `${group.into}/${file}`;
    const prior = claimed.get(dest);
    if (prior && prior !== path) {
      throw new Error(`Collision: ${prior} and ${path} both want assets/packs/bs/${dest}`);
    }
    claimed.set(dest, path);
    jobs.push({ path, dest: resolve(PACKS, dest) });
  }
  console.log(`  ${group.from.padEnd(26)} ${String(matches.length).padStart(5)} files`);
}

const pending = force ? jobs : jobs.filter((j) => !existsSync(j.dest));
console.log(
  `\n${jobs.length} files total, ${pending.length} to download${force ? ' (--force)' : ''}.`,
);

for (const dir of new Set(pending.map((j) => dirname(j.dest)))) {
  mkdirSync(dir, { recursive: true });
}

/**
 * Eight at a time.
 *
 * Serial would take the better part of an hour for 2,000 small files, and
 * unbounded parallelism gets the IP throttled by GitHub partway through --
 * which fails silently as a handful of truncated PNGs rather than as an error.
 */
const CONCURRENCY = 8;
let done = 0;
let failed = [];

async function worker(queue) {
  for (;;) {
    const job = queue.pop();
    if (!job) return;
    try {
      const response = await fetch(RAW + job.path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      // A truncated or error-page response is not a PNG. Writing one would
      // fail later inside sharp, a long way from the cause.
      if (body.length < 8 || body[0] !== 0x89 || body[1] !== 0x50) {
        throw new Error(`not a PNG (${body.length} bytes)`);
      }
      writeFileSync(job.dest, body);
    } catch (error) {
      failed.push(`${job.path}: ${error.message}`);
    }
    done++;
    if (done % 100 === 0 || done === pending.length) {
      process.stdout.write(`\r  ${done}/${pending.length}`);
    }
  }
}

const queue = [...pending].reverse();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
process.stdout.write('\n');

if (failed.length) {
  console.error(`\n${failed.length} downloads failed:`);
  failed.slice(0, 20).forEach((f) => console.error('  ' + f));
  process.exit(1);
}

console.log(`\nDone. Run \`bun run build:assets\` to convert and generate the registries.`);
