import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { townHallArt } from '@/assets/art';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import {
  MODES,
  badgeUri,
  countryLocations,
  flagEmoji,
  leagueUri,
  rankMove,
  rankScore,
  rankSubtitle,
  searchable,
  type Board,
  type Mode,
} from '@/lib/rankings';
import { Button } from '@/components/ui/Button';
import { ChipRow } from '@/components/ui/ChipRow';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { SearchField } from '@/components/ui/SearchField';
import { Sheet } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, Source } from './CocBits';
import { useDetailSheet } from './clan/DetailSheetProvider';

type Place = { id: string; name: string; countryCode?: string };

const GLOBAL: Place = { id: 'global', name: 'Global' };

/**
 * Global and per-country rankings for players and clans.
 *
 * Every filter maps onto a real Supercell endpoint -- `board` and `mode`
 * select the ladder, `locationId` the region -- so nothing here is derived or
 * estimated. The up/down movement comes from `previousRank`, which the API
 * returns alongside `rank`.
 */
export function CocLeaderboard() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { openClan } = useDetailSheet();
  const s = useMemo(() => build(theme), [theme]);

  const [board, setBoard] = useState<Board>('players');
  const [mode, setMode] = useState<Mode>('home');
  const [location, setLocation] = useState<Place>(GLOBAL);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');

  const {
    data: result,
    refetch,
    isFetching,
  } = useQuery(
    gameQuery({ game: 'coc', resource: 'leaderboard', board, mode, locationId: location.id }),
  );

  // Only fetched once the picker is opened -- 300 locations are not needed to
  // render the default Global board.
  const locations = useQuery({
    ...gameQuery({ game: 'coc', resource: 'locations' }),
    enabled: picking,
  });

  const entries = result?.ok ? rows(record(JSON.parse(result.data))['items']) : [];
  const filtered = entries.filter((e) => searchable(e, board).includes(query.toLowerCase()));
  const listed = filtered.filter((e) => query || Number(e['rank']) > 3);
  const podium = !query && entries.length >= 3 ? [entries[1], entries[0], entries[2]] : [];

  const open = (entry: ApiRecord) => {
    const tag = text(entry['tag']);
    if (tag === '—') return;
    // A clan opens its profile sheet over the ladder; a player still navigates,
    // because the village profile is a screen of its own.
    if (board === 'clans') openClan(tag);
    else navigation.navigate('CocHome', { tag });
  };

  const countries = locations.data?.ok
    ? countryLocations(JSON.parse(locations.data.data)).filter((l) =>
        text(l['name']).toLowerCase().includes(locationQuery.toLowerCase()),
      )
    : [];

  function pickBoard(next: Board) {
    setBoard(next);
    // Capital has no player ladder, so leaving it selected would 400.
    if (next === 'players' && mode === 'capital') setMode('home');
  }

  return (
    <View style={s.stack}>
      <Tabs
        value={board}
        onChange={pickBoard}
        tabs={[
          { id: 'players', label: 'Players' },
          { id: 'clans', label: 'Clans' },
        ]}
      />

      <View style={s.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose location"
          style={s.location}
          onPress={() => setPicking(true)}
        >
          <Text style={s.locationFlag}>
            {location.id === 'global' ? '🌐' : (flagEmoji(location.countryCode) ?? '📍')}
          </Text>
          <Text style={s.locationName} numberOfLines={1}>
            {location.name.toUpperCase()}
          </Text>
          <Text style={s.chevron}>▾</Text>
        </Pressable>
        <Button variant="outline" size="sm" disabled={isFetching} onPress={() => void refetch()}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </View>

      <ChipRow
        accessibilityLabel="Ranking type"
        value={mode}
        onChange={(id) => setMode(id as Mode)}
        chips={MODES[board].map((m) => ({ id: m.id, label: m.label }))}
      />

      <SearchField
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search rankings"
        placeholder="Search name or tag"
      />

      {isFetching && !result ? <Text style={s.loading}>Loading rankings…</Text> : null}

      {podium.length ? (
        <View style={s.podium}>
          {podium.map((entry, i) =>
            entry ? (
              <Pressable
                key={text(entry['tag'])}
                accessibilityRole="link"
                accessibilityLabel={`View ${text(entry['name'])}`}
                style={s.podiumPlace}
                onPress={() => open(entry)}
              >
                <Badge entry={entry} board={board} size={56} theme={theme} />
                <View style={[s.medal, i === 1 && s.medalWinner]}>
                  <Text style={s.medalText}>{text(entry['rank'])}</Text>
                </View>
                <Text style={s.podiumName} numberOfLines={1}>
                  {text(entry['name'])}
                </Text>
                <Text style={s.podiumSub} numberOfLines={1}>
                  {rankSubtitle(entry, board)}
                </Text>
                <Text style={s.podiumScore}>{rankScore(entry, board, mode)}</Text>
                <Move entry={entry} theme={theme} />
                <View
                  style={[s.podiumBase, i === 1 ? s.podiumBaseWinner : i === 2 && s.podiumBaseThird]}
                />
              </Pressable>
            ) : null,
          )}
        </View>
      ) : null}

      <View style={s.list}>
        {listed.map((entry, i) => (
          <Pressable
            key={i}
            accessibilityRole="link"
            accessibilityLabel={`View ${text(entry['name'])}`}
            style={s.row}
            onPress={() => open(entry)}
          >
            <View style={s.rankCell}>
              <Text style={s.rank}>{text(entry['rank'])}</Text>
              <Move entry={entry} theme={theme} compact />
            </View>
            <Badge entry={entry} board={board} size={36} theme={theme} />
            <View style={s.rowText}>
              <Text style={s.rowName} numberOfLines={1}>
                {text(entry['name'])}
              </Text>
              <Text style={s.rowSub} numberOfLines={1}>
                {board === 'clans'
                  ? `${flagEmoji(record(entry['location'])['countryCode']) ?? ''} ${rankSubtitle(entry, board)}`.trim()
                  : rankSubtitle(entry, board)}
              </Text>
            </View>
            <Art name="trophy" size={18} />
            <Text style={s.rowScore}>{rankScore(entry, board, mode)}</Text>
          </Pressable>
        ))}
      </View>

      {result?.ok && !filtered.length ? (
        <Text style={s.empty}>
          {entries.length ? 'No matching entries.' : 'No rankings returned by the game service.'}
        </Text>
      ) : null}

      {result ? <Source result={result} /> : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Choose location">
        <View style={s.pickerHeader}>
          <SearchField
            value={locationQuery}
            onChangeText={setLocationQuery}
            accessibilityLabel="Search locations"
            placeholder="Search country"
          />
        </View>
        <ScrollView contentContainerStyle={s.pickerList}>
          {[
            GLOBAL,
            ...countries.map<Place>((l) => ({
              id: String(l['id']),
              name: text(l['name']),
              countryCode: typeof l['countryCode'] === 'string' ? l['countryCode'] : undefined,
            })),
          ].map((place) => {
            const { id, name } = place;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={name}
                style={[s.pickerRow, id === location.id && s.pickerRowOn]}
                onPress={() => {
                  setLocation(place);
                  setPicking(false);
                  setLocationQuery('');
                }}
              >
                <Text style={s.pickerFlag}>
                  {id === 'global' ? '🌐' : (flagEmoji(place.countryCode) ?? '📍')}
                </Text>
                <Text style={s.pickerName}>{name}</Text>
              </Pressable>
            );
          })}
          {locations.isFetching ? <Text style={s.loading}>Loading locations…</Text> : null}
          {locations.data && !locations.data.ok ? <Source result={locations.data} /> : null}
        </ScrollView>
      </Sheet>
    </View>
  );
}

