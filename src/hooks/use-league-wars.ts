import { useQueries } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, type ApiRecord, type GameResult } from '@/api/game-api';
import { allWarTags } from '@/lib/cwl';

/**
 * Every war of a league season, keyed by war tag.
 *
 * A full season is 7 rounds of 4 wars, so this is up to 28 requests. Only
 * rounds that have actually been drawn are asked for -- `allWarTags` drops the
 * `#0` placeholders -- so early in a season it is a handful, growing as the
 * week goes on. React Query's 60s staleTime means the standings, the round
 * views and the individual war boards all share one fetch each.
 *
 * Parsing happens in `select`, not in a `useMemo` over the results array: that
 * array gets a new identity every render, so a memo keyed on it would re-parse
 * all 28 bodies each time. `select` results are cached by React Query against
 * the query data itself.
 *
 * `tags` overrides which wars to ask for. Today passes `sampleWarTags` -- one
 * war per round rather than all four -- because it only needs each round's
 * timing, and the four wars of a round agree on that. Everything else wants
 * the default, because it reads results, which differ.
 */
export function useLeagueWars(group: ApiRecord | undefined, tagsOverride?: string[]) {
  const tags = tagsOverride ?? (group ? allWarTags(group) : []);

  const results = useQueries({
    queries: tags.map((tag) => ({
      ...gameQuery({ game: 'coc', resource: 'leagueWar' as const, tag }),
      select: parseWar,
      // A war being fought moves; a finished or unstarted one cannot. Polling
      // only the live ones keeps a round at ~4 requests a minute, not 28.
      refetchInterval: (q: { state: { data?: GameResult } }) =>
        parseWar(q.state.data ?? { ok: false, status: 0, error: '' })?.['state'] === 'inWar'
          ? 30000
          : false,
    })),
  });

  // Built plainly rather than memoised. The expensive half -- JSON.parse of
  // each war -- is already cached by `select`; assembling a Map of at most 28
  // entries that are already objects is not worth a dependency key.
  const warsByTag = new Map<string, ApiRecord>();
  tags.forEach((tag, i) => {
    const war = results[i]?.data;
    if (war) warsByTag.set(tag, war);
  });

  return {
    warsByTag,
    loading: results.some((r) => r.isPending),
    loaded: warsByTag.size,
    expected: tags.length,
  };
}

function parseWar(result: GameResult): ApiRecord | undefined {
  if (!result.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}
