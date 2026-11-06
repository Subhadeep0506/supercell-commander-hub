import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, type ApiRecord, type GameRequest, type GameResult } from '@/api/game-api';

/**
 * Server-side paging for the ranking ladders.
 *
 * The boards used to stop at whatever one request returned -- 25 rows on
 * Clash of Clans, because the path hardcoded `limit=25`. Supercell pages these
 * with an opaque `paging.cursors.after`, so this walks the cursor a page at a
 * time, on demand: one network page per "Load more", not a burst of six when
 * the screen opens.
 *
 * Each page is its own `useQuery`, so they keep the shared 60s `staleTime` and
 * a page already fetched costs nothing when the board is revisited.
 *
 * **The real ceiling is the service's, not this cap.** Clash of Clans location
 * boards have historically run to a couple of hundred entries, and the only
 * honest signal that there are no more is the cursor going missing. `hasMore`
 * reflects that rather than promising a round number, and `CAP` only stops the
 * list growing without bound.
 */
const CAP = 300;

export type RankingPages = {
  /** Every row fetched so far, in service order. */
  items: ApiRecord[];
  /** The first page's result, for the "source / fetched at" footer and errors. */
  first?: GameResult;
  /** True while any page is in flight. */
  isFetching: boolean;
  /** True while a *later* page is in flight -- the first page shows a skeleton. */
  isFetchingMore: boolean;
  /** The service offered another cursor and the cap has not been reached. */
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
};

export function useRankingPages(request: GameRequest, pageSize = 50): RankingPages {
  /*
   * Cursors for pages *after* the first, held in state beside the key they
   * belong to.
   *
   * The key is compared during render rather than reset in an effect, so
   * changing board, mode or location collapses to page one in the same render
   * as the change -- an effect would paint one frame of the old board's page
   * four first. Same reasoning as `usePaged`.
   */
  const key = JSON.stringify(request);
  const [state, setState] = useState<{ key: string; cursors: string[] }>({ key, cursors: [] });
  const cursors = state.key === key ? state.cursors : [];

  const results = useQueries({
    queries: [undefined, ...cursors].map((after) =>
      gameQuery({ ...request, limit: pageSize, ...(after ? { after } : {}) }),
    ),
  });

  const items = useMemo(() => {
    const out: ApiRecord[] = [];
    const seen = new Set<string>();
    for (const page of results) {
      const parsed = parse(page.data);
      if (!parsed) continue;
      for (const row of rows(parsed['items'])) {
        // A cursor that repeats a row -- or a reset between pages -- would
        // otherwise show the same clan twice with the same rank.
        const id = String(row['tag'] ?? `${row['rank']}`);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(row);
      }
    }
    return out;
    // Each entry is a stable React Query result object; the data identity is
    // what matters and it changes only when a page arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join(',')]);

  const last = results[results.length - 1];
  const after = nextCursor(last?.data);
  /*
   * A cursor we have already followed means the service is handing back the
   * page we are on. Treating that as "there is more" gives a Load more button
   * that fetches forever and adds nothing -- which is exactly what the clan
   * fixture does, since it answers every request with the same page and the
   * same cursor.
   */
  const fresh = Boolean(after) && !cursors.includes(after!);

  return {
    items,
    first: results[0]?.data,
    isFetching: results.some((r) => r.isFetching),
    isFetchingMore: results.slice(1).some((r) => r.isFetching),
    hasMore: fresh && items.length < CAP && !last?.isFetching,
    loadMore: () => {
      if (!fresh) return;
      setState({ key, cursors: [...cursors, after!] });
    },
    refetch: () => {
      // Back to one page: a refresh on page four would leave three stale
      // pages above a fresh one.
      setState({ key, cursors: [] });
      void results[0]?.refetch();
    },
  };
}

function parse(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

/**
 * `paging.cursors.after`, when the service offered one.
 *
 * Documented but never live-tested for these endpoints -- see `ReferencePaging`
 * in the captured schema -- so its absence is treated as "that was the last
 * page" rather than as an error.
 */
function nextCursor(result: GameResult | undefined): string | undefined {
  const cursor = record(record(parse(result)?.['paging'])['cursors'])['after'];
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}
