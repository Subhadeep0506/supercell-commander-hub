// Ported from frontend/src/lib/royale-upgrades.ts, unchanged in behaviour.
//
// This is the first Clash Royale module on purpose. The API reports card
// levels *relative to the rarity*, not to the game: a "level 9" Common is game
// level 9, but a "level 9" Legendary is game level 14. Nothing errors when you
// get this wrong -- the number is present, plausible and quietly incorrect for
// four of the five rarities -- so every card surface has to go through
// gameLevel() rather than reading `card.level` directly.
//
// The same shape of bug as the Clash of Clans Builder Base troop levels.

/**
 * Community-documented copy requirements (Clash Royale Wiki "Cards" upgrade
 * table). Because API levels are rarity-relative, the Nth upgrade of *any*
 * rarity uses the Nth entry -- which is exactly why the table is indexed by
 * the raw API level and not by the game level.
 */
export const COPY_TABLE = [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000, 2000, 5000] as const;

/** Game level of each rarity's level 1. Common starts at 1, Champion at 11. */
const START: Record<string, number> = {
  common: 1,
  rare: 3,
  epic: 6,
  legendary: 9,
  champion: 11,
};

export type CopyProgress =
  | { kind: 'max'; owned: number }
  | { kind: 'unknown'; owned: number }
  | { kind: 'progress'; owned: number; needed: number; ready: boolean };

/** Rarity-relative API level -> the level shown in game. */
export function gameLevel(level: number, rarity: string) {
  return level + (START[rarity.toLowerCase()] ?? 1) - 1;
}

/**
 * Copies held against copies needed for the next upgrade.
 *
 * `unknown` rather than a guess when the level is missing or past the end of
 * the table: a fabricated denominator would render as a confident progress bar.
 */
export function copyProgress(level: unknown, maxLevel: unknown, count: unknown): CopyProgress {
  const owned = typeof count === 'number' ? count : 0;
  if (typeof level !== 'number') return { kind: 'unknown', owned };
  if (typeof maxLevel === 'number' && level >= maxLevel) return { kind: 'max', owned };
  const needed = COPY_TABLE[level - 1];
  if (needed === undefined) return { kind: 'unknown', owned };
  return { kind: 'progress', owned, needed, ready: owned >= needed };
}
