import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord, type GameRequest } from '@/api/game-api';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { Tabs } from '@/components/ui/Tabs';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { useRankingPages } from '@/hooks/use-ranking-pages';
import { useBsRankMovement } from '@/hooks/use-bs-rank-movement';
import {
  boardKey,
  movedBy,
  movement,
  sinceLabel,
  type RankSnapshot,
} from '@/lib/bs-rank-history';
import { useHub } from '@/state/HubProvider';
import { brawlerArt, clubBadgeArt, playerIconArt } from '@/assets/brawl';
import { arenaImages } from '@/assets/registry.arena';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BsPlayerRow } from './BsPlayer';
import { BsEmpty, Chip, Section, Source, nameTint, num } from './BsBits';

type Board = 'players' | 'clubs' | 'brawler';

/**
 * The three Brawl Stars ladders.
 *
 * **Global only, and no country picker.** The service ranks on
 * `/v1/rankings/{countryCode}/…` but exposes **no `/v1/locations` endpoint**
 * to enumerate the codes -- both other games have one -- so there is no list
 * to build a picker from. `gameRequestSchema` rejects a `locationId` for `bs`
 * to keep that from being rediscovered at a call site.
 *
 * The per-brawler ladder has no equivalent in either other game: 111 separate
 * boards, one per brawler.
 *
 * Paging is `useRankingPages`, which walks `paging.cursors.after` one page per
 * press. That only started working for Brawl Stars when `endpoint()` stopped
 * hardcoding `limit=25` and ignoring `after`.
 */
