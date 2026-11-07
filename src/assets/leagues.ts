import type { ImageSourcePropType } from 'react-native';
import { cocLeagueImages } from './registry.cocLeague';
import { leagueFamily, leagueSlug } from './slug';
import type { LeagueTierInfo } from '@/lib/league-tier';




export function trophyLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueFamily(name);
  return key ? cocLeagueImages[`league-${key}`] : undefined;
}


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


export function leagueArt(info: LeagueTierInfo): ImageSourcePropType | undefined {
  if (info.system === 'ranked') return cocLeagueImages[`ranked-league-${info.family}`];
  if (info.system === 'builder') return builderLeagueArt(info.name);
  const trophyNamed = /\bleagues?\b/i.test(info.name);
  return trophyNamed
    ? (trophyLeagueArt(info.name) ?? rankedLeagueArt(info.name))
    : (rankedLeagueArt(info.name) ?? trophyLeagueArt(info.name));
}
