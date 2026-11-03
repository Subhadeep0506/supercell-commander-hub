import { z } from 'zod';
import DATA_IDS from '@/data/clash-book/data-ids.json';
import { BOOK_ITEMS, type BookItem } from './clash-book';

/**
 * Parses the village JSON the game exports from
 * Profile -> Settings -> More Settings -> Export Json data.
 *
 * The export identifies everything by Supercell's numeric data id and carries
 * no names, levels-available or costs -- only what you own. Those numbers are
 * translated through the generated data-ids map (scripts/build-data-ids.mjs)
 * onto Clash Book catalog ids, which is where the artwork, level tables and
 * upgrade costs already live.
 *
 * The API cannot provide any of this: it returns no in-progress upgrades, no
 * building levels at all, and no Builder Base troop levels. The export is the
 * only source for a builder plan.
 */

const ID_MAP = DATA_IDS as Record<string, string>;

/**
 * Every array in the export is a list of `{data, lvl?, cnt?, timer?}`.
 *
 * Deliberately loose: Supercell adds fields (`gear_up`, `weapon`, `types`)
 * without warning, and an unknown field must not reject an otherwise good
 * paste. Only `data` is required.
 */
const RowSchema = z
  .object({
    data: z.number(),
    lvl: z.number().optional(),
    cnt: z.number().optional(),
    timer: z.number().optional(),
  })
  .passthrough();

const RowsSchema = z.array(RowSchema).optional().default([]);

export const VillageExportSchema = z
  .object({
    tag: z.string(),
    timestamp: z.number(),
    helpers: RowsSchema,
    buildings: RowsSchema,
    traps: RowsSchema,
    units: RowsSchema,
    siege_machines: RowsSchema,
    heroes: RowsSchema,
    spells: RowsSchema,
    pets: RowsSchema,
    equipment: RowsSchema,
    buildings2: RowsSchema,
    traps2: RowsSchema,
    units2: RowsSchema,
    heroes2: RowsSchema,
  })
  .passthrough();

export type VillageExport = z.infer<typeof VillageExportSchema>;

/** One owned thing, already resolved onto a catalog entry. */
export type Owned = {
  catalogId: string;
  name: string;
  category: string;
  /** Highest level owned. Multiple instances at mixed levels collapse here. */
  level: number;
  /** How many are placed, summed across level buckets. 1 for non-placeables. */
  count: number;
  /** Per-level breakdown, so walls can report "Lv 13 x58 · Lv 12 x242". */
  byLevel: { level: number; count: number }[];
};

export type Upgrade = {
  catalogId: string;
  name: string;
  category: string;
  fromLevel: number;
  toLevel: number;
  /** Absolute ms epoch, so a countdown survives a restart. */
  finishesAt: number;
};

export type VillageSide = {
  base: 'home' | 'builder';
  hallLevel: number;
  builders: number;
  helpers: string[];
  owned: Owned[];
  inProgress: Upgrade[];
};

export type VillageImport = {
  tag: string;
  /** When the player copied it, from the export's own timestamp. */
  exportedAt: number;
  importedAt: number;
  home: VillageSide;
  builder: VillageSide;
};

const BY_ID = new Map<string, BookItem>(BOOK_ITEMS.map((item) => [item.id, item]));

function lookup(dataId: number): BookItem | undefined {
  const catalogId = ID_MAP[String(dataId)];
  return catalogId ? BY_ID.get(catalogId) : undefined;
}

type Row = z.infer<typeof RowSchema>;

/**
 * Collapses the rows of one village into owned items and in-progress upgrades.
 *
 * The shape has two traps. A building appears once per level bucket carrying
 * `cnt` -- `{data:1000010,lvl:12,cnt:242}` and `{data:1000010,lvl:13,cnt:58}`
 * are the same 300 walls -- and separately once more carrying `timer` when it
 * is upgrading. So counts are summed across buckets, the level kept is the
 * highest, and timer rows are read for the upgrade but never counted as stock.
 */
function collapse(rows: Row[], exportedAt: number) {
  const owned = new Map<string, Owned>();
  const inProgress: Upgrade[] = [];

  for (const row of rows) {
    const item = lookup(row.data);
    // Unmapped ids are skipped rather than guessed: magic items never appear
    // here, and the newest buildings have no dataId upstream yet.
    if (!item) continue;
    const level = row.lvl ?? 1;

    if (row.timer !== undefined) {
      inProgress.push({
        catalogId: item.id,
        name: item.name,
        category: item.category,
        fromLevel: level,
        toLevel: level + 1,
        finishesAt: exportedAt + row.timer * 1000,
      });
      continue;
    }

    const existing = owned.get(item.id);
    const count = row.cnt ?? 1;
    if (existing) {
      existing.level = Math.max(existing.level, level);
      existing.count += count;
      existing.byLevel.push({ level, count });
    } else {
      owned.set(item.id, {
        catalogId: item.id,
        name: item.name,
        category: item.category,
        level,
        count,
        byLevel: [{ level, count }],
      });
    }
  }

  for (const entry of owned.values()) {
    entry.byLevel.sort((a, b) => b.level - a.level);
  }
  return { owned: [...owned.values()], inProgress };
}

/** Hall level, read off the Town Hall / Builder Hall entry itself. */
function hallLevel(owned: Owned[], inProgress: Upgrade[], id: string): number {
  return (
    owned.find((o) => o.catalogId === id)?.level ??
    inProgress.find((u) => u.catalogId === id)?.fromLevel ??
    0
  );
}

/** Builders = Builder's Huts placed. The export has no explicit count. */
function builderCount(owned: Owned[], id: string, fallback: number): number {
  return owned.find((o) => o.catalogId === id)?.count ?? fallback;
}

export class VillageExportError extends Error {}

/**
 * Parses pasted text into the normalised model.
 *
 * Throws VillageExportError with a message meant to be shown to the player --
 * a bad paste is the expected case here, not an exceptional one.
 */
export function parseVillageExport(text: string, now = Date.now()): VillageImport {
  const trimmed = text.trim();
  if (!trimmed) throw new VillageExportError('Nothing to import -- paste the exported JSON first.');

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new VillageExportError("That is not valid JSON. Copy the whole export, including the { and }.");
  }

  const parsed = VillageExportSchema.safeParse(json);
  if (!parsed.success) {
    throw new VillageExportError(
      'That JSON is not a village export. It should start with a "tag" and a "timestamp".',
    );
  }

  const e = parsed.data;
  const exportedAt = e.timestamp * 1000;

  const home = collapse(
    [...e.buildings, ...e.traps, ...e.units, ...e.siege_machines, ...e.heroes, ...e.spells, ...e.pets, ...e.equipment],
    exportedAt,
  );
  const builder = collapse([...e.buildings2, ...e.traps2, ...e.units2, ...e.heroes2], exportedAt);

  const helpers = e.helpers
    .map((row) => lookup(row.data)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    tag: e.tag,
    exportedAt,
    importedAt: now,
    home: {
      base: 'home',
      hallLevel: hallLevel(home.owned, home.inProgress, 'home/town-hall'),
      // Five huts is the modern default; a village with none parsed still
      // schedules rather than dividing by zero.
      builders: builderCount(home.owned, 'home/builders-hut', 1),
      helpers,
      owned: home.owned,
      inProgress: home.inProgress,
    },
    builder: {
      base: 'builder',
      hallLevel: hallLevel(builder.owned, builder.inProgress, 'builder/builder-hall'),
      // The Builder Base has exactly one builder, and it is not a placed hut.
      builders: 1,
      helpers: [],
      owned: builder.owned,
      inProgress: builder.inProgress,
    },
  };
}
