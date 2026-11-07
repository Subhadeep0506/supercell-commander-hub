import { z } from 'zod';
import DATA_IDS from '@/data/clash-book/data-ids.json';
import { BOOK_ITEMS, type BookItem } from './clash-book';



const ID_MAP = DATA_IDS as Record<string, string>;


const TypeSchema = z
  .object({
    data: z.number(),
    modules: z
      .array(z.object({ data: z.number(), lvl: z.number().optional() }).passthrough())
      .optional()
      .default([]),
  })
  .passthrough();

/**
 * Every array in the export is a list of `{data, lvl?, cnt?, timer?}`.
 *
 * Deliberately loose: Supercell adds fields (`gear_up`, `weapon`) without
 * warning, and an unknown field must not reject an otherwise good paste. Only
 * `data` is required.
 */
const RowSchema = z
  .object({
    data: z.number(),
    lvl: z.number().optional(),
    cnt: z.number().optional(),
    timer: z.number().optional(),
    types: z.array(TypeSchema).optional(),
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


export type Owned = {
  catalogId: string;
  name: string;
  category: string;

  level: number;

  count: number;

  byLevel: { level: number; count: number }[];
  /**
   * Set only for crafted defenses, which upgrade three modules independently
   * instead of having one level. `level` carries the lowest of them, so the
   * usual "what is holding this back" reading still works.
   */
  modules?: { name: string; level: number }[];
};

export type Upgrade = {
  catalogId: string;
  name: string;
  category: string;
  fromLevel: number;
  toLevel: number;

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
type CraftedType = z.infer<typeof TypeSchema>;


function moduleIndex(typeId: number, moduleId: number): number {
  return moduleId - (102000000 + (typeId - 103000000) * 3);
}


function craftedFrom(types: CraftedType[]): Owned[] {
  const out: Owned[] = [];
  for (const type of types) {
    const item = lookup(type.data);
    if (!item) continue;
    const tracks = (item.modules ?? []) as { name: string }[];
    const modules = type.modules
      .map((m) => {
        const i = moduleIndex(type.data, m.data);
        const track = tracks[i];
        return track ? { name: track.name, level: m.lvl ?? 1 } : undefined;
      })
      .filter((m): m is { name: string; level: number } => m !== undefined);
    out.push({
      catalogId: item.id,
      name: item.name,
      category: item.category,
      // The weakest module is what actually limits the building.
      level: modules.length ? Math.min(...modules.map((m) => m.level)) : 1,
      count: 1,
      byLevel: [],
      modules,
    });
  }
  return out;
}


function collapse(rows: Row[], exportedAt: number) {
  const owned = new Map<string, Owned>();
  const inProgress: Upgrade[] = [];

  for (const row of rows) {
    // The Crafting Station holds the crafted defenses rather than being an
    // upgradeable building itself, so its subtree is read and the row that
    // carried it contributes nothing of its own.
    if (row.types?.length) {
      for (const crafted of craftedFrom(row.types)) owned.set(crafted.catalogId, crafted);
      continue;
    }

    const item = lookup(row.data);
    // Unmapped ids are skipped rather than guessed. Magic items never appear
    // here, and a handful of items have no dataId upstream at all.
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


function hallLevel(owned: Owned[], inProgress: Upgrade[], id: string): number {
  return (
    owned.find((o) => o.catalogId === id)?.level ??
    inProgress.find((u) => u.catalogId === id)?.fromLevel ??
    0
  );
}


function builderCount(owned: Owned[], id: string, fallback: number): number {
  return owned.find((o) => o.catalogId === id)?.count ?? fallback;
}

export class VillageExportError extends Error { }

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
