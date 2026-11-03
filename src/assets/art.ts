import type { ImageSourcePropType } from 'react-native';
import { cocImages } from './registry.coc';
import { cocDetailImages } from './registry.cocDetail';
import { bookImages } from './registry.book';
import { logoImages } from './registry.logo';
import { navImages } from './registry.nav';
import { bookExtraImages } from './registry.bookExtra';
import { resourceImages } from './registry.resource';
import { superImages } from './registry.super';
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

const HALLS: Record<number, ImageSourcePropType | undefined> = {
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

/** Standalone icons the shell and search fields use. */
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
 * Home Village Super Troops, mapped to the troop they are a boost of.
 *
 * The player API returns these once unlocked, but the Clash Book catalog has
 * no entries for them -- they are temporary boosts, not separate units -- so
 * every one of them rendered as a text placeholder in the army grid.
 *
 * Seven have their own artwork (see SUPER_TROOP_ICONS in the asset pipeline).
 * The rest show their base troop's artwork, which is the same character; the
 * tile's own label still reads "Super Archer", so nothing is misrepresented.
 */
const SUPER_TROOP_BASE: Record<string, string> = {
  'Super Barbarian': 'home/barbarian',
  'Super Archer': 'home/archer',
  'Super Giant': 'home/giant',
  'Sneaky Goblin': 'home/goblin',
  'Super Wall Breaker': 'home/wall-breaker',
  'Rocket Balloon': 'home/balloon',
  'Super Wizard': 'home/wizard',
  'Super Dragon': 'home/dragon',
  'Inferno Dragon': 'home/baby-dragon',
  'Super Minion': 'home/minion',
  'Super Valkyrie': 'home/valkyrie',
  'Super Witch': 'home/witch',
  'Ice Hound': 'home/lava-hound',
  'Super Bowler': 'home/bowler',
  'Super Miner': 'home/miner',
  'Super Hog Rider': 'home/hog-rider',
  'Super Yeti': 'home/yeti',
};

/** Artwork for a Super Troop: its own icon, else its base troop's. */
export function superTroopArt(name: string): ImageSourcePropType | undefined {
  const own = superImages[name];
  if (own) return own;
  const base = SUPER_TROOP_BASE[name];
  return base ? bookArt(base)?.source : undefined;
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

/**
 * Per-image scale corrections for `coc/main` artwork.
 *
 * styles.css nudges a handful of images with attribute selectors
 * (`img[src$="war.png"] { transform: scale(2.2) }`) because the fan-kit art has
 * inconsistent padding. React Native has no equivalent, so the values are
 * applied explicitly by the component that draws the image.
 *
 * Only `coc/main` still needs this. The icon, nav and Clash Book sets are
 * trimmed to their alpha bounding box by scripts/build-assets.mjs, which fixes
 * the padding at source -- including the three `_face` hero portraits that
 * previously needed a 2.8x correction.
 */
export const ART_SCALE = {
  panelBuilder: 3,
  panelWar: 1.8,
  panelHeroPortrait: 1.3,
} as const;
