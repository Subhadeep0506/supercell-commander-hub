import type { ImageSourcePropType } from 'react-native';
import { arenaImages } from './registry.arena';
import { crArenaImages } from './registry.crArena';
import { crBadgeImages } from './registry.crBadge';
import { crChestImages } from './registry.crChest';
import { crIconImages } from './registry.crIcon';
import { crLeagueImages } from './registry.crLeague';
import { crPlayerBadgeImages } from './registry.crPlayerBadge';
import { crPolImages } from './registry.crPol';
import { crTokenImages } from './registry.crToken';
import badgeMap from '@/data/cr/badge-map.json';
import arenaMap from '@/data/cr/arena-map.json';



const BADGES = badgeMap as Record<string, string>;
const ARENAS = arenaMap as Record<string, string>;

/**
 * Clan crest for a `badgeId`.
 *
 * Clash of Clans supplies `badgeUrls` and this is a remote image; Clash Royale
 * supplies neither, which is why the whole map exists.
 */
export function clanBadgeArt(badgeId: unknown): ImageSourcePropType | undefined {
  if (typeof badgeId !== 'number' && typeof badgeId !== 'string') return undefined;
  const name = BADGES[String(badgeId)];
  return name ? crBadgeImages[name] : undefined;
}

/**
 * Arena art for an `arena.id` (`54000024`), via its arena number.
 *
 * Merge Tactics (`168000xxx`) and seasonal arenas are not in the dataset at
 * all, so those legitimately return undefined.
 */
export function arenaBadgeArt(arenaId: unknown): ImageSourcePropType | undefined {
  if (typeof arenaId !== 'number' && typeof arenaId !== 'string') return undefined;
  const key = ARENAS[String(arenaId)];
  return key ? crArenaImages[key] : undefined;
}


export function leagueBadgeArt(leagueNumber: unknown): ImageSourcePropType | undefined {
  const n = Number(leagueNumber);
  if (!Number.isFinite(n)) return undefined;
  return crPolImages[`pol${n}`] ?? crLeagueImages[`league${n}`];
}

/**
 * Chest names the upstream filenames do not match directly.
 *
 * Everything else slugs cleanly: "Mega Lightning Chest" drops the suffix and
 * becomes `chest-megalightning`.
 */
const CHEST_ALIASES: Record<string, string> = {
  'golden chest': 'chest-gold',
  'overflowing gold crate': 'chest-overflowgoldcrate',
  'plentiful gold crate': 'chest-plentifulgoldcrate',
  "king's chest": 'chest-king',
  "legendary king's chest": 'chest-kinglegendary',
};


export function chestArt(name: unknown): ImageSourcePropType | undefined {
  if (typeof name !== 'string') return undefined;
  const alias = CHEST_ALIASES[name.toLowerCase().trim()];
  if (alias) return crChestImages[alias];
  // "Mega Lightning Chest" -> "chest-megalightning"; "Gold Crate" keeps its
  // whole name because only the trailing word "Chest" is redundant.
  const slug = name
    .toLowerCase()
    .replace(/\bchest\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return slug ? crChestImages[`chest-${slug}`] : undefined;
}


export function rarityTokenArt(rarity: unknown): ImageSourcePropType | undefined {
  if (typeof rarity !== 'string') return undefined;
  return crTokenImages[`tt-${rarity.toLowerCase()}`];
}


const BADGE_LEVELS = (() => {
  const top = new Map<string, number>();
  for (const key of Object.keys(crPlayerBadgeImages)) {
    const match = /^(.+)-lv(\d+)$/.exec(key);
    if (!match) continue;
    const family = match[1]!;
    const level = Number(match[2]);
    top.set(family, Math.max(top.get(family) ?? 0, level));
  }
  return top;
})();


const BADGE_ALIASES: Record<string, string> = {
  bannercollection: 'bannerscollected',
  clanwarwins: 'clanwars2',
  clanwars: 'clanwars2',
  classic12wins: 'classicchallengetriumph',
  grand12wins: 'grandchallengetriumph',
  laddertournamenttop1000: 'toprankedfinishes',
  topladdertournament: 'toprankedfinishes',
  royaltournamentfinishes: 'toproyaltournamentfinishes',
  suddendeathwin: 'suddendeathwins',
  crlspectator: 'crlspectator2022',
  crlcompetitor: 'crlcompetitor2022',
};


export function playerBadgeArt(name: unknown, level: unknown): ImageSourcePropType | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  const bare = name.replace(/^Mastery/, '');
  const key = bare.toLowerCase().replace(/[^a-z0-9]/g, '');
  const family = BADGE_ALIASES[key] ?? key;
  const top = BADGE_LEVELS.get(family);
  if (top === undefined) return undefined;
  // API levels are 1-based and the files are 0-based, so level 1 is `lv0`.
  // An absent level means the badge has no progression -- the one-off esports
  // badges -- which is `lv0`.
  const index = Math.min(Math.max(Math.floor(Number(level) || 1) - 1, 0), top);
  return crPlayerBadgeImages[`${family}-lv${index}`];
}


export const CR_ICONS = {
  // From the card set.
  king: arenaImages['king'],
  crown: arenaImages['crown'],
  trophy: arenaImages['trophy'],
  clan: arenaImages['clan'],
  cardsAlt: arenaImages['cards'],

  // Hand-sourced.
  elixir: crIconImages['elixir'],
  star: crIconImages['star'],
  members: crIconImages['members'],
  cards: crIconImages['cards'],
  battle: crIconImages['battle'],
  clanWars: crIconImages['clanwars'],
  tournament: crIconImages['tournament'],
  trade: crIconImages['trade'],
  experience: crIconImages['experience'],

  crownRed: crIconImages['crownred'],
  crownBlue: crIconImages['crownblue'],
  book: crIconImages['book'],
  key: crIconImages['key'],
  globe: crIconImages['globe'],
  shop: crIconImages['shop'],
  target: crIconImages['target'],
  tree: crIconImages['tree'],
  ranked: crIconImages['ranked'],

  // From the fan kit, via scripts/fetch-fankit.mjs. The kit has no purpose-
  // built UI icon for any of these, so each is the closest real art in it --
  // see the table in that script for which title serves which meaning.

  hammer: crIconImages['hammer'],

  fame: crIconImages['fame'],

  evolution: crIconImages['evolution'],

  streak: crIconImages['streak'],

  heart: crIconImages['heart'],

  mastery: crIconImages['mastery'],

  pathOfLegend: crIconImages['pathoflegend'],

  tvRoyale: crIconImages['tvroyale'],
} as const;

export type CrIconName = keyof typeof CR_ICONS;

