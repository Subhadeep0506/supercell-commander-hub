import { getGameData } from '@/api/client';
import { normalizeTag, record, rows, text, type ApiRecord } from '@/api/game-api';
import { seasonIds } from './royale-ladders';

/**
 * Collecting the battle logs the meta is computed from, on the device.
 *
 * There is no backend here -- `api/client.ts` fetches the proxy straight from
 * the phone -- so this is the whole pipeline: pick whose logs to read, read
 * them with a bounded number in flight, hand the battles to `aggregate`.
 *
 * It is deliberately explicit about its budget. A hundred requests is a real
 * cost on mobile data, so nothing here runs on mount; `CrDecks` starts it on a
 * press and caches the result for a week.
 */

/** Requests in flight. Enough to be quick, few enough not to look like abuse. */
const CONCURRENCY = 6;

/** Battle logs to read. ~75% of the battles in them will be competitive. */
export const DEFAULT_BUDGET = 100;

export type SampleResult = {
  battles: ApiRecord[];
  /** Logs that came back. */
  sampled: number;
  /** Logs that failed or were empty. Shown, not swallowed. */
  failed: number;
  /** Where the tags came from, for the "what did you measure" line. */
  seeds: { opponents: number; clanmates: number; topLadder: number };
  fetchedAt: string;
};

const VALID_TAG = /^#[0289PYLQGRJCUV]{3,14}$/;

function addTags(into: Set<string>, tags: string[], skip: Set<string>): number {
  let added = 0;
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!VALID_TAG.test(tag) || skip.has(tag) || into.has(tag)) continue;
    into.add(tag);
    added += 1;
  }
  return added;
}

async function json(request: Parameters<typeof getGameData>[0]): Promise<unknown> {
  const result = await getGameData(request);
  if (!result.ok) return undefined;
  try {
    return JSON.parse(result.data);
  } catch {
    return undefined;
  }
}

/**
 * Tags of the players at the top of the ranked ladder.
 *
 * Reads the **previous** calendar month. The current season 404s until it
 * closes, and the season *list* endpoint now returns nothing but nulls, so
 * `seasonIds` reconstructs the months from the clock -- see its comment.
 *
 * Last month's leaderboard is the right sample regardless: a battle log is
 * always the last ~30 battles, so these players' *current* decks come back
 * however long ago they were ranked.
 */
async function topLadderTags(limit: number, now: Date): Promise<string[]> {
  for (const season of seasonIds(undefined, now).slice(0, 3)) {
    const body = await json({ game: 'cr', resource: 'pathOfLegend', season, limit });
    const items = rows(record(body)['items']);
    if (items.length > 0) return items.map((p) => text(p['tag']));
  }
  return [];
}

/** Runs `work` over `items`, at most `CONCURRENCY` at a time. */
async function pooled<T>(
  items: T[],
  work: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const item = items[next++]!;
      await work(item);
    }
  });
  await Promise.all(runners);
}

export async function sampleMeta({
  tag,
  player,
  ownBattles,
  budget = DEFAULT_BUDGET,
  signal,
  onProgress,
  now = new Date(),
}: {
  tag: string;
  player: ApiRecord;
  /** The player's own log, already fetched by the Decks screen. Free.  */
  ownBattles: ApiRecord[];
  budget?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  now?: Date;
}): Promise<SampleResult> {
  const self = normalizeTag(tag);
  const skip = new Set([self]);
  const tags = new Set<string>();

  // 1. The people you just fought. They are at your level by definition, and
  //    they cost nothing -- this log is already on screen.
  const opponents = addTags(
    tags,
    ownBattles.flatMap((b) => [...rows(b['opponent']), ...rows(b['team'])].map((p) => text(p['tag']))),
    skip,
  );

  // 2. Your clan. One request for up to fifty tags, spanning every tier.
  let clanmates = 0;
  const clanTag = text(record(player['clan'])['tag']);
  if (VALID_TAG.test(normalizeTag(clanTag))) {
    const clan = await json({ game: 'cr', resource: 'clan', tag: clanTag });
    clanmates = addTags(
      tags,
      rows(record(clan)['memberList']).map((m) => text(m['tag'])),
      skip,
    );
  }

  // 3. The top of the ranked ladder -- the actual competitive meta.
  const topLadder = addTags(tags, await topLadderTags(50, now), skip);

  const queue = [...tags].slice(0, budget);
  const battles: ApiRecord[] = [];
  let sampled = 0;
  let failed = 0;

  await pooled(
    queue,
    async (playerTag) => {
      const body = await json({ game: 'cr', resource: 'battles', tag: playerTag });
      const log = rows(body);
      if (log.length === 0) failed += 1;
      else {
        sampled += 1;
        battles.push(...log);
      }
      onProgress?.(sampled + failed, queue.length);
    },
    signal,
  );

  // The player's own battles belong in the sample too, and they are the only
  // ones guaranteed to be at their exact level.
  battles.push(...ownBattles);

  return {
    battles,
    sampled,
    failed,
    seeds: { opponents, clanmates, topLadder },
    fetchedAt: new Date(now).toISOString(),
  };
}
