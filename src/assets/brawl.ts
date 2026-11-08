import type { ImageSourcePropType } from 'react-native';
import { bsBadgeImages } from './registry.bsBadge';
import { bsBrawlerImages } from './registry.bsBrawler';
import { bsIconImages } from './registry.bsIcon';
import { bsKitImages } from './registry.bsKit';
import { bsModeImages } from './registry.bsMode';
import { bsPortraitImages } from './registry.bsPortrait';
import { bsPrestigeImages } from './registry.bsPrestige';
import { bsRankImages } from './registry.bsRank';
import { bsStatImages } from './registry.bsStat';
import { bsMapImages } from './registry.bsMap';
import { arenaImages } from './registry.arena';

/**
 * Brawl Stars artwork.
 *
 * Every lookup here takes the id the API already gave us. That is the whole
 * reason the art comes from Brawlify/CDN rather than the official fan kit: the
 * player object says `icon: {id: 28000618}` and `badgeId: 8000021`, and the fan
 * kit files the same pictures under names like `profile_icon_ranked_godzilla`
 * with no id anywhere. There is no mapping table to write -- the filename *is*
 * the id -- so unlike `royale.ts` nothing here needs a generated map.
 *
 * Misses return undefined rather than a stand-in, matching `royale.ts`. A
 * brawler released after the last `bun run fetch:bs-assets` is genuinely
 * absent, and showing somebody else's portrait would be worse than the
 * caller's own fallback.
 */

const str = (value: unknown): string | undefined =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;

/** Square collection tile for a `brawler.id` (`16000017`), rarity border baked in. */
export function brawlerArt(id: unknown): ImageSourcePropType | undefined {
  const key = str(id);
  return key ? bsBrawlerImages[key] : undefined;
}

/** Wide portrait for a `brawler.id`, for the detail header. */
export function portraitArt(id: unknown): ImageSourcePropType | undefined {
  const key = str(id);
  return key ? bsPortraitImages[key] : undefined;
}

/**
 * Game mode icon for an `event.modeId`.
 *
 * **The files are keyed `48000000 + modeId`, not `modeId`.** Brawl Ball is
 * `modeId: 5` on the wire and `48000005.png` on disk. Nothing in either API
 * response hints at the offset; it comes from the game's own
 * `game_mode_variations` table, where the row index is the mode id and the
 * asset id is that index inside the 48xxxxxx space.
 *
 * Verified against every mode id in both captures (0, 2, 3, 5, 6, 20, 45, 48,
 * 75, 86) and contiguous across 48000000-48000090, which covers all 72 modes
 * `/v1/gamemodes` returns.
 */
export function modeArt(modeId: unknown): ImageSourcePropType | undefined {
  if (typeof modeId !== 'number' || !Number.isInteger(modeId) || modeId < 0) return undefined;
  return bsModeImages[String(48000000 + modeId)];
}

/** Club badge for a `badgeId` (`8000021`). */
export function clubBadgeArt(badgeId: unknown): ImageSourcePropType | undefined {
  const key = str(badgeId);
  return key ? bsBadgeImages[key] : undefined;
}

/** Player profile icon for an `icon.id` (`28000618`). */
export function playerIconArt(iconId: unknown): ImageSourcePropType | undefined {
  const key = str(iconId);
  return key ? bsIconImages[key] : undefined;
}

/**
 * Gadget, star power or gear icon.
 *
 * One set, because the id spaces are disjoint: gadgets and star powers share
 * 23xxxxxx but never collide inside it, and gears are 62xxxxxx.
 * `scripts/fetch-bs-assets.mjs` fails the build if that stops holding.
 *
 * **Hypercharges are not here and cannot be.** The API returns 106 hypercharge
 * ids in the same 23xxxxxx space, but Brawlify has no hypercharge directory at
 * all and the fan kit carries art for only eight of them. Those render as a
 * named chip with no icon.
 */
export function kitArt(id: unknown): ImageSourcePropType | undefined {
  const key = str(id);
  return key ? bsKitImages[key] : undefined;
}

/** Prestige badge for a `prestigeLevel` (0-13). */
export function prestigeArt(level: unknown): ImageSourcePropType | undefined {
  const key = str(level);
  return key ? bsPrestigeImages[key] : undefined;
}

/**
 * Ranked badge for a rank *name* like `"GOLD I"` or `"Mythic III"`.
 *
 * Keyed by league family, which is the first word title-cased -- the eight
 * files are Bronze, Silver, Gold, Diamond, Mythic, Legendary, Masters, Pro.
 * The API shouts its names (`rankedRankName: "GOLD I"`) while the game tables
 * title-case them, so the comparison has to be case-insensitive.
 *
 * Deliberately not using Brawlify's `ranked/tiered` set, whose 58000xxx ids
 * have no documented relationship to `rankedRank`. The tier numeral is drawn
 * as text beside this badge instead of being baked into it -- which also means
 * one file serves all three tiers of a family.
 */
export function rankArt(rankName: unknown): ImageSourcePropType | undefined {
  if (typeof rankName !== 'string') return undefined;
  const family = rankName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!family) return undefined;
  const key = family.charAt(0).toUpperCase() + family.slice(1);
  return bsRankImages[key];
}

/**
 * Named art for the stat tiles.
 *
 * One lookup rather than each screen reaching into four registries, because
 * the same figures appear on Home, in the player sheet and on the club roster
 * and had drifted to different pictures in each.
 *
 * Most of these are **not purpose-built stat icons** -- Brawl Stars has no
 * such set anywhere. They are the in-game art for the thing being counted,
 * which is the honest reading in every case but three:
 *
 *   `wins3v3`  Gem Grab. There is no 3v3 icon because 3v3 is a *category*,
 *              not a mode; Gem Grab is its canonical member.
 *   `power`    Power points -- the currency that raises a power level, so it
 *              pictures what the count is of without being a "level 11" mark.
 *   `champion` The Masters ranked badge, for Championship Challenge
 *              qualification. The kit has no championship icon.
 *
 * Those three are approximations the user chose over leaving the tiles bare.
 * Everything else is literal: Solo and Duo victories take their own mode
 * icons, Robo Rumble and Big Brawler take modeIds 8 and 7.
 */
export const BS_STAT = {
  trophy: arenaImages['trophy'],
  wins3v3: modeArt(0),
  winsSolo: modeArt(6),
  winsDuo: modeArt(9),
  roboRumble: modeArt(8),
  bigBrawler: modeArt(7),
  champion: bsRankImages['Masters'],
  fame: bsStatImages['fame'],
  xp: bsStatImages['xp'],
  power: bsStatImages['power'],
  prestige: bsStatImages['prestige'],
  brawler: arenaImages['bsicon'],
  club: arenaImages['brawlstats'],
} as const;

/**
 * Map render for an `event.id` (`15001270`) -- the id a battle log row and a
 * rotation slot both carry.
 *
 * These used to be the one art family fetched at runtime, from
 * cdn.brawlify.com through `RemoteImage`. That host is unreachable on the
 * development network, so the expanded battle only ever showed its fallback
 * and the map could not be reviewed; bundling them at 256px costs 11.6 MB and
 * means **the app now fetches no artwork at runtime at all**.
 *
 * Still returns undefined on a miss rather than a stand-in. A map added to the
 * game after the last `bun run fetch:bs-assets` genuinely is not here, and the
 * caller falls back to the mode icon.
 */
export function mapArt(eventId: unknown): ImageSourcePropType | undefined {
  const key = str(eventId);
  return key ? bsMapImages[key] : undefined;
}
