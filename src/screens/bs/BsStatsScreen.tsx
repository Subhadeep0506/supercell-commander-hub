import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { gameQuery } from '@/api/queries';
import { record, text, type ApiRecord } from '@/api/game-api';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { BsEmpty, BsShell, Source } from '@/components/bs/BsBits';
import { BsLookup } from '@/components/bs/BsLookup';
import { BsBattles } from '@/components/bs/BsBattles';
import { normalizeBattles } from '@/lib/bs-battles';
import { liveEventIds, normalizeEvents } from '@/lib/bs-events';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'BsStats'>;

/**
 * Your battle log, and the numbers worked out from it.
 *
 * Resolves the account through BsLookup rather than reading the passport
 * directly, so arriving at `/bs/stats?tag=#…` from a roster row shows that
 * player's log, and so the tag-entry empty state is the same one Home uses.
 */
export function BsStatsScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  return (
    <BsShell>
      <BsLookup key={tag} view="player" initialTag={tag}>
        {(player, resolved) => <Log player={player} tag={resolved} />}
      </BsLookup>
    </BsShell>
  );
}

function Log({ player, tag }: { player: ApiRecord; tag: string }) {
  // The log is addressed by the resolved profile's own tag rather than by the
  // route param, so a tag typed in any casing or without its # still matches
  // the participant rows -- which is how `me` is found in every battle.
  const myTag = text(player['tag']) !== '—' ? text(player['tag']) : tag;

  const battlelog = useQuery({
    ...gameQuery({ game: 'bs', resource: 'battles', tag: myTag }),
    enabled: Boolean(myTag),
  });

  /*
   * The rotation, only so a battle on a map that is live right now can say so.
   * Cheap, shared with Today through the same query key, and failing it costs
   * the marker rather than the screen.
   */
  const rotation = useQuery({
    ...gameQuery({ game: 'bs', resource: 'events' }),
    staleTime: 600000,
  });

  const battles = useMemo(
    () =>
      battlelog.data?.ok
        ? normalizeBattles(record(JSON.parse(battlelog.data.data))['items'], myTag)
        : [],
    [battlelog.data, myTag],
  );

  const live = useMemo(
    () => (rotation.data?.ok ? liveEventIds(normalizeEvents(JSON.parse(rotation.data.data))) : undefined),
    [rotation.data],
  );

  if (battlelog.isFetching && !battlelog.data) return <SkeletonRows rows={6} />;

  /*
   * A 404 here is not an outage.
   *
   * The service answers 404 `notFound` for an account with nothing in the
   * window -- it did so for both players in the first capture, including one
   * with 3,463 3v3 wins. Reporting that as a failure would be wrong, and
   * reporting it as an empty list would hide that we asked.
   */
  if (battlelog.data && !battlelog.data.ok) {
    return (
      <BsEmpty
        title="No battle log"
        body={
          battlelog.data.status === 404
            ? 'No recent battles for this account.'
            : 'The Brawl Stars service could not be reached.'
        }
      />
    );
  }

  return (
    <>
      <BsBattles battles={battles} liveEventIds={live} />
      <Source result={battlelog.data} />
    </>
  );
}
