import { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, text } from '@/api/game-api';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { collection } from '@/lib/bs-brawlers';
import { useDetailSheet, type SheetEntry } from './DetailSheetProvider';
import { BsEmpty, Source } from '../bs/BsBits';
import { BsPlayer } from '../bs/BsPlayer';
import { BsBrawlerGrid } from '../bs/BsBrawlerGrid';
import { BsBrawlerBody } from '../bs/BsBrawlerDetail';
import { BsClub } from '../bs/BsClub';
import { LayerFill, LayerLoading, parsed, sheetTitleStyle } from './DetailBits';

/**
 * Brawl Stars sheet layers.
 *
 * `player`, `clan` and `brawler`. The Clash of Clans kinds -- capital raids,
 * war history, a league war -- have no Brawl Stars equivalent: the club
 * endpoint returns eight scalar fields and a roster, with no war, league or
 * history behind it.
 *
 * `clan` means a *club* here. The resource name is shared across all three
 * games in `game-api.ts`, where it resolves to `/v1/clubs/{tag}` for `bs`.
 *
 * `brawler` is the odd one: its `tag` names the player whose collection is
 * being read, not the thing on screen. It is a layer rather than its own Modal
 * because React Native will not stack a second Modal over this sheet.
 */

/**
 * One player's collection, as the brawler views need it.
 *
 * Both queries are already in flight for the player layer underneath, and
 * React Query hands back the same cache entry, so a brawler layer costs no
 * extra request -- it is the same two responses read a second way.
 */
function useBsCollection(tag: string) {
  const player = useQuery(gameQuery({ game: 'bs', resource: 'player', tag }));
  const catalog = useQuery({
    ...gameQuery({ game: 'bs', resource: 'catalog' }),
    staleTime: 3600000,
  });

  /*
   * Memoised on the query result, not called inline.
   *
   * `parsed` runs `JSON.parse`, so calling it in the render body returns a new
   * object every time and the `collection` memo below -- which walks all 111
   * catalog entries -- never hits. React Query's `data` is reference-stable
   * while the query is, so keying on it makes both memos real. That mattered
   * little when one component did this; a brawler layer has the header and the
   * body both reading the same collection.
   */
  const parsedPlayer = useMemo(() => parsed(player.data), [player.data]);

  const entries = useMemo(() => {
    if (!parsedPlayer) return [];
    const items = catalog.data?.ok ? record(JSON.parse(catalog.data.data))['items'] : [];
    return collection(items, parsedPlayer['brawlers']);
  }, [catalog.data, parsedPlayer]);

  return { player: parsedPlayer, result: player.data, isFetching: player.isFetching, entries };
}

export function BsSheetTitle({ entry }: { entry: SheetEntry }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return entry.kind === 'brawler' ? (
    <BsBrawlerTitle tag={entry.tag} brawlerId={entry.brawlerId} style={s.title} />
  ) : (
    <BsTagTitle entry={entry} style={s.title} />
  );
}

function BsTagTitle({ entry, style }: { entry: SheetEntry; style: TextStyle }) {
  const resource = entry.kind === 'player' ? 'player' : 'clan';
  // Served from cache: the layer below this one fetched it.
  const { data } = useQuery(gameQuery({ game: 'bs', resource, tag: entry.tag }));
  const record_ = parsed(data);
  return (
    <Text style={style} numberOfLines={2}>
      {record_ ? text(record_['name']) : entry.tag}
    </Text>
  );
}

/**
 * The brawler's name, not the player's.
 *
 * Split out rather than folded into the ternary above, because the tag on a
 * brawler entry is a *player* tag: handing it to the shared title would have
 * looked a player up as a club and printed an empty header on every brawler.
 */
function BsBrawlerTitle({
  tag,
  brawlerId,
  style,
}: {
  tag: string;
  brawlerId: number;
  style: TextStyle;
}) {
  const { entries } = useBsCollection(tag);
  const entry = entries.find((e) => e.id === brawlerId);
  return (
    <Text style={style} numberOfLines={2}>
      {entry?.name ?? 'Brawler'}
    </Text>
  );
}

