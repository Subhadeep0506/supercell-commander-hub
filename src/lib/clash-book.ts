import catalog from '@/data/clash-book/catalog.json';
import catalogExtra from '@/data/clash-book/catalog-extra.json';
import { bookArt } from '@/assets/art';

/**
 * Ported from frontend/src/lib/clash-book.ts. Every function below is pure and
 * unchanged; only itemArt's backing data moved from CDN pointers to the
 * generated image registry.
 */
export type BookRecord = Record<string, unknown>;
export type BookItem = BookRecord & {
  id: string;
  name: string;
  base: string;
  category: string;
  description?: string;
  sourcePath: string;
  levels?: BookRecord[];
  /** Set on a nested sub-item: the entry it is a variant of. */
  baseItemId?: string;
  /** Crafted defenses upgrade per module instead of having a single level. */
  modules?: { name: string; controls?: string; upgrades: BookRecord[] }[];
};

/**
 * `catalog.json` is copied verbatim from the reference app, so the entries it
 * never exposed live in a sibling file (scripts/build-catalog-extra.mjs)
 * rather than being appended to it -- the next sync would discard them.
 */
export const BOOK_ITEMS = [...(catalog as BookItem[]), ...(catalogExtra as BookItem[])];

/** Sub-item <-> base item, resolved both ways off `baseItemId`. */
const RELATED = new Map<string, BookItem[]>();
for (const item of BOOK_ITEMS) {
  if (!item.baseItemId) continue;
  const base = BOOK_ITEMS.find((i) => i.id === item.baseItemId);
  if (!base) continue;
  RELATED.set(item.id, [...(RELATED.get(item.id) ?? []), base]);
  RELATED.set(base.id, [...(RELATED.get(base.id) ?? []), item]);
}

/**
 * Entries worth linking from this one's card: a base troop offers its Super
 * Troop, and the Super Troop offers the base troop back.
 */
export function relatedItems(item: BookItem): BookItem[] {
  return RELATED.get(item.id) ?? [];
}

export function itemArt(item: BookItem) {
  return bookArt(item.id);
}

export function playerBookItem(name: unknown, village: unknown = 'home') {
  if (typeof name !== 'string') return undefined;
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BOOK_ITEMS.find(
    (item) =>
      item.base === (village === 'builderBase' ? 'builder' : 'home') &&
      item.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key,
  );
}

export function playerLevelIndex(item: BookItem, level: number) {
  return bookLevels(item).findIndex((row) => row['level'] === level);
}

export function bookCategory(category: string) {
  if (
    [
      'defense',
      'crafted-defense',
      'army',
      'resource',
      'other',
      'town-hall',
      'builder-hall',
      'capital-hall',
      'district-hall',
      'wall',
      'research',
    ].includes(category)
  ) {
    return 'Buildings';
  }
  return (
    (
      {
        trap: 'Traps',
        troop: 'Troops',
        'super-troop': 'Super Troops',
        spell: 'Spells',
        hero: 'Heroes',
        pet: 'Pets',
        'hero-equipment': 'Equipment',
        'siege-machine': 'Sieges',
        guardian: 'Guardians',
        'magic-item': 'Magic Items',
      } as Record<string, string>
    )[category] ?? category
  );
}

export function filterBook(village: string, category: string, query: string) {
  return BOOK_ITEMS.filter(
    (item) =>
      // Magic items are shown under both villages, as in the reference app --
      // but the Clan Capital has none, so they stay out of that tab.
      (item.base === village || (village !== 'capital' && item.base === 'magic-items')) &&
      (category === 'All' || bookCategory(item.category) === category) &&
      item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
}

export function bookLevels(item: BookItem) {
  return (item.levels ?? [])
    .filter((row) => typeof row['level'] === 'number')
    .sort((a, b) => Number(a['level']) - Number(b['level']));
}

export function fieldLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/Dps/g, 'Damage per second')
    .replace(/Hitpoints/g, 'Hit points');
}

export function flattenBook(
  value: unknown,
  prefix = '',
): { label: string; value: string | number }[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return [{ label: prefix, value: typeof value === 'number' ? value : String(value) }];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => flattenBook(v, `${prefix} ${i + 1}`));
  if (typeof value !== 'object') return [];
  const rec = value as BookRecord;
  if ('days' in rec || 'hours' in rec || 'minutes' in rec || 'seconds' in rec) {
    const time = ['days', 'hours', 'minutes', 'seconds']
      .filter((k) => Number(rec[k]) > 0)
      .map((k) => `${rec[k]} ${k}`)
      .join(' ');
    return [{ label: prefix, value: time || 'Instant' }];
  }
  return Object.entries(rec).flatMap(([k, v]) =>
    flattenBook(v, prefix ? `${prefix} · ${fieldLabel(k)}` : fieldLabel(k)),
  );
}

export function levelSections(row: BookRecord) {
  const requirements: BookRecord = {},
    costs: BookRecord = {},
    stats: BookRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'level') continue;
    if (/required|requirement/i.test(key)) requirements[key] = value;
    else if (/cost|time|upgrade.*ore/i.test(key)) costs[key] = value;
    else stats[key] = value;
  }
  return {
    requirements: flattenBook(requirements),
    costs: flattenBook(costs),
    stats: flattenBook(stats),
  };
}
