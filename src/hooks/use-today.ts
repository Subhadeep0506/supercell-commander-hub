import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { sampleWarTags } from '@/lib/cwl';
import { buildToday, tournamentItems, type TodayEvent, type TodayNote } from '@/lib/today';
import { useHub } from '@/state/HubProvider';
import { useLeagueWars } from './use-league-wars';

/**
 * Everything the Today screen needs, fetched and reduced to an event list.
 *
 * Nothing here renders and nothing here decides what Today *means* -- that is
 * `buildToday`, which is pure and tested. This hook's only job is getting the
 * records, and doing it without turning a launch screen into a request storm.
 *
 * Two things keep the cost down:
 *
 * - **One war per Clan War League round, not all 28.** `sampleWarTags` takes
 *   the first tag of each drawn round; the round's four wars share a state and
 *   a pair of timestamps, so the sample is exact rather than approximate.
 * - **React Query's 60s `staleTime`.** The player and clan records here are the
 *   same query keys the Home and Clan screens use, so arriving at Today and
 *   then tapping through costs one fetch, not two.
 */
export function useToday(): {
  events: TodayEvent[];
  notes: TodayNote[];
  accounts: { coc?: ApiRecord; cr?: ApiRecord };
  /** True only while nothing has arrived yet -- a refetch must not blank the screen. */
  loading: boolean;
  /** No account saved for any game: the screen has nothing to resolve from. */
  empty: boolean;
} {
  const { passport, ready } = useHub();
  const cocTag = passport.coc;
  const crTag = passport.cr;

  // --- the two player records, which also carry the clan tags -------------
  const cocPlayer = useQuery({
    ...gameQuery({ game: 'coc', resource: 'player', tag: cocTag }),
    enabled: ready && Boolean(cocTag),
  });
  const crPlayer = useQuery({
    ...gameQuery({ game: 'cr', resource: 'player', tag: crTag }),
    enabled: ready && Boolean(crTag),
  });

  const cocRecord = parsed(cocPlayer.data);
  const crRecord = parsed(crPlayer.data);
  const cocClan = clanTag(cocRecord);
  const crClan = clanTag(crRecord);

  // --- Clash of Clans: three real countdowns ------------------------------
  const war = useQuery({
    ...gameQuery({ game: 'coc', resource: 'war', tag: cocClan }),
    enabled: ready && Boolean(cocClan),
  });
  const leagueGroup = useQuery({
    ...gameQuery({ game: 'coc', resource: 'leagueGroup', tag: cocClan }),
    enabled: ready && Boolean(cocClan),
  });
  const raids = useQuery({
    ...gameQuery({ game: 'coc', resource: 'capitalRaids', tag: cocClan, limit: 2 }),
    enabled: ready && Boolean(cocClan),
  });

  const group = parsed(leagueGroup.data);
  // Built before the hook so the tag list is stable between renders.
  const sampled = useMemo(() => (group ? sampleWarTags(group) : []), [group]);
  const { warsByTag } = useLeagueWars(group, sampled);

  // --- Clash Royale: a tournament if one is live, else a sentence ----------
  const tournaments = useQuery({
    ...gameQuery({ game: 'cr', resource: 'globalTournaments' }),
    enabled: ready,
  });
  const riverRace = useQuery({
    ...gameQuery({ game: 'cr', resource: 'riverRace', tag: crClan }),
    enabled: ready && Boolean(crClan),
  });

  const { events, notes } = useMemo(
    () =>
      buildToday({
        war: parsed(war.data),
        leagueGroup: group,
        leagueWars: warsByTag,
        raidSeasons: rows(parsed(raids.data)?.['items']),
        tournaments: tournamentItems(parsedAny(tournaments.data)),
        riverRace: parsed(riverRace.data),
        hasCoc: Boolean(cocTag),
        hasCr: Boolean(crTag),
      }),
    // `warsByTag` is rebuilt every render by design (see useLeagueWars), so
    // it is keyed on its size instead -- the map only grows as wars arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [war.data, group, warsByTag.size, raids.data, tournaments.data, riverRace.data, cocTag, crTag],
  );

  // A refetch over cached data must not blank the board, so this is "nothing
  // has arrived yet", not "a request is in flight".
  const loading =
    !ready ||
    (Boolean(cocTag) && !cocPlayer.data && cocPlayer.isFetching) ||
    (Boolean(crTag) && !crPlayer.data && crPlayer.isFetching);

  return {
    events,
    notes,
    accounts: { coc: cocRecord, cr: crRecord },
    loading,
    empty: ready && !cocTag && !crTag,
  };
}

function parsed(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

/** Same, but keeps a top-level array -- `globaltournaments` may return one. */
function parsedAny(result: GameResult | undefined): unknown {
  if (!result?.ok) return undefined;
  try {
    return JSON.parse(result.data);
  } catch {
    return undefined;
  }
}

function clanTag(player: ApiRecord | undefined): string {
  const tag = text(record(player?.['clan'])['tag']);
  return tag === '—' ? '' : tag;
}
