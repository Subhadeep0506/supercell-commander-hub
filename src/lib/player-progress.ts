import { bookLevels, type BookItem, type BookRecord } from './clash-book';
import type { CollectionEntry, CollectionSection } from './player-collection';
import { RUSHED_BELOW, hallOnly, levelTime, maxLevelAt } from './village-plan';

/**
 * How far through its Town Hall an account is, from the player endpoint alone.
 *
 * The Builder Plan already answers this question, but only for you: it is
 * driven by a pasted village export, so a clan member's profile could never
 * show it. Everything here is derived from `playerCollection` -- which is
 * itself derived from the Clash Book catalog -- so it works for any player the
 * service will return, including one whose village you have never seen.
 *
 * **Army only.** The player endpoint publishes no building levels at all, so
 * the percentages cover heroes, pets, troops, spells and siege machines and
 * say so on screen. They are not the same number the Builder Plan shows for
 * the same account, and they are not meant to be.
 */

/** One category row: Heroes, Troops, Spells, Sieges, Hero Equipment. */
export type ProgressRow = {
  id: string;
  name: string;
  /** A name the `Art` component resolves. */
  icon: string;
  /** Level-weighted against this hall's caps. */
  have: number;
  total: number;
  pct: number;
  /** Entries sitting below the *previous* hall's cap -- the ⚠ count. */
  behind: number;
  /** Not yet maxed for this hall, each carrying how many levels are left. */
  left: RemainingEntry[];
  /** False for hero equipment, which is bought with ore rather than levelled. */
  inHeadline: boolean;
};

export type RemainingEntry = CollectionEntry & { toGo: number };

export type PlayerProgress = {
  base: 'home' | 'builder';
  hallLevel: number;
  /** "Town Hall 13" / "Builder Hall 10". */
  hallName: string;
  /** "TH13" / "BH10". */
  hallLabel: string;
  have: number;
  total: number;
  pct: number;
  /**
   * How far short of the *previous* hall the army is, as a percentage.
   *
   * A village is supposed to finish a hall level before taking the next one.
   * Measuring against the hall you have already left is what separates "still
   * working through this one" from "skipped the last one" -- the headline
   * percentage cannot tell those apart, because a freshly upgraded hall and a
   * rushed one both read low.
   */
  rushedPct: number;
  rushed: boolean;
  rows: ProgressRow[];
};

/**
 * Super Troops are excluded from every figure here.
 *
 * Their catalog entries carry a level table copied from the troop they are a
 * variant of, so counting them adds a second copy of a third of the army: at
 * Town Hall 13 the level total goes from 548 to 705 and the percentage moves
 * for a reason no player could account for. They are still listed in the Army
 * panel, which is a collection view rather than a measure of progress.
 */
const EXCLUDED_ROWS = ['super-troops'];

/** Hero equipment: real progress, but not against a hall. See `inHeadline`. */
const OFF_HEADLINE_ROWS = ['equipment'];

