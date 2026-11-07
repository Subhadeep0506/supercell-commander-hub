import { rows, type ApiRecord } from '@/api/game-api';
import { BOOK_ITEMS, bookLevels, type BookItem } from './clash-book';
import { gatesFor, hallOnly, maxLevelAt, type Gates } from './village-plan';
import type { VillageImport, VillageSide } from './village-export';



export type CollectionState =

  | 'owned'

  | 'ready'

  | 'locked';

export type CollectionEntry = {
  item: BookItem;
  name: string;

  level?: number;

  count?: number;

  hallMax: number;

  gameMax: number;
  maxedForHall: boolean;
  maxedForGame: boolean;
  state: CollectionState;
};

export type CollectionSection = {
  id: string;
  name: string;

  icon: string;
  entries: CollectionEntry[];
  owned: number;
  total: number;
};

type SectionSpec = {
  id: string;
  name: string;
  icon: string;
  categories: readonly string[];

  from: 'heroes' | 'troops' | 'spells' | 'heroEquipment';
};


const HOME_SECTIONS: SectionSpec[] = [
  { id: 'heroes', name: 'Heroes', icon: 'Barbarian King', categories: ['hero'], from: 'heroes' },
  { id: 'pets', name: 'Pets', icon: 'pets', categories: ['pet'], from: 'troops' },
  { id: 'troops', name: 'Troops', icon: 'Barbarian', categories: ['troop'], from: 'troops' },
  {
    id: 'super-troops',
    name: 'Super Troops',
    icon: 'Super Barbarian',
    categories: ['super-troop'],
    from: 'troops',
  },
  { id: 'spells', name: 'Spells', icon: 'Spell Factory', categories: ['spell'], from: 'spells' },
  {
    id: 'sieges',
    name: 'Siege Machines',
    icon: 'Wall Wrecker',
    categories: ['siege-machine'],
    from: 'troops',
  },
  {
    id: 'equipment',
    name: 'Hero Equipment',
    icon: 'Giant Gauntlet',
    categories: ['hero-equipment'],
    from: 'heroEquipment',
  },
];

const BUILDER_SECTIONS: SectionSpec[] = [
  {
    id: 'heroes',
    name: 'Heroes',
    icon: 'Battle Machine',
    categories: ['hero'],
    from: 'heroes',
  },
  { id: 'troops', name: 'Troops', icon: 'Raged Barbarian', categories: ['troop'], from: 'troops' },
];


const BY_NAME = new Map<string, BookItem>();
for (const item of BOOK_ITEMS) {
  BY_NAME.set(`${item.base}|${normalise(item.name)}`, item);
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}


function apiLevels(player: ApiRecord, base: 'home' | 'builder') {
  const wantedVillage = base === 'builder' ? 'builderBase' : 'home';
  const levels = new Map<string, { level: number; gameMax?: number }>();
  for (const field of ['heroes', 'troops', 'spells', 'heroEquipment'] as const) {
    for (const row of rows(player[field])) {
      if ((row['village'] ?? 'home') !== wantedVillage) continue;
      const name = row['name'];
      if (typeof name !== 'string') continue;
      const item = BY_NAME.get(`${base}|${normalise(name)}`);
      if (!item) continue;
      const level = Number(row['level']);
      if (!Number.isFinite(level)) continue;
      const gameMax = Number(row['maxLevel']);
      levels.set(item.id, {
        level,
        // The service's `maxLevel` is the *game* maximum, not this account's
        // cap -- a Town Hall 13 Barbarian comes back as 9/13 while 9 is all
        // that hall allows. Verified against the captured dump.
        gameMax: Number.isFinite(gameMax) ? gameMax : undefined,
      });
    }
  }
  return levels;
}


export function playerCollection(
  player: ApiRecord,
  village: 'home' | 'builderBase',
  imported?: VillageImport,
): CollectionSection[] {
  const base = village === 'builderBase' ? 'builder' : 'home';
  const side: VillageSide | undefined = imported?.[base === 'builder' ? 'builder' : 'home'];
  const hasVillage = Boolean(side && side.hallLevel > 0);

  const hallLevel = hasVillage
    ? side!.hallLevel
    : Number(player[base === 'builder' ? 'builderHallLevel' : 'townHallLevel']) || 0;
  const gates: Gates = hasVillage ? gatesFor(side!) : hallOnly(hallLevel, base);

  const fromApi = apiLevels(player, base);
  const fromVillage = new Map((side?.owned ?? []).map((o) => [o.catalogId, o]));

  const specs = base === 'builder' ? BUILDER_SECTIONS : HOME_SECTIONS;
  const out: CollectionSection[] = [];

  for (const spec of specs) {
    const entries: CollectionEntry[] = [];
    for (const item of BOOK_ITEMS) {
      // Magic items are consumables rather than part of a village, and the
      // Clash Book already lists them under both tabs.
      if (item.base !== base || !spec.categories.includes(item.category)) continue;

      const levels = bookLevels(item);
      const api = fromApi.get(item.id);
      const owned = fromVillage.get(item.id);
      const level = api?.level ?? owned?.level;
      const gameMax =
        api?.gameMax ??
        (levels.length ? Number(levels[levels.length - 1]!['level']) || 0 : moduleMax(item));
      const hallMax = maxLevelAt(item, gates);

      const knowable = api !== undefined || owned !== undefined;
      const state: CollectionState = knowable ? 'owned' : hallMax > 0 ? 'ready' : 'locked';

      entries.push({
        item,
        name: item.name,
        level: state === 'owned' ? level : undefined,
        count: owned?.count,
        hallMax,
        gameMax,
        maxedForHall: state === 'owned' && hallMax > 0 && (level ?? 0) >= hallMax,
        maxedForGame: state === 'owned' && gameMax > 0 && (level ?? 0) >= gameMax,
        state,
      });
    }

    if (entries.length === 0) continue;
    // Owned first, then what you could start today, then the rest -- the same
    // reading order the game's own screens use.
    entries.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
    out.push({
      id: spec.id,
      name: spec.name,
      icon: spec.icon,
      entries,
      owned: entries.filter((e) => e.state === 'owned').length,
      total: entries.length,
    });
  }

  return out;
}

const ORDER: Record<CollectionState, number> = { owned: 0, ready: 1, locked: 2 };


function moduleMax(item: BookItem): number {
  return Math.max(0, ...(item.modules ?? []).map((m) => m.upgrades?.length ?? 0));
}
