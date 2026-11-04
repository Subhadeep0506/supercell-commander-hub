import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { townHallArt } from '@/assets/art';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { MEMBER_SORTS, memberMatches, roleLabel, sortMembers, type MemberSort } from '@/lib/clan';
import { leagueUri, rankMove } from '@/lib/rankings';
import { ChipRow } from '@/components/ui/ChipRow';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { SearchField } from '@/components/ui/SearchField';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';

/**
 * The clan roster.
 *
 * Stays a vertical list: these rows are read top-to-bottom against a rank, and
 * the horizontal treatment the artwork grids use would make the ordering
 * meaningless.
 *
 * All five orderings sort the `memberList` already in hand, so switching
 * between them costs nothing. `builderBaseTrophies` is absent on older
 * responses, which sorts those members to the bottom rather than erroring.
 */
export function ClanMembers({ clan }: { clan: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const [sort, setSort] = useState<MemberSort>('rank');
  const [query, setQuery] = useState('');

  const members = rows(clan['memberList']);
  const sorted = useMemo(
    () => sortMembers(members.filter((m) => memberMatches(m, query)), sort),
    [members, query, sort],
  );
  const paged = usePaged(sorted, `${sort}:${query}`);

  return (
    <View>
      <View style={s.head}>
        <Text style={s.title}>Members</Text>
        <Text style={s.count}>
          {text(clan['members'] ?? members.length)}/50
        </Text>
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search members"
        placeholder="Search name or tag"
      />

      <ChipRow
        accessibilityLabel="Sort members"
        value={sort}
        onChange={(id) => setSort(id as MemberSort)}
        chips={MEMBER_SORTS.map((m) => ({ id: m.id, label: m.label }))}
      />

      <View style={s.list}>
        {paged.shown.map((member, i) => {
          const hall = townHallArt(member['townHallLevel']);
          // previousClanRank is absent for a member who has not been ranked
          // yet, which reads as "no movement" rather than a fall to zero.
          const move = rankMove({
            rank: member['clanRank'],
            previousRank: member['previousClanRank'],
          });
          const up = move?.direction === 'up';

          return (
            <Pressable
              key={text(member['tag']) + i}
              accessibilityRole="link"
              accessibilityLabel={`View ${text(member['name'])}`}
              style={s.row}
              // Pushes onto the sheet's stack rather than closing it, so the
              // clan you came from is one back press away.
              onPress={() => openPlayer(text(member['tag']))}
            >
              <View style={s.rankCell}>
                <Text style={s.rank}>{text(member['clanRank'] ?? i + 1)}</Text>
                {move && move.direction !== 'same' ? (
                  <Text style={[s.move, up ? s.moveUp : s.moveDown]}>
                    {up ? '▲' : '▼'} {move.places}
                  </Text>
                ) : null}
              </View>

              <View style={s.artCell}>
                {hall ? <Image source={hall} style={s.hall} resizeMode="contain" /> : null}
                <RemoteImage
                  uri={leagueUri(member)}
                  style={s.league}
                  accessibilityLabel={text(record(member['league'])['name'])}
                />
              </View>

              <View style={s.textCell}>
                <Text style={s.name} numberOfLines={1}>
                  {text(member['name'])}
                </Text>
                <Text style={s.role} numberOfLines={1}>
                  {roleLabel(member['role'])}
                </Text>
              </View>

              <View style={s.scoreCell}>
                <Text style={s.trophies}>
                  🏆 {text(sort === 'builder' ? member['builderBaseTrophies'] : member['trophies'])}
                </Text>
                <Text style={s.donations}>
                  <Text style={s.up}>↑ {text(member['donations'])}</Text>{' '}
                  <Text style={s.down}>↓ {text(member['donationsReceived'])}</Text>
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        noun="members"
        style={s.more}
      />

      {sorted.length === 0 ? <Text style={s.empty}>No members match that search.</Text> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    title: { fontFamily: t.fonts.display, fontSize: 17, color: t.foreground },
    count: { fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },

    list: { gap: 8 },
    more: { marginTop: 12, alignSelf: 'flex-start' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 62,
      paddingVertical: 10,
      paddingHorizontal: 10,
      backgroundColor: t.muted,
      borderRadius: 8,
    },
    rankCell: { width: 26, alignItems: 'center' },
    rank: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    move: { marginTop: 2, fontSize: 9, fontFamily: t.fonts.display },
    moveUp: { color: t.success },
    moveDown: { color: t.destructive },

    artCell: { width: 42, height: 42 },
    hall: { width: 42, height: 42 },
    // The league badge sits in the corner of the Town Hall art, as in game.
    league: { position: 'absolute', bottom: -2, left: -4, width: 20, height: 20 },

    textCell: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    role: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    scoreCell: { alignItems: 'flex-end' },
    trophies: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    donations: { marginTop: 3, fontSize: 10, fontFamily: t.fonts.sans },
    up: { color: t.success },
    down: { color: t.mutedForeground },

    empty: {
      paddingVertical: 28,
      textAlign: 'center',
      fontSize: 13,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
    },
  });
