import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { countryLocations, flagEmoji, rankMove } from '@/lib/rankings';
import { groupLadders, seasonIds } from '@/lib/royale-ladders';
import { ChipRow, type Chip } from '@/components/ui/ChipRow';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { SearchField } from '@/components/ui/SearchField';
import { Sheet } from '@/components/ui/Sheet';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { CR_ICONS, clanBadgeArt, type CrIconName } from '@/assets/royale';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  CrEmpty,
  CrIcon,
  CrList,
  CrLoading,
  PlayerPortrait,
  Podium,
  RankRow,
  Section,
  Source,
  modeIcon,
  num,
} from './CrBits';

/**
 * Clash Royale rankings.
 *
 * The Players side is *not* the Clash of Clans shape. Royale's trophy ladder
 * is gone -- `/v1/locations/{country}/rankings/players` 404s and the global
 * one answers 200 with an empty list -- so the player ladders are Path of
 * Legend and the mode ladders behind `/v1/leaderboards`. The request schema
 * refuses the dead one outright; see game-api.ts.
 */

type Side = 'players' | 'clans';

const SIDES: Tab<Side>[] = [
  { id: 'players', label: 'Players' },
  { id: 'clans', label: 'Clans' },
];

export function CrLeaderboard() {
  const [side, setSide] = useState<Side>('players');
  return (
    <View>
      <Tabs tabs={SIDES} value={side} onChange={setSide} />
      {side === 'players' ? <PlayerLadders /> : <ClanLadders />}
    </View>
  );
}

const PATH_OF_LEGEND = 'pol';
const OTHER = 'other';

/**
 * The portrait of a ranked player, fetched one profile at a time.
 *
 * Royale's ranking rows carry no league, arena or trophy field -- Path of
 * Legend returns `{tag, name, expLevel, eloRating, rank}` and nothing more --
 * so there is no art in the response to show. It has to come from the player's
 * own profile, which is why this is only ever used for the three podium places:
 * three extra requests buys real art for the rows that carry the screen, and
 * the fifty below it stay free.
 *
 * react-query dedupes against the profile sheet's own fetch, so tapping through
 * to one of these three costs nothing.
 *
 * The fallback is the Path of Legend emblem rather than the shared king: on a
 * board that is entirely ranked players it is the one thing true of every row,
 * and it does not claim an arena the account may not be in.
 */
function PodiumArt({ tag, size = 54 }: { tag: string; size?: number }) {
  const { data } = useQuery({
    ...gameQuery({ game: 'cr', resource: 'player', tag }),
    enabled: Boolean(tag),
  });
  const player = data?.ok ? record(JSON.parse(data.data)) : null;
  return <PlayerPortrait player={player} size={size} fallback="pathOfLegend" />;
}

