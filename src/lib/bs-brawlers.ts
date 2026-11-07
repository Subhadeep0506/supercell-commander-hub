import meta from '@/data/bs/brawler-meta.json';
import { record, rows, type ApiRecord } from '@/api/game-api';



type BrawlerMeta = { name: string; code: string; class: string; rarity: string };
type RankBand = { name: string; rank: number; minElo: number; maxElo: number; hex: string };

const BRAWLERS = meta.brawlers as Record<string, BrawlerMeta>;
const RANKS = meta.rankedRanks as RankBand[];


export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  super_rare: 'Super Rare',
  epic: 'Epic',
  mega_epic: 'Mythic',
  legendary: 'Legendary',
  ultra_legendary: 'Ultra Legendary',
};


export const RARITY_ORDER = [
  'common',
  'rare',
  'super_rare',
  'epic',
  'mega_epic',
  'legendary',
  'ultra_legendary',
] as const;

/**
 * The in-game rarity colours.
 *
 * Only used for the filter chips and the rarity caption. The collection tiles
 * need no tinting of their own -- `brawlerArt` returns Brawlify's `borders`
 * set, which already has the rarity frame baked into the picture.
 */
export const RARITY_COLOR: Record<string, string> = {
  common: '#b9eaff',
  rare: '#2edd1c',
  super_rare: '#0087fa',
  epic: '#b116ec',
  mega_epic: '#fe0000',
  legendary: '#fff11e',
  ultra_legendary: '#f0a3ff',
};


export const CLASS_LABEL: Record<string, string> = {
  damage_dealer: 'Damage',
  tank: 'Tank',
  marksman: 'Marksman',
  artillery: 'Artillery',
  controller: 'Controller',
  assassin: 'Assassin',
  support: 'Support',
};

export const CLASS_ORDER = [
  'damage_dealer',
  'tank',
  'marksman',
  'artillery',
  'controller',
  'assassin',
  'support',
] as const;

export function brawlerMeta(id: unknown): BrawlerMeta | undefined {
  return typeof id === 'number' || typeof id === 'string' ? BRAWLERS[String(id)] : undefined;
}

export const rarityLabel = (rarity: unknown): string =>
  RARITY_LABEL[String(rarity)] ?? String(rarity ?? '');

export const classLabel = (name: unknown): string =>
  CLASS_LABEL[String(name)] ?? String(name ?? '');

/* ---- ranked ------------------------------------------------------------ */


export function rankBand(rankedRank: unknown): RankBand | undefined {
  return typeof rankedRank === 'number' ? RANKS.find((r) => r.rank === rankedRank) : undefined;
}


export function rankProgress(rankedRank: unknown, elo: unknown): number | undefined {
  const band = rankBand(rankedRank);
  if (!band || typeof elo !== 'number' || band.maxElo <= band.minElo) return undefined;
  const span = band.maxElo - band.minElo;
  return Math.max(0, Math.min(1, (elo - band.minElo) / span));
}


export const nextRank = (rankedRank: unknown): RankBand | undefined =>
  typeof rankedRank === 'number' ? RANKS.find((r) => r.rank === rankedRank + 1) : undefined;

/* ---- collection -------------------------------------------------------- */


export type CollectionEntry = {
  id: number;
  name: string;
  rarity: string;
  className: string;

  owned?: {
    power: number;
    rank: number;
    trophies: number;
    highestTrophies: number;
    prestigeLevel: number;
    currentWinStreak: number;
    maxWinStreak: number;
    skinName: string;
    gadgets: ApiRecord[];
    starPowers: ApiRecord[];
    gears: ApiRecord[];
    hyperCharges: ApiRecord[];
  };

  catalog: {
    gadgets: ApiRecord[];
    starPowers: ApiRecord[];
    gears: ApiRecord[];
    hyperCharges: ApiRecord[];
  };
};

const int = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * Joins the full catalog to a player's `brawlers[]`.
 *
 * Every brawler in the game appears, unlocked or not -- the grid greys the
 * locked ones rather than hiding them, so "15 still to unlock" is visible
 * rather than inferred from a count that stops at 96.
 */
export function collection(catalogItems: unknown, playerBrawlers: unknown): CollectionEntry[] {
  const mine = new Map<number, ApiRecord>();
  for (const brawler of rows(playerBrawlers)) {
    if (typeof brawler.id === 'number') mine.set(brawler.id, brawler);
  }

  return rows(catalogItems)
    .filter((item): item is ApiRecord & { id: number } => typeof item.id === 'number')
    .map((item) => {
      const info = brawlerMeta(item.id);
      const owned = mine.get(item.id);
      const skin = record(owned?.skin);
      return {
        id: item.id,
        name: typeof item.name === 'string' ? item.name : (info?.name ?? ''),
        rarity: info?.rarity ?? '',
        className: info?.class ?? '',
        catalog: {
          gadgets: rows(item.gadgets),
          starPowers: rows(item.starPowers),
          gears: rows(item.gears),
          hyperCharges: rows(item.hyperCharges),
        },
        owned: owned && {
          power: int(owned.power),
          rank: int(owned.rank),
          trophies: int(owned.trophies),
          highestTrophies: int(owned.highestTrophies),
          prestigeLevel: int(owned.prestigeLevel),
          currentWinStreak: int(owned.currentWinStreak),
          maxWinStreak: int(owned.maxWinStreak),
          skinName: typeof skin.name === 'string' ? skin.name : '',
          gadgets: rows(owned.gadgets),
          starPowers: rows(owned.starPowers),
          gears: rows(owned.gears),
          hyperCharges: rows(owned.hyperCharges),
        },
      };
    });
}


export function collectionSummary(entries: CollectionEntry[]) {
  const owned = entries.filter((e) => e.owned);
  const trophies = owned.reduce((sum, e) => sum + (e.owned?.trophies ?? 0), 0);
  return {
    owned: owned.length,
    total: entries.length,
    maxed: owned.filter((e) => (e.owned?.power ?? 0) >= 11).length,
    prestiged: owned.filter((e) => (e.owned?.prestigeLevel ?? 0) > 0).length,
    /**
     * Exact, not an estimate. `player.trophies` equals the sum of
     * `brawlers[].trophies` on both captured accounts (1,448 and 36,447 on the
     * first, 79,407 on the second), so a per-brawler contribution breakdown
     * needs no second source and cannot disagree with the headline figure.
     */
    trophies,

    gadgets: owned.reduce((n, e) => n + (e.owned?.gadgets.length ?? 0), 0),
    starPowers: owned.reduce((n, e) => n + (e.owned?.starPowers.length ?? 0), 0),
    hyperCharges: owned.reduce((n, e) => n + (e.owned?.hyperCharges.length ?? 0), 0),
  };
}
