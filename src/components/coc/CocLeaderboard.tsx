import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { COC_ART, NAV_ART, townHallArt } from '@/assets/art';
import { raidMedalArt } from '@/assets/capital';
import { playerLeagueArt } from '@/assets/leagues';
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
  rankSubtitleParts,
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
import { Source } from './CocBits';
import { ClanBadge } from './clan/ClanBits';
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
        chips={MODES[board].map((m) => ({ id: m.id, label: m.label, icon: scoreIcon(m.id) }))}
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
                <Badge entry={entry} board={board} mode={mode} size={56} theme={theme} />
                <View style={[s.medal, i === 1 && s.medalWinner]}>
                  <Text style={s.medalText}>{text(entry['rank'])}</Text>
                </View>
                <Text style={s.podiumName} numberOfLines={1}>
                  {text(entry['name'])}
                </Text>
                <Subtitle entry={entry} board={board} theme={theme} centred />
                <View style={s.podiumScoreRow}>
                  <Image source={scoreIcon(mode)} style={s.scoreIcon} resizeMode="contain" />
                  <Text style={s.podiumScore}>{rankScore(entry, board, mode)}</Text>
                </View>
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
            <Badge entry={entry} board={board} mode={mode} size={36} theme={theme} />
            <View style={s.rowText}>
              <Text style={s.rowName} numberOfLines={1}>
                {text(entry['name'])}
              </Text>
              <Subtitle entry={entry} board={board} theme={theme} />
            </View>
            <Image source={scoreIcon(mode)} style={s.scoreIcon} resizeMode="contain" />
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

/**
 * Clan badge, player league icon, or Town Hall art -- whichever the row has.
 *
 * Both sources here are remote, and on a network that cannot reach Supercell's
 * CDN RemoteImage renders nothing at all, which is what left this column blank.
 * Every branch therefore carries a bundled fallback: the league badge for the
 * ladder being shown, then the player's Town Hall; clans reuse ClanBadge,
 * which already falls back to bundled art of its own.
 */
function Badge({
  entry,
  board,
  mode,
  size,
  theme,
}: {
  entry: ApiRecord;
  board: Board;
  mode: Mode;
  size: number;
  theme: Theme;
}) {
  const s = useMemo(() => build(theme), [theme]);

  // No `level` -- ranking rows carry no clanLevel, unlike the clan sheet.
  if (board === 'clans') return <ClanBadge clan={entry} size={size} />;

  const hall = townHallArt(entry['townHallLevel']);
  const fallback = playerLeagueArt(entry, mode) ?? hall;
  const uri = leagueUri(entry) ?? badgeUri(entry, board);
  if (uri || fallback) {
    return <RemoteImage uri={uri} fallback={fallback} style={{ width: size, height: size }} />;
  }
  return <View style={[s.badgeFallback, { width: size, height: size }]} />;
}

/**
 * The artwork beside a score, which is a different currency per ladder.
 *
 * Capital uses the Raid Medal, matching the medal the clan sheet already
 * shows against `clanCapitalPoints`.
 */
function scoreIcon(mode: Mode) {
  if (mode === 'builder') return NAV_ART.builder;
  if (mode === 'capital') return raidMedalArt() ?? COC_ART['trophy'];
  return COC_ART['trophy'];
}

/** Secondary line: clan crest and name for players, flag/place/size for clans. */
function Subtitle({
  entry,
  board,
  theme,
  centred = false,
}: {
  entry: ApiRecord;
  board: Board;
  theme: Theme;
  centred?: boolean;
}) {
  const s = useMemo(() => build(theme), [theme]);
  const parts = rankSubtitleParts(entry, board);
  const style = [s.rowSub, centred && s.subCentred];

  if (board === 'clans') {
    const flag = flagEmoji(parts.countryCode);
    return (
      <View style={[s.subRow, centred && s.subRowCentred]}>
        {flag ? <Text style={style}>{flag}</Text> : null}
        {parts.place ? (
          <Text style={style} numberOfLines={1}>
            {parts.place}
          </Text>
        ) : null}
        {parts.members ? (
          <>
            <Image source={NAV_ART.clan} style={s.subIcon} resizeMode="contain" />
            <Text style={style}>{parts.members}</Text>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[s.subRow, centred && s.subRowCentred]}>
      <RemoteImage
        uri={badgeUri(entry, board)}
        fallback={NAV_ART.clan}
        style={s.subIcon}
      />
      <Text style={style} numberOfLines={1}>
        {parts.clanName}
      </Text>
    </View>
  );
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
    podiumScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    podiumScore: { fontFamily: t.fonts.display, fontSize: 14, color: t.cocHighlight },
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
    rowSub: { flexShrink: 1, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    subRowCentred: { justifyContent: 'center' },
    subCentred: { textAlign: 'center' },
    subIcon: { width: 12, height: 12, flexShrink: 0 },
    rowScore: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    scoreIcon: { width: 18, height: 18, flexShrink: 0 },
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
