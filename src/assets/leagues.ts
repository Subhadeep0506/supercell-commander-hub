import type { ImageSourcePropType } from 'react-native';
import { cocLeagueImages } from './registry.cocLeague';
import { leagueFamily, leagueSlug } from './slug';
import { record, type ApiRecord } from '@/api/game-api';

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
 *   ranked-league-*  Ranked leagues, per family (clash-of-clans-data)
 *   bb-league-*      Builder Base leagues, per tier (clash-of-clans-data)
 */

/** Home Village trophy league: "Crystal League II" -> `league-crystal`. */
export function trophyLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueFamily(name);
  return key ? cocLeagueImages[`league-${key}`] : undefined;
}

/** Ranked league: "Skeleton 2" -> `ranked-league-skeleton`. */
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
 * The badge for a player row on whichever ladder is showing.
 *
 * Home mode has to serve two league systems. The October 2025 update replaced
 * trophy leagues with named ones (Barbarian ... Legend), and both shapes are
 * still in circulation, so rather than commit to one this keys both off the
 * same `league.name`.
 *
 * `legend` and `titan` name a family in *both* sets, so order is not enough to
 * separate them -- picking ranked first renders the Ranked Legend badge for a
 * plain trophy "Legend League". The word "League" is what tells them apart:
 * trophy names carry it ("Legend League", "Titan League I"), ranked names do
 * not ("Legend", "Titan 2").
 */
export function playerLeagueArt(
  entry: ApiRecord,
  mode: 'home' | 'builder' | 'capital',
): ImageSourcePropType | undefined {
  if (mode === 'builder') {
    const builder = record(entry['builderBaseLeague'])['name'];
    return builderLeagueArt(builder);
  }
  const name = record(entry['league'])['name'];
  const trophyNamed = typeof name === 'string' && /\bleagues?\b/i.test(name);
  return trophyNamed
    ? (trophyLeagueArt(name) ?? rankedLeagueArt(name))
    : (rankedLeagueArt(name) ?? trophyLeagueArt(name));
}
