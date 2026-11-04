import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, text } from '@/api/game-api';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CocPlayer } from '../coc/CocPlayer';
import { Source } from '../coc/CocBits';
import { EmptyState } from '../coc/clan/ClanBits';
import { ClanOverview } from '../coc/clan/ClanOverview';
import { ClanCapitalRaids } from '../coc/clan/ClanCapitalRaids';
import { ClanWarLog } from '../coc/clan/ClanWarLog';
import { WarDetail } from '../coc/war/WarDetail';
import { useDetailSheet, type SheetEntry } from './DetailSheetProvider';
import { LayerFill, LayerLoading, parsed, sheetTitleStyle } from './DetailBits';

/**
 * Clash of Clans sheet layers.
 *
 * Lifted out of DetailSheet unchanged when the sheet became cross-game, so
 * that file is a shell and a dispatch rather than a shell, a dispatch and one
 * game's worth of renderers.
 */

/** Header text, read from the record the layer below already fetched. */
export function CocSheetTitle({ entry }: { entry: SheetEntry }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const resource =
    entry.kind === 'player' ? 'player' : entry.kind === 'cwlWar' ? 'leagueWar' : 'clan';
  // Already in the cache by the time the title renders -- the layer below
  // fetched it. No request is made here.
  const { data } = useQuery(gameQuery({ game: 'coc', resource, tag: entry.tag }));
  const record_ = parsed(data);
  const name = record_ ? text(record_['name']) : entry.tag;
  const title =
    entry.kind === 'capital'
      ? `Capital raids · ${name}`
      : entry.kind === 'warLog'
        ? `War history · ${name}`
        : entry.kind === 'cwlWar'
          ? record_
            ? `${text(record(record_['clan'])['name'])} vs ${text(record(record_['opponent'])['name'])}`
            : 'War League battle'
          : name;
  return (
    <Text style={s.title} numberOfLines={2}>
      {title}
    </Text>
  );
}

/** Dispatches one Clash of Clans entry to its renderer. */
export function CocLayer({ entry }: { entry: SheetEntry }) {
  if (entry.kind === 'player') return <PlayerEntry tag={entry.tag} />;
  if (entry.kind === 'cwlWar') {
    return <LeagueWarEntry tag={entry.tag} clanTag={entry.clanTag} />;
  }
  // Everything left is addressed by clan tag. The two league kinds must be
  // handled above: `cwlWar` carries a *war* tag, and asking the clans endpoint
  // for one 404s.
  return <ClanEntry entry={entry} />;
}

function PlayerEntry({ tag }: { tag: string }) {
  const { data: result, isFetching } = useQuery(
    gameQuery({ game: 'coc', resource: 'player', tag }),
  );
  const player = parsed(result);

  if (isFetching && !player) return <LayerLoading label="Loading village…" />;
  if (!player) {
    return (
      <LayerFill>
        <EmptyState
          title="Village not found"
          body={`Nothing came back for ${tag}. The player may have changed their tag.`}
        />
        {result ? <Source result={result} /> : null}
      </LayerFill>
    );
  }

  return (
    <>
      <CocPlayer player={player} />
      {result ? <Source result={result} /> : null}
    </>
  );
}

/** One league war, fetched by its war tag. */
function LeagueWarEntry({ tag, clanTag }: { tag: string; clanTag?: string }) {
  const { data: result, isFetching } = useQuery(
    gameQuery({ game: 'coc', resource: 'leagueWar', tag }),
  );
  const war = parsed(result);

  if (isFetching && !war) return <LayerLoading label="Loading the battle…" />;
  if (!war) {
    return (
      <LayerFill>
        <EmptyState
          title="War not found"
          body={`Nothing came back for ${tag}. League wars drop out of the API once the season is over.`}
        />
        {result ? <Source result={result} /> : null}
      </LayerFill>
    );
  }

  return (
    <>
      <WarDetail war={war} clanTag={clanTag} />
      {result ? <Source result={result} /> : null}
    </>
  );
}

function ClanEntry({ entry }: { entry: SheetEntry }) {
  const { pushView, close } = useDetailSheet();
  const { data: result, isFetching } = useQuery(
    gameQuery({ game: 'coc', resource: 'clan', tag: entry.tag }),
  );
  const clan = parsed(result);

  if (isFetching && !clan) return <LayerLoading label="Loading clan…" />;
  if (!clan) {
    return (
      <LayerFill>
        <EmptyState
          title="Clan not found"
          body={`Nothing came back for ${entry.tag}. Check the tag, or try again in a moment.`}
        />
        {result ? <Source result={result} /> : null}
      </LayerFill>
    );
  }

  if (entry.kind === 'capital') return <ClanCapitalRaids tag={entry.tag} />;
  if (entry.kind === 'warLog') return <ClanWarLog clan={clan} tag={entry.tag} />;

  return (
    <>
      <ClanOverview
        clan={clan}
        onOpenCapital={() => pushView({ kind: 'capital', tag: entry.tag, game: 'coc' })}
        onOpenWarLog={() => pushView({ kind: 'warLog', tag: entry.tag, game: 'coc' })}
        onClose={close}
      />
      {result ? <Source result={result} /> : null}
    </>
  );
}

const build = (t: Theme) => StyleSheet.create({ title: sheetTitleStyle(t) });
