import type { ImageSourcePropType } from 'react-native';
import { arenaImages } from './registry.arena';
import { cocImages } from './registry.coc';
import { cocDetailImages } from './registry.cocDetail';
import { crIconImages } from './registry.crIcon';
import { bookImages } from './registry.book';
import { logoImages } from './registry.logo';
import { navImages } from './registry.nav';
import { bookExtraImages } from './registry.bookExtra';
import { bookLevelImages } from './registry.bookLevel';
import { resourceImages } from './registry.resource';
import artTitles from '@/data/clash-book/art-titles.json';

/**
 * Replaces frontend/src/lib/coc-art.ts and coc-detail-art.ts.
 *
 * Same exported shape, so call sites port unchanged -- only the backing data
 * moved from Lovable CDN pointers to bundled WebP.
 */

const DETAIL_ART: Record<string, ImageSourcePropType | undefined> = {
  trophy: cocDetailImages['trophy'],
  clock: cocDetailImages['clock'],
  gold: cocDetailImages['gold'],
  elixir: cocDetailImages['elixir'],
  'dark-elixir': cocDetailImages['dark-elixir'],
  legend: cocDetailImages['legend'],
  star: cocDetailImages['star'],
  'Lightning Spell': cocDetailImages['lightning-spell'],
  'Healing Spell': cocDetailImages['healing-spell'],
  'Rage Spell': cocDetailImages['rage-spell'],
  'Jump Spell': cocDetailImages['jump-spell'],
  'Freeze Spell': cocDetailImages['freeze-spell'],
  'Poison Spell': cocDetailImages['poison-spell'],
  'Earthquake Spell': cocDetailImages['earthquake-spell'],
  'Haste Spell': cocDetailImages['haste-spell'],
  'Clone Spell': cocDetailImages['clone-spell'],
  'Skeleton Spell': cocDetailImages['skeleton-spell'],
  'Bat Spell': cocDetailImages['bat-spell'],
  'Invisibility Spell': cocDetailImages['invisibility-spell'],
  'Recall Spell': cocDetailImages['recall-spell'],
  'Overgrowth Spell': cocDetailImages['overgrowth-spell'],
  'Revive Spell': cocDetailImages['revive-spell'],
};

export const COC_ART: Record<string, ImageSourcePropType | undefined> = {
  'Barbarian King': cocImages['barbarian-king'],
  'Archer Queen': cocImages['archer-queen'],
  'Grand Warden': cocImages['grand-warden'],
  'Royal Champion': cocImages['royal-champion'],
  'Minion Prince': cocImages['minion-prince'],
  'Dragon Duke': cocImages['dragon-duke'],
  Barbarian: cocImages['barbarian'],
  Archer: cocImages['archer'],
  Dragon: cocImages['dragon'],
  war: cocImages['war'],
  trophy: cocImages['trophy'],
  pets: cocImages['pets'],
  builder: cocImages['builder'],
  // Spread last, matching coc-art.ts -- the detail trophy icon deliberately
  // overrides the main one.
  ...DETAIL_ART,
};

/**
 * Town Hall artwork by level.
 *
 * 9-18 come from the fan kit, 1-8 from clash-of-clans-data -- see the
 * LOW_TOWN_HALLS block in scripts/build-assets.mjs. Before those were added
 * every roster row, ladder entry and war member below TH9 rendered nothing.
 */
const HALLS: Record<number, ImageSourcePropType | undefined> = {
  1: cocImages['town-hall-1'],
  2: cocImages['town-hall-2'],
  3: cocImages['town-hall-3'],
  4: cocImages['town-hall-4'],
  5: cocImages['town-hall-5'],
  6: cocImages['town-hall-6'],
  7: cocImages['town-hall-7'],
  8: cocImages['town-hall-8'],
  9: cocImages['town-hall-9'],
  10: cocImages['town-hall-10'],
  11: cocImages['town-hall-11'],
  12: cocImages['town-hall-12'],
  13: cocImages['town-hall-13'],
  14: cocImages['town-hall-14'],
  15: cocImages['town-hall-15'],
  16: cocImages['town-hall-16'],
  17: cocImages['town-hall-17'],
  18: cocImages['town-hall-18'],
};

