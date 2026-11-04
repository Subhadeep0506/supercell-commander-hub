import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { text } from '@/api/game-api';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CrEmpty, Source } from '../cr/CrBits';
import { CrPlayer } from '../cr/CrPlayer';
import { CrClanPanel } from '../cr/CrClan';
import type { SheetEntry } from './DetailSheetProvider';
import { LayerFill, LayerLoading, parsed, sheetTitleStyle } from './DetailBits';

/**
 * Clash Royale sheet layers.
 *
 * Only `player` and `clan`. Clash of Clans' extra kinds -- capital raids, war
 * history, a league war -- have no Royale equivalent: River Race is a tab
 * inside the clan layer, because it is a view of the clan rather than a
 * separate history to drill into.
 */

export function CrSheetTitle({ entry }: { entry: SheetEntry }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const resource = entry.kind === 'player' ? 'player' : 'clan';
  // Served from cache: the layer below this one fetched it.
  const { data } = useQuery(gameQuery({ game: 'cr', resource, tag: entry.tag }));
  const record_ = parsed(data);
  return (
    <Text style={s.title} numberOfLines={2}>
      {record_ ? text(record_['name']) : entry.tag}
    </Text>
  );
}

export function CrLayer({ entry }: { entry: SheetEntry }) {
  if (entry.kind === 'player') return <CrPlayerEntry tag={entry.tag} />;
  if (entry.kind === 'clan') return <CrClanEntry tag={entry.tag} />;
  // capital / warLog / cwlWar are Clash of Clans only. Reaching here means a
  // caller pushed a CoC kind with game: 'cr'.
  return (
    <LayerFill>
      <CrEmpty title="Not available" body="Clash Royale has no view of this kind." />
    </LayerFill>
  );
}

function CrPlayerEntry({ tag }: { tag: string }) {
  const { data: result, isFetching } = useQuery(gameQuery({ game: 'cr', resource: 'player', tag }));
  const player = parsed(result);

  if (isFetching && !player) return <LayerLoading label="Loading player…" />;
  if (!player) {
    return (
      <LayerFill>
        <CrEmpty
          title="Player not found"
          body={`Nothing came back for ${tag}. The player may have changed their tag.`}
        />
        {result ? <Source result={result} /> : null}
      </LayerFill>
    );
  }

  return (
    <>
      <CrPlayer player={player} tag={tag} />
      {result ? <Source result={result} /> : null}
    </>
  );
}

function CrClanEntry({ tag }: { tag: string }) {
  const { data: result, isFetching } = useQuery(gameQuery({ game: 'cr', resource: 'clan', tag }));
  const clan = parsed(result);

  if (isFetching && !clan) return <LayerLoading label="Loading clan…" />;
  if (!clan) {
    return (
      <LayerFill>
        <CrEmpty
          title="Clan not found"
          body={`Nothing came back for ${tag}. Check the tag, or try again in a moment.`}
        />
        {result ? <Source result={result} /> : null}
      </LayerFill>
    );
  }

  return (
    <>
      <CrClanPanel clan={clan} tag={tag} />
      {result ? <Source result={result} /> : null}
    </>
  );
}

const build = (t: Theme) => StyleSheet.create({ title: sheetTitleStyle(t) });
