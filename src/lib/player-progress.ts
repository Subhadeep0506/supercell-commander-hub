import { bookLevels, type BookItem, type BookRecord } from './clash-book';
import type { CollectionEntry, CollectionSection } from './player-collection';
import { RUSHED_BELOW, hallOnly, levelTime, maxLevelAt } from './village-plan';




export type ProgressRow = {
  id: string;
  name: string;

  icon: string;

  have: number;
  total: number;
  pct: number;

  behind: number;

  left: RemainingEntry[];

  inHeadline: boolean;
};

export type RemainingEntry = CollectionEntry & { toGo: number };

export type PlayerProgress = {
  base: 'home' | 'builder';
  hallLevel: number;

  hallName: string;

  hallLabel: string;
  have: number;
  total: number;
  pct: number;

  rushedPct: number;
  rushed: boolean;
  rows: ProgressRow[];
};


const EXCLUDED_ROWS = ['super-troops'];


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
