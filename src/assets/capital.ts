import type { ImageSourcePropType } from 'react-native';
import { cocCapitalImages } from './registry.cocCapital';
import { leagueSlug, slug } from './slug';

/**
 * Artwork for the clan detail sheet: Clan Capital districts, capital and war
 * league badges, and clan label icons.
 *
 * Kept apart from art.ts because the lookup is by API *name* rather than by a
 * hand-maintained key map -- every one of these slugifies cleanly onto a
 * filename, so there is nothing to keep in sync by hand.
 */

/**
 * District tile artwork.
 *
 * Capital Peak is the Clan Capital's own hall and uses the capital-hall render
 * at `capitalHallLevel` (1-10). Every other district uses the generic district
 * hall at its own `districtHallLevel` (1-5). Levels are clamped rather than
 * missed: a future level 11 capital hall would otherwise render nothing.
 */
export function districtArt(name: unknown, level: unknown): ImageSourcePropType | undefined {
  const n = Number(level);
  if (!Number.isFinite(n) || n < 1) return undefined;
  const peak = slug(name) === 'capital-peak';
  const key = peak
    ? `capital-hall-${Math.min(10, Math.round(n))}`
    : `district-hall-${Math.min(5, Math.round(n))}`;
  return cocCapitalImages[key];
}

export function capitalLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueSlug(name);
  return key ? cocCapitalImages[`capital-league-${key}`] : undefined;
}

/**
 * War league badge.
 *
 * Returns undefined until the badges are dropped into
 * `assets/packs/coc/war-leagues/`. The API gives war leagues as id + name with
 * no icon URL, and neither artwork source carries them, so callers render a
 * text-only chip in the meantime.
 */
export function warLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueSlug(name);
  return key ? cocCapitalImages[`war-league-${key}`] : undefined;
}

export function clanLabelArt(name: unknown): ImageSourcePropType | undefined {
  const key = slug(name);
  return key ? cocCapitalImages[`label-${key}`] : undefined;
}

/** Raid Medals icon. Drop-in only; undefined until supplied. */
export function raidMedalArt(): ImageSourcePropType | undefined {
  return cocCapitalImages['raid-medal'];
}

/** Sad character for the empty states. Drop-in only; undefined until supplied. */
export function emptyStateArt(): ImageSourcePropType | undefined {
  return cocCapitalImages['empty-state'];
}
