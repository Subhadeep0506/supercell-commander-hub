import { readJson, writeJson } from '@/state/storage';



const KEY = 'sch:bs-ranks';


export type RankSnapshot = {

  at: string;

  ranks: Record<string, number>;
};

type Stored = Record<string, RankSnapshot>;

export type Movement = 'up' | 'down' | 'same' | 'new';

/**
 * Identifies a board. Keep the brawler id in it: the per-brawler ladders are
 * 111 different boards and must not share one baseline.
 */
export const boardKey = (board: string, brawlerId?: number): string =>
  brawlerId === undefined ? board : `${board}:${brawlerId}`;

export async function readSnapshot(key: string): Promise<RankSnapshot | undefined> {
  const all = await readJson<Stored>(KEY);
  return all?.[key];
}

/**
 * Records the ladder as it stands now.
 *
 * Only rows carrying both a tag and a numeric rank are kept, and the whole
 * board is replaced rather than merged — a player who has dropped off the
 * loaded pages should not keep their stale rank forever.
 */
export async function writeSnapshot(
  key: string,
  rows: { tag: string; rank: number }[],
): Promise<void> {
  if (!rows.length) return;
  const all = (await readJson<Stored>(KEY)) ?? {};
  const ranks: Record<string, number> = {};
  for (const row of rows) {
    if (row.tag && Number.isFinite(row.rank)) ranks[row.tag.toUpperCase()] = row.rank;
  }
  await writeJson(KEY, { ...all, [key]: { at: new Date().toISOString(), ranks } });
}

/**
 * How a row has moved against the baseline.
 *
 * A **lower** rank number is a better position, so rank 5 -> 2 is `up`.
 * Returns undefined when there is no baseline to compare against at all, which
 * the caller renders as nothing rather than as "no change".
 */
export function movement(
  snapshot: RankSnapshot | undefined,
  tag: string,
  rank: unknown,
): Movement | undefined {
  if (!snapshot || typeof rank !== 'number') return undefined;
  const before = snapshot.ranks[tag.toUpperCase()];
  if (before === undefined) return 'new';
  if (before === rank) return 'same';
  return rank < before ? 'up' : 'down';
}


export function movedBy(
  snapshot: RankSnapshot | undefined,
  tag: string,
  rank: unknown,
): number | undefined {
  if (!snapshot || typeof rank !== 'number') return undefined;
  const before = snapshot.ranks[tag.toUpperCase()];
  return before === undefined || before === rank ? undefined : Math.abs(before - rank);
}


export function sinceLabel(at: string | undefined): string | undefined {
  if (!at) return undefined;
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return undefined;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return 'a moment ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
