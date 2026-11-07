import { BOOK_ITEMS, bookLevels, type BookItem, type BookRecord } from './clash-book';
import type { Owned, Upgrade, VillageSide } from './village-export';



export type Strategy = 'balanced' | 'offence' | 'defence' | 'hero';

export const STRATEGIES: { id: Strategy; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'offence', label: 'Offence first' },
  { id: 'defence', label: 'Defence first' },
  { id: 'hero', label: 'Hero first' },
];


export type Group = 'heroes' | 'offense' | 'defense' | 'economy' | 'other';

export const GROUP_LABEL: Record<Group, string> = {
  heroes: 'Heroes',
  offense: 'Offense',
  defense: 'Defense',
  economy: 'Economy',
  other: 'Other',
};

export function groupOf(category: string): Group {
  if (['hero', 'hero-equipment', 'pet', 'guardian'].includes(category)) return 'heroes';
  if (['troop', 'spell', 'siege-machine', 'army'].includes(category)) return 'offense';
  if (['defense', 'crafted-defense', 'trap', 'wall'].includes(category)) return 'defense';
  if (category === 'resource') return 'economy';
  return 'other';
}

/**
 * Which queue an upgrade occupies.
 *
 * Troops and spells go to the Laboratory, pets to the Pet House, and
 * everything else -- including heroes -- ties up a builder. Hero equipment is
 * bought with ore and takes no time at all, so it never enters a queue.
 */
export type Lane = 'builder' | 'lab' | 'pets' | 'none';

export function laneOf(category: string): Lane {
  if (['troop', 'spell', 'siege-machine'].includes(category)) return 'lab';
  if (category === 'pet') return 'pets';
  // Walls are instant and hero equipment is bought with ore: neither ties up a
  // builder, which is why both are reported as their own counter instead.
  if (category === 'hero-equipment' || category === 'wall') return 'none';
  return 'builder';
}