export function BsLeaderboard() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { passport } = useHub();
  // The podium opens profiles directly; the rows below reach the sheet through
  // their own components.
  const { openClan, openPlayer } = useDetailSheet();
  const [board, setBoard] = useState<Board>('players');
  const [brawlerId, setBrawlerId] = useState<number | undefined>();
  const [query, setQuery] = useState('');

  /* The catalog, purely to populate the brawler picker. */
  const catalog = useQuery({
    ...gameQuery({ game: 'bs', resource: 'catalog' }),
    staleTime: 3600000,
  });
  const brawlers = useMemo(() => {
    const items = catalog.data?.ok ? rows(record(JSON.parse(catalog.data.data))['items']) : [];
    return items
      .filter((b) => typeof b['id'] === 'number')
      .sort((a, b) => text(a['name']).localeCompare(text(b['name'])));
  }, [catalog.data]);

  // Default to the first brawler alphabetically once the catalog lands, so
  // the tab is never a picker above an empty list.
  const activeBrawler = brawlerId ?? (brawlers[0]?.['id'] as number | undefined);

  const request: GameRequest =
    board === 'brawler'
      ? { game: 'bs', resource: 'brawlerRankings', brawlerId: activeBrawler ?? 0 }
      : { game: 'bs', resource: 'leaderboard', board: board === 'clubs' ? 'clans' : 'players' };

  const pages = useRankingPages(request, 50);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pages.items;
    // Client-side only: these ladders take no search parameter, so this
    // narrows what has been loaded rather than asking the service.
    return pages.items.filter(
      (row) =>
        text(row['name']).toLowerCase().includes(needle) ||
        text(row['tag']).toLowerCase().includes(needle),
    );
  }, [pages.items, query]);

  /*
   * Movement against the last time this board was opened on this device.
   *
   * Keyed on the brawler id too, because the per-brawler ladders are 111
   * separate boards and must not share one baseline.
   */
  const historyKey = boardKey(board, board === 'brawler' ? activeBrawler : undefined);
  const { baseline } = useBsRankMovement(historyKey, pages.items);
  const since = sinceLabel(baseline?.at);

  // The podium takes the first three, so only the tail is listed -- otherwise
  // the top three appear twice. A filtered view has no podium, so it lists all.
  const podium = query ? [] : filtered.slice(0, 3);
  const rest = query ? filtered : filtered.slice(filtered.length >= 3 ? 3 : 0);

  const ready = board !== 'brawler' || activeBrawler !== undefined;

  return (
    <>
      <Tabs<Board>
        tone="bs"
        value={board}
        onChange={(id) => {
          setBoard(id);
          setQuery('');
        }}
        tabs={[
          { id: 'players', label: 'Players' },
          { id: 'clubs', label: 'Clubs' },
          { id: 'brawler', label: 'By brawler' },
        ]}
      />

      {board === 'brawler' ? (
        <Select
          value={String(activeBrawler ?? '')}
          options={brawlers.map((b) => ({
            id: String(b['id']),
            label: text(b['name']),
            icon: brawlerArt(b['id']),
          }))}
          onChange={(id) => setBrawlerId(Number(id))}
          accessibilityLabel="Choose a brawler"
          title="Brawler"
          placeholder="Choose a brawler…"
        />
      ) : null}

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Filter loaded rows by name or tag…"
        accessibilityLabel="Filter rankings"
      />

      <Section
        title={board === 'clubs' ? 'Top clubs' : 'Top players'}
        right={since ? <Chip label={`vs ${since}`} tone="muted" /> : undefined}
      >
        {pages.isFetching && !pages.items.length ? <SkeletonRows rows={8} /> : null}

        {!pages.isFetching && ready && !pages.items.length ? (
          <BsEmpty
            title="No rankings"
            body="The service returned no rows for this ladder."
          />
        ) : null}

        {/*
          Top three on a plinth, the rest as rows -- matching the Clash of Clans
          and Royale ladders, which answer the same question and should read the
          same. Suppressed while a filter is active: a podium of whoever
          happened to match a search is not a podium.
        */}
        {!query && podium.length === 3 ? (
          <BsPodium
            places={podium}
            board={board}
            onOpen={(tag) => (board === 'clubs' ? openClan(tag, 'bs') : openPlayer(tag, 'bs'))}
          />
        ) : null}

        {rest.length ? (
          <View style={s.list}>
            {rest.map((row) =>
              board === 'clubs' ? (
                <ClubRow key={text(row['tag'])} row={row} baseline={baseline} />
              ) : (
                <PlayerRankRow
                  key={text(row['tag'])}
                  row={row}
                  mine={text(row['tag']) === passport.bs}
                  baseline={baseline}
                />
              ),
            )}
          </View>
        ) : null}

        {query && !filtered.length && pages.items.length ? (
          <Text style={s.none}>Nothing loaded so far matches “{query}”.</Text>
        ) : null}

        {pages.hasMore ? (
          <Button disabled={pages.isFetchingMore} onPress={pages.loadMore}>
            {pages.isFetchingMore ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}

        <Source result={pages.first} />
      </Section>
    </>
  );
}

/**
 * The top three, raised on a plinth.
 *
 * Deliberately shaped like `Podium` in CrBits rather than reusing it: that one
 * takes a `CrIconName` for its score row and reaches into the Royale icon set,
 * which has nothing right for a Brawl ladder. The 2-1-3 ordering, so the
 * winner stands in the middle on the tallest base, is the same.
 */
function BsPodium({
  places,
  board,
  onOpen,
}: {
  places: ApiRecord[];
  board: Board;
  onOpen: (tag: string) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const order = [places[1]!, places[0]!, places[2]!];

  return (
    <View style={s.podium}>
      {order.map((row, i) => {
        const tag = text(row['tag']);
        const tint = nameTint(row['nameColor']);
        const art =
          board === 'clubs'
            ? (clubBadgeArt(row['badgeId']) ?? arenaImages.bsicon)
            : (playerIconArt(record(row['icon'])['id']) ?? arenaImages.bsicon);
        return (
          <Pressable
            key={tag}
            accessibilityRole="button"
            accessibilityLabel={`View ${text(row['name'])}`}
            onPress={() => onOpen(tag)}
            style={s.podiumPlace}
          >
            <Image
              source={art}
              style={[s.podiumArt, i === 1 && s.podiumArtWinner]}
              resizeMode="contain"
            />
            <View style={[s.medal, i === 1 && s.medalWinner]}>
              <Text style={[s.medalText, i === 1 && s.medalTextWinner]}>{num(row['rank'])}</Text>
            </View>
            <Text style={[s.podiumName, tint ? { color: tint } : null]} numberOfLines={1}>
              {text(row['name'])}
            </Text>
            <Text style={s.podiumScore} numberOfLines={1}>
              {num(row['trophies'])}
            </Text>
            <View style={[s.podiumBase, i === 1 ? s.podiumBaseWinner : i === 2 && s.podiumBaseThird]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The movement mark beside a rank.
 *
 * Renders nothing at all when there is no baseline — a first visit shows a
 * bare rank rather than a column of dashes implying "unchanged", which would
 * be a claim we cannot make.
 */
function Move({ baseline, tag, rank }: { baseline?: RankSnapshot; tag: string; rank: unknown }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const dir = movement(baseline, tag, rank);
  const by = movedBy(baseline, tag, rank);
  if (!dir || dir === 'new') return null;
  if (dir === 'same') return <Text style={s.moveSame}>·</Text>;
  const up = dir === 'up';
  return (
    <Text
      style={[s.move, up ? s.moveUp : s.moveDown]}
      accessibilityLabel={`${up ? 'Up' : 'Down'} ${by} place${by === 1 ? '' : 's'}`}
    >
      {up ? '▲' : '▼'}
      {by}
    </Text>
  );
}

function PlayerRankRow({
  row,
  mine,
  baseline,
}: {
  row: ApiRecord;
  mine: boolean;
  baseline?: RankSnapshot;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const club = record(row['club']);
  return (
    <View style={[s.rankWrap, mine && s.rankMine]}>
      <View style={s.rankCol}>
        <Text style={s.rank}>{num(row['rank'])}</Text>
        <Move baseline={baseline} tag={text(row['tag'])} rank={row['rank']} />
      </View>
      <View style={s.rankBody}>
        <BsPlayerRow
          name={text(row['name'])}
          nameColor={row['nameColor']}
          iconId={record(row['icon'])['id']}
          /*
            PlayerRanking.club carries a name and **no tag**, so this cell is
            text rather than a link -- there is nothing to look the club up by.
          */
          subtitle={typeof club['name'] === 'string' ? club['name'] : 'No club'}
          score={row['trophies']}
          onPress={() => openPlayer(text(row['tag']), 'bs')}
        />
      </View>
    </View>
  );
}

function ClubRow({ row, baseline }: { row: ApiRecord; baseline?: RankSnapshot }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();
  const tint = nameTint(row['nameColor']);
  return (
    <View style={s.rankWrap}>
      <View style={s.rankCol}>
        <Text style={s.rank}>{num(row['rank'])}</Text>
        <Move baseline={baseline} tag={text(row['tag'])} rank={row['rank']} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open club ${text(row['name'])}`}
        onPress={() => openClan(text(row['tag']), 'bs')}
        style={s.clubRow}
      >
        <Image
          source={clubBadgeArt(row['badgeId']) ?? arenaImages.bsicon}
          style={s.clubBadge}
          resizeMode="contain"
        />
        <View style={s.clubText}>
          <Text style={[s.clubName, tint ? { color: tint } : null]} numberOfLines={1}>
            {text(row['name'])}
          </Text>
          {/*
            ClubRanking carries memberCount and badgeId but no `type` and no
            description -- there is nothing else about the club to show here.
          */}
          <Text style={s.clubSub}>{num(row['memberCount'])}/30 members</Text>
        </View>
        <Text style={s.clubScore}>{num(row['trophies'])}</Text>
      </Pressable>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    list: { gap: 6 },
    // 4 of gap, not 8: the rank column is already right-aligned against the
    // row, so the old spacing read as an empty margin down the left edge.
    rankWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    rankMine: {
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.brawl.heading,
      paddingRight: 2,
    },
    // The number and its movement mark stack, so a two-digit rank and a "▲12"
    // do not between them push the whole list to the right.
    rankCol: { width: 30, alignItems: 'center' },
    rank: { fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    move: { fontFamily: t.fonts.sans, fontSize: 8, marginTop: 1 },
    moveUp: { color: t.brawl.heading },
    moveDown: { color: t.destructive },
    moveSame: { fontFamily: t.fonts.sans, fontSize: 8, marginTop: 1, color: t.mutedForeground },
    // The plinths have no bottom radius -- they are meant to read as standing
    // on something -- so without the margin the tallest one butts straight
    // into rank 4 and the two look like one shape.
    podium: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      paddingTop: 4,
      marginBottom: 10,
    },
    podiumPlace: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
    podiumArt: { width: 44, height: 44, borderRadius: t.radius.md },
    podiumArtWinner: { width: 56, height: 56 },
    medal: {
      minWidth: 20,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: t.radius.pill,
      backgroundColor: t.brawl.chip,
    },
    medalWinner: { backgroundColor: t.brawl.highlight },
    medalText: { fontFamily: t.fonts.display, fontSize: 10, textAlign: 'center', color: t.brawl.onChip },
    medalTextWinner: { color: t.brawl.onHighlight },
    podiumName: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    podiumScore: { fontFamily: t.fonts.display, fontSize: 12, color: t.brawl.highlight },
    podiumBase: {
      marginTop: 4,
      width: '100%',
      height: 14,
      borderTopLeftRadius: t.radius.sm,
      borderTopRightRadius: t.radius.sm,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: t.border,
    },
    podiumBaseWinner: { height: 26, backgroundColor: t.brawl.chip },
    podiumBaseThird: { height: 9 },
    rankBody: { flex: 1, minWidth: 0 },
    clubRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
    },
    clubBadge: { width: 32, height: 32, borderRadius: t.radius.md },
    clubText: { flex: 1, minWidth: 0 },
    clubName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    clubSub: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    clubScore: { fontFamily: t.fonts.display, fontSize: 13, color: t.brawl.highlight },
    none: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      textAlign: 'center',
      paddingVertical: 12,
      color: t.mutedForeground,
    },
  });
