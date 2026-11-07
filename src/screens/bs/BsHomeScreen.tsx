import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { gameQuery } from '@/api/queries';
import { record, type ApiRecord } from '@/api/game-api';
import { BsShell } from '@/components/bs/BsBits';
import { BsLookup } from '@/components/bs/BsLookup';
import { BsPlayer } from '@/components/bs/BsPlayer';
import { BsBrawlerGrid } from '@/components/bs/BsBrawlerGrid';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { collection } from '@/lib/bs-brawlers';
import type { RootStackParamList } from '@/navigation/routes';

type Props = NativeStackScreenProps<RootStackParamList, 'BsHome'>;

/**
 * Your Brawl Stars account, and your brawlers.
 *
 * The `key` on BsLookup matters for the same reason it does on the other two
 * games' home screens: arriving from a roster row changes only the tag param,
 * and without a remount the lookup keeps the previous account's override.
 */
export function BsHomeScreen({ route }: Props) {
  const tag = route.params?.tag ?? '';
  return (
    <BsShell>
      <BsLookup key={tag} view="player" initialTag={tag}>
        {(player, resolved) => <Account player={player} tag={resolved} />}
      </BsLookup>
    </BsShell>
  );
}

function Account({ player, tag }: { player: ApiRecord; tag: string }) {
  const { pushView } = useDetailSheet();

  /*
   * The full 111-brawler catalog, for the locked half of the grid and for the
   * kit totals a brawler card compares against.
   *
   * A long staleTime because it only changes when Supercell ships a brawler,
   * and it is the single largest response the app fetches for this game.
   */
  const catalog = useQuery({
    ...gameQuery({ game: 'bs', resource: 'catalog' }),
    staleTime: 3600000,
  });

  const entries = useMemo(() => {
    const items = catalog.data?.ok ? record(JSON.parse(catalog.data.data))['items'] : [];
    return collection(items, player['brawlers']);
  }, [catalog.data, player]);

  return (
    <>
      <BsPlayer player={player} tag={tag} />
      {/*
        The grid waits for the catalog rather than rendering your brawlers
        alone and growing to 111 a moment later -- which would reflow the whole
        page under the reader's thumb.
      */}
      {/*
        The brawler opens as a layer of the shared detail sheet, the same way
        it does from anyone else's profile -- one view, one back arrow, rather
        than a Modal here and nothing at all there.
      */}
      {entries.length ? (
        <BsBrawlerGrid
          entries={entries}
          onOpen={(entry) => pushView({ game: 'bs', kind: 'brawler', tag, brawlerId: entry.id })}
        />
      ) : null}
    </>
  );
}