export const SECTIONS = [
  { id: 'defenses', label: 'Defenses', categories: ['defense', 'crafted-defense'] },
  { id: 'traps', label: 'Traps', categories: ['trap'] },
  {
    id: 'buildings',
    label: 'Buildings',
    categories: ['army', 'resource', 'other', 'town-hall', 'builder-hall', 'research'],
  },
  { id: 'walls', label: 'Walls', categories: ['wall'] },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

const SECONDS: Record<string, number> = { days: 86400, hours: 3600, minutes: 60, seconds: 1 };


function duration(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  let total = 0;
  for (const [unit, per] of Object.entries(SECONDS)) {
    const n = Number((value as Record<string, unknown>)[unit]);
    if (Number.isFinite(n)) total += n * per;
  }
  return total;
}

/**
 * Seconds a single level costs.
 *
 * Three different field names for the same idea: buildings use `buildTime`,
 * heroes `upgradeTime`, and troops and spells `researchTime`. Reading only the
 * first two reports the entire Laboratory queue as zero work.
 */
export function levelTime(row: BookRecord): number {
  return duration(row['buildTime']) || duration(row['upgradeTime']) || duration(row['researchTime']);
}


export function levelCost(row: BookRecord): { cost?: number; resource?: string } {
  const cost = Number(row['buildCost'] ?? row['upgradeCost'] ?? row['researchCost']);
  const resource = row['buildCostResource'] ?? row['upgradeCostResource'] ?? row['researchCostResource'];
  return {
    cost: Number.isFinite(cost) ? cost : undefined,
    resource: typeof resource === 'string' ? resource : undefined,
  };
}


export type Gates = {
  hall: number;
  laboratory: number;
  heroHall: number;
  petHouse: number;
  blacksmith: number;
  starLab: number;
};

export function gatesFor(side: VillageSide): Gates {
  const level = (id: string) => side.owned.find((o) => o.catalogId === id)?.level ?? 0;
  return {
    hall: side.hallLevel,
    laboratory: level('home/laboratory'),
    heroHall: level('home/hero-hall'),
    petHouse: level('home/pet-house'),
    blacksmith: level('home/blacksmith'),
    starLab: level('builder/star-laboratory'),
  };
}


function buildingMaxAt(id: string, hallLevel: number, base: 'home' | 'builder'): number {
  const item = BOOK_ITEMS.find((i) => i.id === id);
  if (!item || maxCountAt(item, hallLevel, base) === 0) return 0;
  const key = base === 'home' ? 'townHallRequired' : 'builderHallRequired';
  let max = 0;
  for (const row of bookLevels(item)) {
    if (Number(row[key] ?? 0) <= hallLevel) max = Math.max(max, Number(row['level']) || 0);
  }
  return max;
}


export function hallOnly(hallLevel: number, base: 'home' | 'builder' = 'home'): Gates {
  // `hallLevel` is a Town Hall or a Builder Hall, never both, so the other
  // village's gates are reported as zero rather than resolved against the
  // wrong hall. No item names a gate from the other side, so this only ever
  // shows up as an honest signature rather than as a behaviour change.
  const home = base === 'home';
  return {
    hall: hallLevel,
    laboratory: home ? buildingMaxAt('home/laboratory', hallLevel, 'home') : 0,
    heroHall: home ? buildingMaxAt('home/hero-hall', hallLevel, 'home') : 0,
    petHouse: home ? buildingMaxAt('home/pet-house', hallLevel, 'home') : 0,
    blacksmith: home ? buildingMaxAt('home/blacksmith', hallLevel, 'home') : 0,
    starLab: home ? 0 : buildingMaxAt('builder/star-laboratory', hallLevel, 'builder'),
  };
}

const REQUIREMENTS: { key: string; gate: keyof Gates }[] = [
  { key: 'townHallRequired', gate: 'hall' },
  { key: 'builderHallRequired', gate: 'hall' },
  // Builder Base heroes spell it the long way, and only this way -- without
  // the second entry the Battle Machine and Battle Copter were ungated and
  // reported their game maximum as reachable at every Builder Hall.
  { key: 'builderHallLevelRequired', gate: 'hall' },
  { key: 'laboratoryRequired', gate: 'laboratory' },
  { key: 'starLabRequired', gate: 'starLab' },
  { key: 'heroHallLevelRequired', gate: 'heroHall' },
  { key: 'petHouseLevelRequired', gate: 'petHouse' },
  { key: 'blacksmithLevelRequired', gate: 'blacksmith' },
];

/**
 * The highest level of `item` this village can currently reach.
 *
 * Every requirement on the row must hold, not just the first one found: a
 * troop names both a Town Hall and a Laboratory level, and only checking the
 * Town Hall claims levels the lab cannot research yet.
 */
export function maxLevelAt(item: BookItem, gates: Gates | number): number {
  const g =
    typeof gates === 'number'
      ? hallOnly(gates, item.base === 'builder' ? 'builder' : 'home')
      : gates;
  let max = 0;
  for (const row of bookLevels(item)) {
    const blocked = REQUIREMENTS.some(({ key, gate }) => {
      const required = Number(row[key]);
      return Number.isFinite(required) && required > g[gate];
    });
    if (blocked) continue;
    max = Math.max(max, Number(row['level']) || 0);
  }
  return max;
}


export function maxCountAt(item: BookItem, hallLevel: number, base: 'home' | 'builder'): number {
  const key = base === 'home' ? 'availablePerTownHall' : 'availablePerBuilderHall';
  const rows = item[key];
  if (!Array.isArray(rows) || rows.length === 0) return 1;
  const levelKey = base === 'home' ? 'townHallLevel' : 'builderHallLevel';
  let count = 0;
  for (const row of rows as BookRecord[]) {
    if (Number(row[levelKey]) <= hallLevel) count = Math.max(count, Number(row['count']) || 0);
  }
  return count;
}


function reachable(side: VillageSide, gates = gatesFor(side)): BookItem[] {
  return BOOK_ITEMS.filter(
    (item) =>
      item.base === side.base && item.category !== 'magic-item' && maxLevelAt(item, gates) > 0,
  );
}

export type Progress = { have: number; total: number; pct: number };

function ratio(have: number, total: number): Progress {
  return { have, total, pct: total > 0 ? Math.min(100, (have / total) * 100) : 0 };
}


export function completion(side: VillageSide, categories?: readonly string[]): Progress {
  const gates = gatesFor(side);
  const ownedBy = new Map(side.owned.map((o) => [o.catalogId, o]));
  let have = 0;
  let total = 0;
  for (const item of reachable(side, gates)) {
    if (categories && !categories.includes(item.category)) continue;
    // Equipment is bought with ore rather than levelled against a hall, so it
    // would skew the figure. Walls are included -- they are real progress and
    // get their own bar.
    if (item.category === 'hero-equipment') continue;
    const maxLevel = maxLevelAt(item, gates);
    const maxCount = maxCountAt(item, side.hallLevel, side.base);
    total += maxLevel * maxCount;
    const owned = ownedBy.get(item.id);
    if (!owned) continue;
    for (const bucket of owned.byLevel) {
      have += Math.min(bucket.level, maxLevel) * Math.min(bucket.count, maxCount);
    }
  }
  return ratio(have, total);
}

export type Remaining = {
  item: BookItem;
  catalogId: string;
  name: string;
  category: string;
  group: Group;
  lane: Lane;
  fromLevel: number;
  toLevel: number;

  seconds: number;
  cost?: number;
  costResource?: string;
};

/**
 * Every individual level still to be done, cheapest hall-legal step first.
 *
 * One entry per *level*, not per item, because that is how a builder consumes
 * them and what the schedule needs.
 */
export function remainingUpgrades(side: VillageSide): Remaining[] {
  const gates = gatesFor(side);
  const ownedBy = new Map(side.owned.map((o) => [o.catalogId, o]));
  /*
   * The level each builder is already part-way through.
   *
   * The export parser skips an in-progress row rather than filing it under
   * `owned`, so a lone building half way from 5 to 6 has no owned entry at
   * all and `current` fell back to 0 -- the plan then scheduled levels 1
   * through 6 of a building that is already at 5. The lane reservation in
   * `schedule()` hid the duplicate behind the running job, so the chart just
   * looked longer than it should have been.
   */
  const runningTo = new Map<string, number>();
  for (const job of side.inProgress) {
    runningTo.set(job.catalogId, Math.max(runningTo.get(job.catalogId) ?? 0, job.toLevel));
  }
  const out: Remaining[] = [];
  for (const item of reachable(side, gates)) {
    const lane = laneOf(item.category);
    if (lane === 'none') continue;
    const maxLevel = maxLevelAt(item, gates);
    const current = Math.max(ownedBy.get(item.id)?.level ?? 0, runningTo.get(item.id) ?? 0);
    // An item not yet built still has to be built: start from level 0.
    for (const row of bookLevels(item)) {
      const level = Number(row['level']) || 0;
      if (level <= current || level > maxLevel) continue;
      const seconds = levelTime(row);
      // Gem purchases -- Builder's Apprentice, Lab Assistant, Bob's Hut -- take
      // no time at all. They are real progress and still count towards
      // completion, but they consume no builder, so a *builder* plan that
      // listed them would be scheduling zero-length work.
      if (seconds <= 0) continue;
      const { cost, resource } = levelCost(row);
      out.push({
        item,
        catalogId: item.id,
        name: item.name,
        category: item.category,
        group: groupOf(item.category),
        lane,
        fromLevel: level - 1,
        toLevel: level,
        seconds,
        cost,
        costResource: resource,
      });
    }
  }
  return out;
}


export function laneTime(remaining: Remaining[], lane: Lane): number {
  return remaining.filter((r) => r.lane === lane).reduce((n, r) => n + r.seconds, 0);
}


export function wallsLeft(side: VillageSide): Progress {
  const wall = BOOK_ITEMS.find((i) => i.base === side.base && i.category === 'wall');
  if (!wall) return ratio(0, 0);
  const maxLevel = maxLevelAt(wall, gatesFor(side));
  const maxCount = maxCountAt(wall, side.hallLevel, side.base);
  const owned = side.owned.find((o) => o.catalogId === wall.id);
  const at = owned?.byLevel.reduce((n, b) => n + (b.level >= maxLevel ? b.count : 0), 0) ?? 0;
  return ratio(at, maxCount);
}


export const RUSHED_BELOW = 85;

export function isRushed(side: VillageSide): boolean {
  if (side.hallLevel <= 1) return false;
  return completion({ ...side, hallLevel: side.hallLevel - 1 }).pct < RUSHED_BELOW;
}

export type Scheduled = Remaining & { startsAt: number; endsAt: number; lane: Lane; laneIndex: number };


export type RunningJob = {
  catalogId: string;
  name: string;
  category: string;
  group: Group;
  lane: Lane;
  laneIndex: number;
  fromLevel: number;
  toLevel: number;

  seconds: number;
  startsAt: number;
  endsAt: number;
};

type LaneSlot = { lane: Lane; index: number; free: number };

function laneSlots(side: VillageSide, now: number): LaneSlot[] {
  const lanes: LaneSlot[] = [];
  for (let i = 0; i < Math.max(1, side.builders); i++) {
    lanes.push({ lane: 'builder', index: i, free: now });
  }
  lanes.push({ lane: 'lab', index: 0, free: now });
  lanes.push({ lane: 'pets', index: 0, free: now });
  return lanes;
}


function placeRunning(side: VillageSide, lanes: LaneSlot[]): RunningJob[] {
  const out: RunningJob[] = [];
  for (const active of side.inProgress) {
    const lane = laneOf(active.category);
    const slot = lanes.filter((l) => l.lane === lane).sort((a, b) => a.free - b.free)[0];
    if (!slot) continue;
    const seconds = upgradeDuration(active.catalogId, active.toLevel);
    out.push({
      catalogId: active.catalogId,
      name: active.name,
      category: active.category,
      group: groupOf(active.category),
      lane,
      laneIndex: slot.index,
      fromLevel: active.fromLevel,
      toLevel: active.toLevel,
      seconds,
      // The export records time *remaining*, so the start is reconstructed
      // from the catalog's own figure for the whole step. An item the catalog
      // does not price lands as a zero-length bar at its finish time, which
      // the chart widens to its minimum rather than dropping.
      startsAt: active.finishesAt - seconds * 1000,
      endsAt: active.finishesAt,
    });
    slot.free = Math.max(slot.free, active.finishesAt);
  }
  return out;
}


export function runningJobs(side: VillageSide, now: number): RunningJob[] {
  return placeRunning(side, laneSlots(side, now));
}

const ORDER: Record<Strategy, Group[]> = {
  balanced: ['heroes', 'offense', 'defense', 'economy', 'other'],
  offence: ['offense', 'heroes', 'defense', 'economy', 'other'],
  defence: ['defense', 'economy', 'offense', 'heroes', 'other'],
  hero: ['heroes', 'offense', 'defense', 'economy', 'other'],
};


function order(remaining: Remaining[], strategy: Strategy): Remaining[] {
  const groups = ORDER[strategy];
  const buckets = new Map<Group, Remaining[]>();
  for (const g of groups) buckets.set(g, []);
  for (const r of remaining) buckets.get(r.group)?.push(r);
  for (const list of buckets.values()) list.sort((a, b) => a.seconds - b.seconds);

  if (strategy !== 'balanced') {
    const [first, ...rest] = groups;
    return [...buckets.get(first!)!, ...rest.flatMap((g) => buckets.get(g)!)];
  }

  const out: Remaining[] = [];
  let drained = false;
  while (!drained) {
    drained = true;
    for (const g of groups) {
      const next = buckets.get(g)!.shift();
      if (next) {
        out.push(next);
        drained = false;
      }
    }
  }
  return out;
}

/**
 * Lays the queue onto builders, the lab and the pet house.
 *
 * In-progress upgrades hold their lane until they finish; everything after is
 * assigned greedily to whichever lane frees up first. `now` is passed in so
 * the result is deterministic and testable.
 */
export function schedule(
  side: VillageSide,
  remaining: Remaining[],
  strategy: Strategy,
  now: number,
  limit = 60,
): Scheduled[] {
  const lanes = laneSlots(side, now);
  const out: Scheduled[] = [];

  // Anything already running owns its lane until finishesAt.
  placeRunning(side, lanes);

  for (const next of order(remaining, strategy)) {
    if (out.length >= limit) break;
    const slot = lanes.filter((l) => l.lane === next.lane).sort((a, b) => a.free - b.free)[0];
    if (!slot) continue;
    const startsAt = slot.free;
    const endsAt = startsAt + next.seconds * 1000;
    out.push({ ...next, startsAt, endsAt, laneIndex: slot.index });
    slot.free = endsAt;
  }
  return out.sort((a, b) => a.startsAt - b.startsAt);
}

/**
 * When the last level finishes, if every builder ran without a pause.
 *
 * A lower bound, and labelled as one on screen: it assumes loot is never the
 * constraint, which for a real village it always is.
 */
export function maxedBy(side: VillageSide, remaining: Remaining[], now: number): number {
  const builders = Math.max(1, side.builders);
  const builderWork = laneTime(remaining, 'builder') / builders;
  const labWork = laneTime(remaining, 'lab');
  const petWork = laneTime(remaining, 'pets');
  const running = side.inProgress.reduce((n, u) => Math.max(n, u.finishesAt), now);
  return Math.max(running, now + Math.max(builderWork, labWork, petWork) * 1000);
}

/**
 * How long the step to `toLevel` takes, in seconds.
 *
 * The export only records how much time is *left*, so the fraction already
 * elapsed is unknowable without the catalog's own figure for the whole step.
 */
export function upgradeDuration(catalogId: string, toLevel: number): number {
  const item = BOOK_ITEMS.find((i) => i.id === catalogId);
  if (!item) return 0;
  const row = bookLevels(item).find((r) => Number(r['level']) === toLevel);
  return row ? levelTime(row) : 0;
}


export function ownedOf(side: VillageSide, catalogId: string): Owned | undefined {
  return side.owned.find((o) => o.catalogId === catalogId);
}


export function sectionItems(side: VillageSide, categories: readonly string[]) {
  const gates = gatesFor(side);
  const rows = reachable(side, gates)
    .filter((item) => categories.includes(item.category))
    .map((item) => {
      const owned = ownedOf(side, item.id);
      const maxLevel = maxLevelAt(item, gates);
      const levelRows = bookLevels(item);
      const gameMax = levelRows.length
        ? Number(levelRows[levelRows.length - 1]!['level']) || 0
        : 0;
      return {
        item,
        owned,
        level: owned?.level ?? 0,
        count: owned?.count ?? 0,
        maxLevel,
        maxCount: maxCountAt(item, side.hallLevel, side.base),
        maxed: (owned?.level ?? 0) >= maxLevel && maxLevel > 0,
        // Maxed for the game, not just for this hall -- drawn gold rather
        // than green, so "nothing more until I upgrade" and "finished for
        // good" are not the same picture.
        gameMaxed: gameMax > 0 && (owned?.level ?? 0) >= gameMax,
      };
    });

  // Anything the player owns that `reachable` could not account for is
  // appended here. It gates on a level table, which two kinds of item do not
  // have: crafted defenses upgrade three modules independently instead, and
  // B.O.T.O's Shack has no entry in the dataset at all. Both were parsed and
  // then silently vanished from the grid, which is the failure the stub
  // entry exists to prevent.
  //
  // They stay out of the completion percentages either way -- only three of
  // the twelve crafted defenses can be crafted at a time, so counting the
  // other nine as "not maxed" would be wrong, and a stub has nothing to max.
  const shown = new Set(rows.map((r) => r.item.id));
  for (const owned of side.owned) {
    if (shown.has(owned.catalogId) || !categories.includes(owned.category)) continue;
    const item = BOOK_ITEMS.find((i) => i.id === owned.catalogId);
    if (!item) continue;
    const maxLevel = Math.max(0, ...(item.modules ?? []).map((m) => m.upgrades?.length ?? 0));
    rows.push({
      item,
      owned,
      level: owned.level,
      count: owned.count,
      maxLevel,
      maxCount: owned.count,
      maxed: maxLevel > 0 && (owned.modules ?? []).every((m) => m.level >= maxLevel),
      // A module track has no hall gate, so its only max is the game's.
      gameMaxed: maxLevel > 0 && (owned.modules ?? []).every((m) => m.level >= maxLevel),
    });
  }

  return rows.sort((a, b) => b.count - a.count || a.item.name.localeCompare(b.item.name));
}

export type { Upgrade };
