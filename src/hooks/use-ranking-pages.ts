import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, type ApiRecord, type GameRequest, type GameResult } from '@/api/game-api';


const CAP = 300;

export type RankingPages = {

  items: ApiRecord[];

  first?: GameResult;

  isFetching: boolean;

  isFetchingMore: boolean;

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