export function playerProgress(
  sections: CollectionSection[],
  hallLevel: number,
  base: 'home' | 'builder',
): PlayerProgress {
  /*
   * The previous hall's caps, resolved once.
   *
   * `hallOnly` walks the catalog for each of the four gating buildings, and
   * this module runs inside `CocPlayer` -- which is also the detail sheet's
   * body, so it re-renders on every clan member tap. Once per call, not once
   * per item.
   */
  const previous = hallLevel > 1 ? hallOnly(hallLevel - 1, base) : undefined;
  const prevMax = new Map<string, number>();
  const capBefore = (item: BookItem): number => {
    if (!previous) return 0;
    const cached = prevMax.get(item.id);
    if (cached !== undefined) return cached;
    const value = maxLevelAt(item, previous);
    prevMax.set(item.id, value);
    return value;
  };

  const rows: ProgressRow[] = [];
  let have = 0;
  let total = 0;
  let behindHave = 0;
  let behindTotal = 0;

  for (const section of sections) {
    if (EXCLUDED_ROWS.includes(section.id)) continue;
    const inHeadline = !OFF_HEADLINE_ROWS.includes(section.id);

    let rowHave = 0;
    let rowTotal = 0;
    let behind = 0;
    const left: RemainingEntry[] = [];

    for (const entry of section.entries) {
      // Nothing this hall can reach is nothing to be measured against. This is
      // what drops Pets on a Town Hall 13 account rather than drawing an empty
      // bar: the Pet House cannot be placed below Town Hall 14.
      if (entry.hallMax <= 0) continue;
      const level = Math.min(entry.level ?? 0, entry.hallMax);
      rowHave += level;
      rowTotal += entry.hallMax;
      if (!entry.maxedForHall) left.push({ ...entry, toGo: entry.hallMax - level });

      if (!inHeadline) continue;
      const before = capBefore(entry.item);
      if (before <= 0) continue;
      behindTotal += before;
      behindHave += Math.min(level, before);
      if (level < before) behind += 1;
    }

    if (rowTotal === 0) continue;
    if (inHeadline) {
      have += rowHave;
      total += rowTotal;
    }
    rows.push({
      id: section.id,
      name: section.name,
      icon: section.icon,
      have: rowHave,
      total: rowTotal,
      pct: ratio(rowHave, rowTotal),
      behind,
      left,
      inHeadline,
    });
  }

  const rushedPct = previous && behindTotal > 0 ? 100 - ratio(behindHave, behindTotal) : 0;
  const hallName = base === 'builder' ? 'Builder Hall' : 'Town Hall';
  return {
    base,
    hallLevel,
    hallName: `${hallName} ${hallLevel}`,
    hallLabel: `${base === 'builder' ? 'BH' : 'TH'}${hallLevel}`,
    have,
    total,
    pct: ratio(have, total),
    rushedPct,
    rushed: rushedPct > 100 - RUSHED_BELOW,
    rows,
  };
}

function ratio(have: number, total: number): number {
  return total > 0 ? Math.min(100, (have / total) * 100) : 0;
}

/**
 * What the player knows about one village, for the item sheet.
 *
 * The sheet needs levels from *outside* the section the tile was tapped in --
 * the Giant Gauntlet's card names the Barbarian King who wears it, and heroes
 * and equipment are different sections. So this is built once per village from
 * all of them rather than threaded through each grid.
 */
export type PlayerContext = {
  hallLevel: number;
  hallLabel: string;
  base: 'home' | 'builder';
  levelOf(catalogId: string): number | undefined;
  hallMaxOf(catalogId: string): number;
};

export function playerContext(
  sections: CollectionSection[],
  hallLevel: number,
  base: 'home' | 'builder',
): PlayerContext {
  const levels = new Map<string, number>();
  const caps = new Map<string, number>();
  for (const section of sections) {
    for (const entry of section.entries) {
      if (entry.level !== undefined) levels.set(entry.item.id, entry.level);
      caps.set(entry.item.id, entry.hallMax);
    }
  }
  return {
    hallLevel,
    hallLabel: `${base === 'builder' ? 'BH' : 'TH'}${hallLevel}`,
    base,
    levelOf: (id) => levels.get(id),
    hallMaxOf: (id) => caps.get(id) ?? 0,
  };
}

/**
 * Everything the levels between `from` and `to` cost, added up.
 *
 * Returned as a raw record rather than formatted rows so the caller can run it
 * through the same `flattenBook` -> `mergeCostRows` -> `Fields` pipeline the
 * per-level sections already use, and so inherit the ore, resource and clock
 * artwork without a second copy of that mapping.
 *
 * The `… Resource` strings are carried through untouched, because that is what
 * lets "Upgrade Cost: 10,200" be folded back onto its currency. Time is
 * summed separately: it is an object in the data, so no amount of adding
 * numeric fields would have found it.
 */
export function remainingUpgradeCost(
  item: BookItem,
  from: number,
  to: number,
): { levels: number; seconds: number; costs: BookRecord } {
  const costs: BookRecord = {};
  let levels = 0;
  let seconds = 0;

  for (const row of bookLevels(item)) {
    const level = Number(row['level']) || 0;
    if (level <= from || level > to) continue;
    levels += 1;
    seconds += levelTime(row);
    for (const [key, value] of Object.entries(row)) {
      if (/required|requirement/i.test(key)) continue;
      if (!/cost|ore/i.test(key)) continue;
      if (typeof value === 'string') costs[key] = value;
      else if (typeof value === 'number') costs[key] = (Number(costs[key]) || 0) + value;
    }
  }

  return { levels, seconds, costs };
}
