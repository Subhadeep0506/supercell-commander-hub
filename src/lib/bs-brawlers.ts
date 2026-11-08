import meta from '@/data/bs/brawler-meta.json';
import { record, rows, type ApiRecord } from '@/api/game-api';

/**
 * Brawler metadata and collection maths.
 *
 * `/v1/brawlers` returns `{id, name, starPowers, gadgets, gears, hyperCharges}`
 * and nothing else -- no rarity, no class, no description. Both come from the
 * game's own csv_logic tables instead, converted once by
 * `scripts/fetch-bs-data.mjs` into `src/data/bs/brawler-meta.json`. That file
 * resolves all 111 live brawlers; the script refuses to write a partial one.
 */

type BrawlerMeta = { name: string; code: string; class: string; rarity: string };
type RankBand = { name: string; rank: number; minElo: number; maxElo: number; hex: string };

const BRAWLERS = meta.brawlers as Record<string, BrawlerMeta>;
const RANKS = meta.rankedRanks as RankBand[];

/**
 * Display names for the seven rarities.
 *
 * Hand-mapped rather than pulled from `locales.csv`, for one reason that is
 * not laziness: the internal name `mega_epic` is **"Mythic"** in game. A
 * mechanical de-snake-casing would print "Mega Epic", which no player has ever
 * seen, on the 45 brawlers that carry it -- the single largest rarity bucket.
 */
export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  super_rare: 'Super Rare',
  epic: 'Epic',
  mega_epic: 'Mythic',
  legendary: 'Legendary',
  ultra_legendary: 'Ultra Legendary',
};

/** Ascending, for sorting and for the order of the filter chips. */
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

/** Display names for the seven class archetypes. */
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

/**
 * The Elo band for a `rankedRank`.
 *
 * Keyed on the number rather than on `rankedRankName`, because the number is
 * unambiguous and the name is not: the API shouts ("MYTHIC III") while the
 * tables title-case, and a missing `rankedRankName` is a real response -- the
 * ghost profile in the capture has `rankedRank: 0` and no name field at all.
 */
export function rankBand(rankedRank: unknown): RankBand | undefined {
  return typeof rankedRank === 'number' ? RANKS.find((r) => r.rank === rankedRank) : undefined;
}

/**
 * How far through the current rank's Elo band a player is, 0-1.
 *
 * Returns undefined where no meter should be drawn: unranked, or Pro, which is
 * the top band and carries `maxElo: 0` to mean "no ceiling" rather than an
 * empty range. Drawing a bar that is always full, or always empty, says less
 * than drawing none.
 */
export function rankProgress(rankedRank: unknown, elo: unknown): number | undefined {
  const band = rankBand(rankedRank);
  if (!band || typeof elo !== 'number' || band.maxElo <= band.minElo) return undefined;
  const span = band.maxElo - band.minElo;
  return Math.max(0, Math.min(1, (elo - band.minElo) / span));
}

/** The next band up, or undefined at the top of the ladder. */
export const nextRank = (rankedRank: unknown): RankBand | undefined =>
  typeof rankedRank === 'number' ? RANKS.find((r) => r.rank === rankedRank + 1) : undefined;

/* ---- collection -------------------------------------------------------- */

/** One brawler as the collection grid needs it: catalog kit plus what you own. */
export type CollectionEntry = {
  id: number;
  name: string;
  rarity: string;
  className: string;
  /** Undefined when the brawler is not unlocked. */
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
  /** Everything that exists for this brawler, from `/v1/brawlers`. */
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

/** Headline numbers for the collection panel. */
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
    /** Of the four kit slots, how many are filled across the owned roster. */
    gadgets: owned.reduce((n, e) => n + (e.owned?.gadgets.length ?? 0), 0),
    starPowers: owned.reduce((n, e) => n + (e.owned?.starPowers.length ?? 0), 0),
    hyperCharges: owned.reduce((n, e) => n + (e.owned?.hyperCharges.length ?? 0), 0),
  };
}
