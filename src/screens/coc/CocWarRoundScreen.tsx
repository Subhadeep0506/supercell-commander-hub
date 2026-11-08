import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { gameQuery } from '@/api/queries';
import { record, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { buildRounds, warSides } from '@/lib/cwl';
import { useLeagueWars } from '@/hooks/use-league-wars';
import { useRefresh } from '@/hooks/use-refresh';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { WarDetail } from '@/components/coc/war/WarDetail';
import { EmptyState } from '@/components/coc/clan/ClanBits';
import { ClanBadge } from '@/components/coc/clan/ClanBits';
import type { RootStackParamList } from '@/navigation/routes';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'CocWarRound'>;

export function CocWarRoundScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const tag = route.params?.tag ?? '';
  const round = Number(route.params?.round ?? 0);
  const [match, setMatch] = useState(0);

  const { data: result } = useQuery({
    ...gameQuery({ game: 'coc', resource: 'leagueGroup', tag }),
    enabled: Boolean(tag),
  });
  const group = parsed(result);
  const { warsByTag } = useLeagueWars(group);

  const warTags = useMemo(
    () => (group ? buildRounds(group, warsByTag)[round]?.warTags ?? [] : []),
    [group, warsByTag, round],
  );

  // Your own clan's war leads the tabs; scouting the rest is secondary.
  const ordered = useMemo(() => {
    const mine = warTags.findIndex((t) => {
      const war = warsByTag.get(t);
      if (!war) return false;
      const a = text(record(war['clan'])['tag']).toUpperCase();
      const b = text(record(war['opponent'])['tag']).toUpperCase();
      return a === tag.toUpperCase() || b === tag.toUpperCase();
    });
    if (mine <= 0) return warTags;
    return [warTags[mine]!, ...warTags.filter((_, i) => i !== mine)];
  }, [warTags, warsByTag, tag]);

  const activeTag = ordered[Math.min(match, ordered.length - 1)];
  const war = activeTag ? warsByTag.get(activeTag) : undefined;
  const { refreshing, onRefresh } = useRefresh();

  return (
    // The one screen that scrolls without going through a game shell, so it
    // wires the gesture itself. It also carries a horizontal match rail below,
    // which is exactly what PullToRefresh's |dy| > |dx| guard is there for.
    <PullToRefresh
      refreshing={refreshing}
      onRefresh={onRefresh}
      style={s.scroll}
      contentContainerStyle={s.shell}
    >
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={s.back}
          onPress={() => navigation.goBack()}
        >
          <Text style={s.backArrow}>←</Text>
        </Pressable>
        <Text style={s.title}>Round {round + 1}</Text>
        {group?.['season'] ? (
          <View style={s.season}>
            <Text style={s.seasonText}>Season: {text(group['season'])}</Text>
          </View>
        ) : null}
      </View>

      {ordered.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.matches}>
          {ordered.map((warTag, i) => {
            const m = warsByTag.get(warTag);
            const label = i === 0 ? 'Your Match' : `Match ${i + 1}`;
            return (
              <Pressable
                key={warTag}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === match }}
                accessibilityLabel={label}
                style={[s.match, i === match && s.matchOn]}
                onPress={() => setMatch(i)}
              >
                {m ? <ClanBadge clan={warSides(m, tag).us} size={16} /> : null}
                <Text style={[s.matchText, i === match && s.matchTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {war ? (
        <WarDetail key={activeTag} war={war} clanTag={tag} />
      ) : warTags.length ? (
        <Text style={s.loading}>Loading the round…</Text>
      ) : (
        <EmptyState
          title="Not drawn yet"
          body="This round's matchups are published when the one before it finishes."
        />
      )}
    </PullToRefresh>
  );
}

function parsed(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    shell: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingTop: 16,
      paddingBottom: 120,
      gap: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backArrow: { fontSize: 24, color: t.cocHighlight },
    title: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 20, color: t.primary },
    season: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
    },
    seasonText: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },

    matches: { gap: 6 },
    match: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    matchOn: { borderBottomColor: t.primary },
    matchText: { fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    matchTextOn: { color: t.primary },

    loading: { paddingVertical: 48, textAlign: 'center', fontSize: 13, color: t.primary, fontFamily: t.fonts.sans },
  });
