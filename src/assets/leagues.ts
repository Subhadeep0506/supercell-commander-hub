import type { ImageSourcePropType } from 'react-native';
import { cocLeagueImages } from './registry.cocLeague';
import { leagueFamily, leagueSlug } from './slug';
import type { LeagueTierInfo } from '@/lib/league-tier';

/**
 * League badges for the player ladders.
 *
 * The ranking endpoints name a player's league but the artwork behind
 * `iconUrls` lives on Supercell's CDN, which is unreachable on a restricted
 * network -- and when it is, the ladder renders no badge at all. These are the
 * bundled equivalents, so the column keeps its meaning offline.
 *
 * Three systems, keyed by what the API calls them:
 *
 *   league-*         Home Village trophy leagues, per family (fan kit)
 *   ranked-league-*  League Tiers, per family (clash-of-clans-data)
 *   bb-league-*      Builder Base leagues, per tier (clash-of-clans-data)
 *
 * Only the ranked set needs a tier drawn onto it: the other two already ship
 * one badge per tier, or are drawn per family in game too. `LeagueTierBadge`
 * is what adds the I/II/III.
 */

/** Home Village trophy league: "Crystal League II" -> `league-crystal`. */
export function trophyLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueFamily(name);
  return key ? cocLeagueImages[`league-${key}`] : undefined;
}

/** League Tier: "Wizard League 11" -> `ranked-league-wizard`. */
export function rankedLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueFamily(name);
  return key ? cocLeagueImages[`ranked-league-${key}`] : undefined;
}

/**
 * Builder Base league: "Titanium League II" -> `bb-league-titanium-ii`.
 *
 * This set is the one drawn per tier, so the exact tier is tried first. The
 * family is the fallback for a tier the dataset has not caught up with -- a
 * new "Diamond II" would otherwise render nothing at all.
 */
export function builderLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const tier = leagueSlug(name);
  if (tier && cocLeagueImages[`bb-league-${tier}`]) return cocLeagueImages[`bb-league-${tier}`];
  const family = leagueFamily(name);
  return family ? cocLeagueImages[`bb-league-${family}`] : undefined;
}

/**
 * The badge for a league already parsed by `leagueTierInfo`.
 *
 * The parse decides which set to draw from, because "Unranked" is a valid
 * name in all three and each files it under a different key.
 *
 * The trophy branch still has to guess, because that set and the ranked one
 * share two family names: `legend` and `titan` exist in both, so order alone
 * would render the ranked Legend badge for a plain trophy "Legend League".
 * The word "League" is the tell -- trophy names carry it, a bare ranked
 * family name does not.
 */
export function leagueArt(info: LeagueTierInfo): ImageSourcePropType | undefined {
  if (info.system === 'ranked') return cocLeagueImages[`ranked-league-${info.family}`];
  if (info.system === 'builder') return builderLeagueArt(info.name);
  const trophyNamed = /\bleagues?\b/i.test(info.name);
  return trophyNamed
    ? (trophyLeagueArt(info.name) ?? rankedLeagueArt(info.name))
    : (rankedLeagueArt(info.name) ?? trophyLeagueArt(info.name));
}
