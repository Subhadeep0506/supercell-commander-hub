import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { sampleWarTags } from '@/lib/cwl';
import {
  buildToday,
  tournamentItems,
  type LiveEvent,
  type TodayEvent,
  type TodayNote,
} from '@/lib/today';
import { normalizeEvents } from '@/lib/bs-events';
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
  /** Running now, but with no end time to count to. */
  live: LiveEvent[];
  accounts: { coc?: ApiRecord; cr?: ApiRecord; bs?: ApiRecord };
  /** True only while nothing has arrived yet -- a refetch must not blank the screen. */
  loading: boolean;
  /**
   * The same, for the "Running now" list.
   *
   * Tracked separately because that query needs no account and no clan tag:
   * it resolves on its own schedule, so folding it into `loading` would hold
   * a skeleton over the whole board for a visitor who has saved nothing.
   */
  loadingLive: boolean;
  /** No account saved for any game: the screen has nothing to resolve from. */
  empty: boolean;
} {
  const { passport, ready } = useHub();
  const cocTag = passport.coc;
  const crTag = passport.cr;
  const bsTag = passport.bs;

  // --- the three player records; the first two also carry the clan tags ---
  const cocPlayer = useQuery({
    ...gameQuery({ game: 'coc', resource: 'player', tag: cocTag }),
    enabled: ready && Boolean(cocTag),
  });
  const crPlayer = useQuery({
    ...gameQuery({ game: 'cr', resource: 'player', tag: crTag }),
    enabled: ready && Boolean(crTag),
  });
  /*
   * Brawl Stars contributes no countdown of its own from the player record --
   * its timeline entries all come from the global rotation below. This is
   * fetched purely so the account appears in "Your accounts" alongside the
   * other two, and it shares the Home screen's query key, so arriving at
   * Today and tapping through costs one request rather than two.
   */
  const bsPlayer = useQuery({
    ...gameQuery({ game: 'bs', resource: 'player', tag: bsTag }),
    enabled: ready && Boolean(bsTag),
  });

  const cocRecord = parsed(cocPlayer.data);
  const crRecord = parsed(crPlayer.data);
  const bsRecord = parsed(bsPlayer.data);
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
  /*
   * What is playable right now. Needs no tag and no account -- these are
   * global, so they render even for a visitor who has saved nothing.
   *
   * Returns a bare array rather than an `items` wrapper, which is why this
   * goes through `parsedAny` and `rows` instead of `parsed`.
   */
  const crEvents = useQuery({
    ...gameQuery({ game: 'cr', resource: 'events' }),
    enabled: ready,
  });

  /*
   * Brawl Stars' rotation. Also global and also account-free, but unlike the
   * Royale list every slot carries a real start and end -- so these join the
   * timeline rather than the "running now" section.
   *
   * Ten minutes of staleTime: a 24-hour slot does not need re-reading on the
   * 60s default, and the Stats screen shares this exact query key for its
   * "live now" map markers.
   */
  const bsEvents = useQuery({
    ...gameQuery({ game: 'bs', resource: 'events' }),
    enabled: ready,
    staleTime: 600000,
  });

  const { events, notes, live } = useMemo(
    () =>
      buildToday({
        war: parsed(war.data),
        leagueGroup: group,
        leagueWars: warsByTag,
        raidSeasons: rows(parsed(raids.data)?.['items']),
        tournaments: tournamentItems(parsedAny(tournaments.data)),
        riverRace: parsed(riverRace.data),
        crEvents: rows(parsedAny(crEvents.data)),
        bsEvents: normalizeEvents(parsedAny(bsEvents.data)),
        hasCoc: Boolean(cocTag),
        hasCr: Boolean(crTag),
      }),
    // `warsByTag` is rebuilt every render by design (see useLeagueWars), so
    // it is keyed on its size instead -- the map only grows as wars arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      war.data,
      group,
      warsByTag.size,
      raids.data,
      tournaments.data,
      riverRace.data,
      crEvents.data,
      bsEvents.data,
      cocTag,
      crTag,
    ],
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
    live,
    accounts: { coc: cocRecord, cr: crRecord, bs: bsRecord },
    loading,
    loadingLive: !ready || (!crEvents.data && crEvents.isFetching),
    // All three now, not two: saving only a Brawl Stars tag used to leave the
    // board reporting "no accounts yet" above a timeline full of its rotation.
    empty: ready && !cocTag && !crTag && !bsTag,
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