/**
 * A Brawl Stars layer, in the stack the Home tab gives these same components.
 *
 * The wrapper is load-bearing. Every one of these bodies is a *fragment* of
 * sibling panels -- BsPlayer's sections, then the collection grid, then the
 * error slot -- and nothing inside them spaces one from the next. On the Home
 * tab `BsShell.shellInner` supplies that with `gap: 12`; in the sheet the
 * container is the layer's ScrollView, whose `content` has padding but no gap,
 * so the Brawlers panel butted straight against Milestones and the club's two
 * sections against each other.
 *
 * It goes here rather than on that shared `content` style because Clash
 * Royale's `Section` already spaces itself with `marginTop: 14` -- a gap on the
 * container would space every Royale sheet twice over.
 *
 * `flexGrow: 1` is what lets `LayerFill` (which is `flex: 1`) still fill the
 * sheet and centre an empty state.
 */
export function BsLayer({ entry }: { entry: SheetEntry }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.stack}>
      <BsLayerBody entry={entry} />
    </View>
  );
}

function BsLayerBody({ entry }: { entry: SheetEntry }) {
  if (entry.kind === 'player') return <BsPlayerEntry tag={entry.tag} />;
  if (entry.kind === 'clan') return <BsClubEntry tag={entry.tag} />;
  if (entry.kind === 'brawler') {
    return <BsBrawlerEntry tag={entry.tag} brawlerId={entry.brawlerId} />;
  }
  return (
    <LayerFill>
      <BsEmpty title="Not available" body="Brawl Stars has no view of this kind." />
    </LayerFill>
  );
}

function BsBrawlerEntry({ tag, brawlerId }: { tag: string; brawlerId: number }) {
  const { entries, isFetching, player } = useBsCollection(tag);
  const entry = entries.find((e) => e.id === brawlerId);

  if (!entry) {
    // Still loading is the common case; a genuinely unknown id only happens if
    // the catalog call failed, and both read the same from here.
    if (isFetching || !player) return <LayerLoading label="Loading brawler…" />;
    return (
      <LayerFill>
        <BsEmpty title="Brawler unavailable" body="That brawler is not in the catalog." />
      </LayerFill>
    );
  }

  return <BsBrawlerBody entry={entry} playerTag={tag} />;
}

function BsPlayerEntry({ tag }: { tag: string }) {
  const { pushView } = useDetailSheet();
  /*
   * The catalog comes with it, so an opponent's collection shows what they
   * have *not* unlocked as well. Shared cache with the Home screen, so opening
   * a player from a battle costs one call rather than two.
   */
  const { player, result, isFetching, entries } = useBsCollection(tag);

  if (isFetching && !player) return <LayerLoading label="Loading player…" />;
  if (!player) {
    return (
      <LayerFill>
        <BsEmpty
          title="Player unavailable"
          body="The service does not know that tag, or could not be reached."
        />
      </LayerFill>
    );
  }

  return (
    <>
      {/*
        BsPlayer carries the "reset or inactive" notice itself, which matters
        most here: a battle opponent is the usual way to land on a ghost
        profile, and arriving from a battle that showed them at 1,267 trophies
        makes a page of zeros look like our failure rather than theirs.
      */}
      <BsPlayer player={player} tag={tag} />
      {/*
        Tiles are tappable here now. They used to be inert, because the brawler
        view owned a Modal and React Native will not stack a second one over
        this sheet; it is a layer of this same stack instead, so tapping pushes
        and the header's back arrow returns to this profile.
      */}
      {entries.length ? (
        <BsBrawlerGrid
          entries={entries}
          onOpen={(entry) => pushView({ game: 'bs', kind: 'brawler', tag, brawlerId: entry.id })}
        />
      ) : null}
      <Source result={result} />
    </>
  );
}

function BsClubEntry({ tag }: { tag: string }) {
  const { data: result, isFetching } = useQuery(gameQuery({ game: 'bs', resource: 'clan', tag }));
  const club = parsed(result);

  if (isFetching && !club) return <LayerLoading label="Loading club…" />;
  if (!club) {
    return (
      <LayerFill>
        <BsEmpty
          title="Club unavailable"
          body="The service does not know that tag, or could not be reached."
        />
      </LayerFill>
    );
  }

  return (
    <>
      <BsClub club={club} />
      <Source result={result} />
    </>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    title: sheetTitleStyle(t),
    // Mirrors BsShell.shellInner's gap -- see BsLayer.
    stack: { flexGrow: 1, gap: 12 },
  });
