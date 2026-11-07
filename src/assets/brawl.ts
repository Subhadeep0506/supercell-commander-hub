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



const str = (value: unknown): string | undefined =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;


export function brawlerArt(id: unknown): ImageSourcePropType | undefined {
  const key = str(id);
  return key ? bsBrawlerImages[key] : undefined;
}


export function portraitArt(id: unknown): ImageSourcePropType | undefined {
  const key = str(id);
  return key ? bsPortraitImages[key] : undefined;
}


export function modeArt(modeId: unknown): ImageSourcePropType | undefined {
  if (typeof modeId !== 'number' || !Number.isInteger(modeId) || modeId < 0) return undefined;
  return bsModeImages[String(48000000 + modeId)];
}


export function clubBadgeArt(badgeId: unknown): ImageSourcePropType | undefined {
  const key = str(badgeId);
  return key ? bsBadgeImages[key] : undefined;
}


export function playerIconArt(iconId: unknown): ImageSourcePropType | undefined {
  const key = str(iconId);
  return key ? bsIconImages[key] : undefined;
}


export function kitArt(id: unknown): ImageSourcePropType | undefined {
  const key = str(id);
  return key ? bsKitImages[key] : undefined;
}


export function prestigeArt(level: unknown): ImageSourcePropType | undefined {
  const key = str(level);
  return key ? bsPrestigeImages[key] : undefined;
}


export function rankArt(rankName: unknown): ImageSourcePropType | undefined {
  if (typeof rankName !== 'string') return undefined;
  const family = rankName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!family) return undefined;
  const key = family.charAt(0).toUpperCase() + family.slice(1);
  return bsRankImages[key];
}


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


export function mapArt(eventId: unknown): ImageSourcePropType | undefined {
  const key = str(eventId);
  return key ? bsMapImages[key] : undefined;
}