/** Bundled art, or the generic icon when the lookup misses. */
function Crest({ art, size, fallback }: { art?: ImageSourcePropType; size: number; fallback: CrIconName }) {
  if (!art) return <CrIcon name={fallback} size={size} />;
  return (
    <Image
      source={art}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

function PlayerLadders() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();

  const boards = useQuery(gameQuery({ game: 'cr', resource: 'leaderboards' }));
  const seasons = useQuery(gameQuery({ game: 'cr', resource: 'seasons' }));

  const { named, unnamed } = useMemo(
    () => (boards.data?.ok ? groupLadders(JSON.parse(boards.data.data)) : { named: [], unnamed: [] }),
    [boards.data],
  );
  const seasonList = useMemo(
    () => (seasons.data?.ok ? seasonIds(JSON.parse(seasons.data.data)) : []),
    [seasons.data],
  );

  const [choice, setChoice] = useState<string>(PATH_OF_LEGEND);
  const [other, setOther] = useState<string>('');
  const [season, setSeason] = useState<string>('');

  const activeSeason = season || seasonList[0] || '';
  const ladderId = choice === OTHER ? other || unnamed[0]?.id || '' : choice;
  const isPol = choice === PATH_OF_LEGEND;

  const pol = useQuery({
    ...gameQuery({ game: 'cr', resource: 'pathOfLegend', season: activeSeason, limit: 50 }),
    enabled: isPol && Boolean(activeSeason),
  });
  const ladder = useQuery({
    ...gameQuery({ game: 'cr', resource: 'leaderboardRankings', leaderboardId: ladderId, limit: 50 }),
    enabled: !isPol && Boolean(ladderId),
  });

  const chips: Chip[] = [
    { id: PATH_OF_LEGEND, label: 'Path of Legend', icon: CR_ICONS.ranked },
    ...named.map((l) => ({
      id: l.id,
      label: l.name,
      icon: modeIcon(l.name),
      // Several ladders have many seasons; the count says so without listing
      // six near-identical rows.
      count: l.seasons.length > 1 ? l.seasons.length : undefined,
    })),
    ...(unnamed.length
      ? [{ id: OTHER, label: 'Other ladders', count: unnamed.length, icon: CR_ICONS.shop }]
      : []),
  ];

  const active = isPol ? pol : ladder;
  // Memoised because the paged tail below depends on it: re-parsing the body on
  // every render would hand `usePaged` a new array each time.
  const items = useMemo(
    () => (active.data?.ok ? rows(record(JSON.parse(active.data.data))['items']) : []),
    [active.data],
  );

  // The podium takes the first three, so only the tail is paged. Changing
  // ladder or season collapses it back to one page.
  const tail = useMemo(() => items.slice(items.length >= 3 ? 3 : 0), [items]);
  const paged = usePaged(tail, `${choice}:${other}:${activeSeason}`);

  if (boards.isFetching && !named.length && !unnamed.length) {
    return <CrLoading label="Loading ladders…" />;
  }

  return (
    <View>
      <ChipRow chips={chips} value={choice} onChange={setChoice} accessibilityLabel="Choose a ladder" />

      {isPol && seasonList.length > 0 && (
        <>
          <ChipRow
            chips={seasonList.slice(0, 24).map((id) => ({ id, label: id }))}
            value={activeSeason}
            onChange={setSeason}
            accessibilityLabel="Choose a season"
          />
          <Text style={s.note}>
            Finished seasons only — the current season returns nothing until it closes.
          </Text>
        </>
      )}

      {choice === OTHER && unnamed.length > 0 && (
        <>
          <ChipRow
            chips={unnamed.map((l) => ({ id: l.id, label: l.name }))}
            value={other || unnamed[0]!.id}
            onChange={setOther}
            accessibilityLabel="Choose a ladder"
          />
          <Text style={s.note}>
            These ladders return rankings but no name, so they are listed by id.
          </Text>
        </>
      )}

      {active.isFetching && !items.length && <CrLoading label="Loading rankings…" />}
      {!active.isFetching && !items.length && (
        <CrEmpty title="No rankings" body="The service returned no players for this ladder." />
      )}

      {items.length > 0 && (
        <Section title={isPol ? `Path of Legend · ${activeSeason}` : 'Rankings'} count={items.length}>
          <Podium
            icon={isPol ? 'ranked' : 'trophy'}
            places={items.slice(0, 3).map((entry, i) => ({
              key: text(entry['tag']) + i,
              rank: Number(entry['rank'] ?? i + 1),
              art: <PodiumArt tag={text(entry['tag'])} />,
              name: text(entry['name']),
              subtitle: podiumSubtitle(entry),
              score: playerScore(entry),
              onPress: () => openPlayer(text(entry['tag']), 'cr'),
            }))}
          />
          <CrList>
            {paged.shown.map((entry, i) => {
              const rank = Number(entry['rank'] ?? i + 4);
              return (
                <RankRow
                  key={text(entry['tag']) + i}
                  rank={num(rank)}
                  /*
                    The clan crest, where the ladder carries one. Path of
                    Legend returns no clan either, so those rows get the Path
                    of Legend emblem -- the one piece of art that is true of
                    every player on that board.
                  */
                  art={isPol ? CR_ICONS.pathOfLegend : clanBadgeArt(record(entry['clan'])['badgeId'])}
                  title={text(entry['name'])}
                  subtitle={playerSubtitle(entry)}
                  score={playerScore(entry)}
                  icon={isPol ? 'ranked' : 'trophy'}
                  onPress={() => openPlayer(text(entry['tag']), 'cr')}
                />
              );
            })}
          </CrList>
          <LoadMore
            remaining={paged.remaining}
            onPress={paged.loadMore}
            noun="players"
            style={s.more}
          />
        </Section>
      )}

      {active.data && !active.data.ok ? <Source result={active.data} /> : null}
    </View>
  );
}

function playerSubtitle(entry: ApiRecord): string {
  const clan = text(record(entry['clan'])['name']);
  const level = entry['expLevel'] != null ? `XP ${text(entry['expLevel'])}` : '';
  return [clan !== '—' ? clan : '', level, text(entry['tag'])].filter(Boolean).join(' · ');
}

/** Shorter than the list subtitle -- a podium column is a third of the width. */
function podiumSubtitle(entry: ApiRecord): string {
  const clan = text(record(entry['clan'])['name']);
  if (clan !== '—') return clan;
  return entry['expLevel'] != null ? `XP ${text(entry['expLevel'])}` : text(entry['tag']);
}

/**
 * The figure a player ladder ranks by, which is a different field per board.
 *
 * Path of Legend ranks on `eloRating`; the mode leaderboards on `score`. The
 * trophy fallback is for a board that returns neither, which none currently
 * does, but the dead trophy ladder did.
 */
function playerScore(entry: ApiRecord): unknown {
  return entry['eloRating'] ?? entry['score'] ?? entry['trophies'];
}

/** Flag and member count, short enough for a third-of-a-row podium column. */
function clanSubtitle(entry: ApiRecord): string {
  const location = record(entry['location']);
  const flag = flagEmoji(location['countryCode']);
  const place = text(location['name']);
  return [flag, place !== '—' ? place : '', `${num(entry['members'])}/50`]
    .filter(Boolean)
    .join(' ');
}

type ClanMode = 'home' | 'war';

const CLAN_MODES: Chip[] = [
  { id: 'home', label: 'Clan score' },
  { id: 'war', label: 'Clan wars' },
];

type Place = { id: string | number; name: string; countryCode?: string };
const GLOBAL: Place = { id: 'global', name: 'Global' };

function ClanLadders() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();
  const [mode, setMode] = useState<ClanMode>('home');
  const [place, setPlace] = useState<Place>(GLOBAL);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const board = useQuery(
    gameQuery({
      game: 'cr',
      resource: 'leaderboard',
      board: 'clans',
      mode,
      locationId: place.id,
      limit: 50,
    }),
  );

  // 262 locations are not worth fetching until the picker is opened.
  const locations = useQuery({
    ...gameQuery({ game: 'cr', resource: 'locations' }),
    enabled: picking,
  });

  const items = useMemo(
    () => (board.data?.ok ? rows(record(JSON.parse(board.data.data))['items']) : []),
    [board.data],
  );
  const tail = useMemo(() => items.slice(items.length >= 3 ? 3 : 0), [items]);
  const paged = usePaged(tail, `${mode}:${place.id}`);

  const countries = locations.data?.ok
    ? countryLocations(JSON.parse(locations.data.data)).filter((l) =>
        text(l['name']).toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  return (
    <View>
      <ChipRow
        chips={CLAN_MODES}
        value={mode}
        onChange={(id) => setMode(id as ClanMode)}
        accessibilityLabel="Choose a clan ladder"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose location"
        style={s.location}
        onPress={() => setPicking(true)}
      >
        {place.id === 'global' ? (
          <CrIcon name="globe" size={18} />
        ) : (
          <Text style={s.locationFlag}>{flagEmoji(place.countryCode) ?? '📍'}</Text>
        )}
        <Text style={s.locationName} numberOfLines={1}>
          {place.name.toUpperCase()}
        </Text>
        <Text style={s.locationChevron}>▾</Text>
      </Pressable>

      {board.isFetching && !items.length && <CrLoading label="Loading rankings…" />}
      {!board.isFetching && !items.length && (
        <CrEmpty title="No rankings" body="The service returned no clans for this list." />
      )}

      {items.length > 0 && (
        <Section title="Rankings" count={items.length}>
          {/*
            Clans need no extra request: the ladder returns `badgeId`, and
            every one of the 180 crests is bundled.
          */}
          <Podium
            icon="trophy"
            places={items.slice(0, 3).map((entry, i) => ({
              key: text(entry['tag']) + i,
              rank: Number(entry['rank'] ?? i + 1),
              art: <Crest art={clanBadgeArt(entry['badgeId'])} size={54} fallback="clan" />,
              name: text(entry['name']),
              subtitle: clanSubtitle(entry),
              score: entry['clanScore'],
              onPress: () => openClan(text(entry['tag']), 'cr'),
            }))}
          />
          <CrList>
            {paged.shown.map((entry, i) => {
              const move = rankMove(entry);
              return (
                <RankRow
                  key={text(entry['tag']) + i}
                  art={clanBadgeArt(entry['badgeId'])}
                  rank={
                    <Text style={s.rankCell}>
                      {num(entry['rank'] ?? i + 4)}
                      {move && move.direction !== 'same' ? (
                        <Text style={move.direction === 'up' ? s.up : s.down}>
                          {move.direction === 'up' ? ' ▲' : ' ▼'}
                        </Text>
                      ) : null}
                    </Text>
                  }
                  title={text(entry['name'])}
                  subtitle={`${num(entry['members'])}/50 members · ${text(
                    record(entry['location'])['name'],
                  )}`}
                  score={entry['clanScore']}
                  onPress={() => openClan(text(entry['tag']), 'cr')}
                />
              );
            })}
          </CrList>
          <LoadMore
            remaining={paged.remaining}
            onPress={paged.loadMore}
            noun="clans"
            style={s.more}
          />
        </Section>
      )}

      {board.data && !board.data.ok ? <Source result={board.data} /> : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Choose location">
        <View style={s.picker}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search locations…"
            accessibilityLabel="Search locations"
          />
          <Pressable
            style={[s.pickerRow, place.id === 'global' && s.pickerRowOn]}
            onPress={() => {
              setPlace(GLOBAL);
              setPicking(false);
            }}
          >
            <CrIcon name="globe" size={18} />
            <Text style={s.pickerName}>Global</Text>
          </Pressable>
          {countries.map((l) => {
            const id = Number(l['id']);
            return (
              <Pressable
                key={id}
                style={[s.pickerRow, place.id === id && s.pickerRowOn]}
                onPress={() => {
                  setPlace({
                    id,
                    name: text(l['name']),
                    countryCode: text(l['countryCode']),
                  });
                  setPicking(false);
                }}
              >
                <Text style={s.pickerFlag}>{flagEmoji(l['countryCode']) ?? '📍'}</Text>
                <Text style={s.pickerName} numberOfLines={1}>
                  {text(l['name'])}
                </Text>
              </Pressable>
            );
          })}
          {locations.isFetching && <CrLoading label="Loading locations…" />}
        </View>
      </Sheet>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    note: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 16,
      marginBottom: 10,
      color: t.mutedForeground,
    },
    location: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginBottom: 8,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
    },
    locationFlag: { fontSize: 16 },
    locationName: { flex: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.cardForeground },
    locationChevron: { fontFamily: t.fonts.symbol, fontSize: 14, color: t.mutedForeground },
    rankCell: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    up: { color: t.success },
    down: { color: t.destructive },
    more: { marginTop: 12, alignSelf: 'flex-start' },

    picker: { padding: 12, gap: 6 },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: t.radius.sm,
    },
    pickerRowOn: { backgroundColor: t.muted },
    pickerFlag: { fontSize: 16 },
    pickerName: { flex: 1, fontFamily: t.fonts.sans, fontSize: 13, color: t.foreground },
  });