export function townHallArt(level: unknown): ImageSourcePropType | undefined {
  return HALLS[Number(level)];
}


export const UI_ART = {
  search: cocImages['magnifying_glass'],
  social: cocImages['hud_button_social'],
  gameIcon: cocImages['game-icon'],
  sword: cocImages['sword'],
  bookIcon: bookImages['book-icon'],
} as const;

export const GAME_LOGOS = {
  coc: logoImages['coc'],
  cr: logoImages['cr'],
  bs: logoImages['bs'],
} as const;


export const GAME_ICONS = {
  coc: cocImages['game-icon'],
  cr: crIconImages['appicon'],
  bs: arenaImages['bsicon'],
} as const;

/**
 * Bottom-nav icons, trimmed to their content by the asset pipeline so they all
 * carry the same visual weight in an identical box. Drawn from the Clash Book
 * artwork, which is one consistent render style, rather than the mix of
 * character art, HUD buttons and flat icons the reference used.
 */
export const NAV_ART = {
  home: navImages['home'],
  war: navImages['war'],
  builder: navImages['builder'],
  clan: navImages['clan'],
  rankings: navImages['rankings'],
  book: navImages['book'],
} as const;

const TITLES = artTitles as Record<string, string>;

/**
 * Clash Book artwork for a catalog item.
 *
 * The catalog id "home/hero-hall" is stored as the file "home_hero-hall", so
 * the slash is translated here rather than inverted at build time -- an
 * underscore in a filename is ambiguous, a slash in an id is not.
 */
export function bookArt(id: string): { source: ImageSourcePropType; title: string } | undefined {
  const key = id.replace(/\//g, '_');
  // Official fan-kit artwork first. It covers 205 of the 265 catalog items;
  // the rest fall back to clash-of-clans-data, which has the other 60.
  const source = bookImages[key] ?? bookExtraImages[key];
  return source ? { source, title: TITLES[id] ?? '' } : undefined;
}

/**
 * Which levels of an item have artwork of their own.
 *
 * Built once from the generated registry's keys rather than stored as a second
 * table, so the two can never disagree. ~1,800 keys, parsed at module load.
 */
const LEVELS_WITH_ART = (() => {
  const map = new Map<string, number[]>();
  for (const key of Object.keys(bookLevelImages)) {
    const cut = key.lastIndexOf('_l');
    if (cut < 0) continue;
    const id = key.slice(0, cut);
    const level = Number(key.slice(cut + 2));
    if (!Number.isFinite(level)) continue;
    const list = map.get(id);
    if (list) list.push(level);
    else map.set(id, [level]);
  }
  for (const list of map.values()) list.sort((a, b) => a - b);
  return map;
})();


export function bookArtAt(
  id: string,
  level?: number,
): { source: ImageSourcePropType; title: string } | undefined {
  const key = id.replace(/\//g, '_');
  const wanted = Number(level);
  if (Number.isFinite(wanted) && wanted > 0) {
    const exact = bookLevelImages[`${key}_l${wanted}`];
    if (exact) return { source: exact, title: TITLES[id] ?? '' };
    const available = LEVELS_WITH_ART.get(key);
    if (available) {
      let best: number | undefined;
      for (const candidate of available) {
        if (candidate > wanted) break;
        best = candidate;
      }
      const source = best === undefined ? undefined : bookLevelImages[`${key}_l${best}`];
      if (source) return { source, title: TITLES[id] ?? '' };
    }
  }
  return bookArt(id);
}


export function hasLevelArt(id: string): boolean {
  return LEVELS_WITH_ART.has(id.replace(/\//g, '_'));
}

/**
 * Icon for a currency, keyed by the exact string the catalog uses in
 * `upgradeCostResource` ("Dark Elixir", "Builder Gold", …).
 *
 * Compound values like "Gold or Elixir" fall back to the first currency named,
 * which is the one the icon column is really indicating.
 */
export function resourceArt(name: string): ImageSourcePropType | undefined {
  const direct = resourceImages[name];
  if (direct) return direct;
  const first = name.split(/\s+or\s+/i)[0];
  return first ? resourceImages[first] : undefined;
}


export const ART_SCALE = {
  panelBuilder: 3,
  panelWar: 1.8,
  panelHeroPortrait: 1.3,
} as const;
