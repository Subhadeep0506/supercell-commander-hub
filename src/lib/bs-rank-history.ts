import { readJson, writeJson } from '@/state/storage';

/**
 * Rank movement for the Brawl Stars ladders, remembered on the device.
 *
 * **The service publishes no movement at all.** A ranking row is
 * `{tag, name, nameColor, icon, trophies, rank, club}` — no previous rank, no
 * delta, no timestamp. So an arrow cannot be read from a response; it can only
 * be worked out by comparing two responses, and the only two this app will
 * ever have are the one on screen and the last one it saw.
 *
 * That makes the claim a narrow one, and the UI has to say so: movement is
 * **since you last opened this board**, which may be an hour or a month, not
 * "since yesterday" or any fixed period. The first visit to a board shows no
 * arrows at all, because there is nothing to compare against.
 *
 * Stored under its own key rather than inside the settings blob: it is
 * rewritten on every board view and `patchJson` would re-serialise the whole
 * of settings each time — the same reasoning that keeps the village separate.
 */

const KEY = 'sch:bs-ranks';

/** One board's last-seen state. */
export type RankSnapshot = {
  /** ISO timestamp of the reading. */
  at: string;
  /** Tag -> rank, for every row that had been loaded. */
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

/** How many places, for the arrow's label. Undefined unless it actually moved. */
export function movedBy(
  snapshot: RankSnapshot | undefined,
  tag: string,
  rank: unknown,
): number | undefined {
  if (!snapshot || typeof rank !== 'number') return undefined;
  const before = snapshot.ranks[tag.toUpperCase()];
  return before === undefined || before === rank ? undefined : Math.abs(before - rank);
}

/** "3 days ago", for the caption that qualifies the whole column. */
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