/** Clan badge, player league icon, or Town Hall art -- whichever the row has. */
function Badge({
  entry,
  board,
  size,
  theme,
}: {
  entry: ApiRecord;
  board: Board;
  size: number;
  theme: Theme;
}) {
  const s = useMemo(() => build(theme), [theme]);
  const uri = board === 'clans' ? badgeUri(entry, board) : (leagueUri(entry) ?? badgeUri(entry, board));
  const hall = board === 'players' ? townHallArt(entry['townHallLevel']) : undefined;
  if (uri) {
    return (
      <RemoteImage uri={uri} fallback={hall} style={{ width: size, height: size }} />
    );
  }
  if (hall) return <Image source={hall} style={{ width: size, height: size }} resizeMode="contain" />;
  return <View style={[s.badgeFallback, { width: size, height: size }]} />;
}

/** Up/down movement since the last ranking period, from `previousRank`. */
function Move({
  entry,
  theme,
  compact = false,
}: {
  entry: ApiRecord;
  theme: Theme;
  compact?: boolean;
}) {
  const s = useMemo(() => build(theme), [theme]);
  const move = rankMove(entry);
  if (!move || move.direction === 'same') return null;
  const up = move.direction === 'up';
  return (
    <Text style={[compact ? s.moveCompact : s.move, up ? s.moveUp : s.moveDown]}>
      {up ? '▲' : '▼'} {move.places}
    </Text>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 14 },
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    location: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 999,
      backgroundColor: t.card,
    },
    locationFlag: { fontSize: 16 },
    locationName: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    chevron: { marginLeft: 'auto', color: t.primary, fontSize: 12 },

    loading: { paddingVertical: 24, textAlign: 'center', fontSize: 13, color: t.primary, fontFamily: t.fonts.sans },
    empty: { paddingVertical: 32, textAlign: 'center', fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },

    podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10 },
    podiumPlace: { flex: 1, minWidth: 0, alignItems: 'center' },
    medal: {
      width: 25,
      height: 25,
      marginTop: -6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: t.muted,
    },
    medalWinner: { backgroundColor: t.cocHighlight },
    medalText: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    podiumName: { marginTop: 10, width: '100%', textAlign: 'center', fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    podiumSub: { marginTop: 3, width: '100%', textAlign: 'center', fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    podiumScore: { marginTop: 6, fontFamily: t.fonts.display, fontSize: 14, color: t.cocHighlight },
    podiumBase: {
      width: '100%',
      height: 27,
      marginTop: 10,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      backgroundColor: t.muted,
      borderTopWidth: 2,
      borderTopColor: t.border,
    },
    podiumBaseWinner: { height: 48, backgroundColor: t.cocHighlight },
    podiumBaseThird: { backgroundColor: t.destructive, opacity: 0.35 },

    list: { gap: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 62,
      paddingVertical: 10,
      paddingHorizontal: 10,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
    },
    rankCell: { width: 34, alignItems: 'center' },
    rank: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    rowSub: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    rowScore: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    badgeFallback: { backgroundColor: t.muted, borderRadius: 6 },

    move: { marginTop: 4, fontSize: 11, fontFamily: t.fonts.display },
    moveCompact: { marginTop: 2, fontSize: 9, fontFamily: t.fonts.display },
    moveUp: { color: t.success },
    moveDown: { color: t.destructive },

    pickerHeader: { padding: 12, paddingBottom: 0 },
    pickerList: { padding: 12, gap: 6 },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: t.muted,
    },
    pickerRowOn: { backgroundColor: t.primary },
    pickerFlag: { fontSize: 16 },
    pickerName: { flexShrink: 1, fontFamily: t.fonts.sans, fontSize: 13, color: t.foreground },
  });
