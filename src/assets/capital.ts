import type { ImageSourcePropType } from 'react-native';
import { cocCapitalImages } from './registry.cocCapital';
import { leagueSlug, slug } from './slug';




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


export function warLeagueArt(name: unknown): ImageSourcePropType | undefined {
  const key = leagueSlug(name);
  return key ? cocCapitalImages[`war-league-${key}`] : undefined;
}

export function clanLabelArt(name: unknown): ImageSourcePropType | undefined {
  const key = slug(name);
  return key ? cocCapitalImages[`label-${key}`] : undefined;
}


export function raidMedalArt(): ImageSourcePropType | undefined {
  return cocCapitalImages['raid-medal'];
}


export function emptyStateArt(): ImageSourcePropType | undefined {
  return cocCapitalImages['empty-state'];
}
