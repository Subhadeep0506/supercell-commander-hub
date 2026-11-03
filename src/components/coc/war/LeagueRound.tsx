import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { buildRounds, warSides } from '@/lib/cwl';
import { useLeagueWars } from '@/hooks/use-league-wars';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art } from '../CocBits';
import { ClanBadge, EmptyState } from '../clan/ClanBits';
import { useDetailSheet } from '../clan/DetailSheetProvider';
import { StateChip, WarClock, pct } from './WarBits';

/**
 * One league round, as its four matchups.
 *
 * Rendered as a sheet layer, so it refetches nothing: the season and its wars
 * are already in React Query's cache from the screen that pushed this. Every
 * matchup opens the full war board, and every clan opens its profile.
 */
export function LeagueRound({ tag, round }: { tag: string; round: number }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { pushView, openClan } = useDetailSheet();

  const { data: result } = useQuery(gameQuery({ game: 'coc', resource: 'leagueGroup', tag }));
  const group = parsed(result);
  const { warsByTag } = useLeagueWars(group);

  if (!group) return <Text style={s.loading}>Loading the season…</Text>;

  const rounds = buildRounds(group, warsByTag);
  const entry = rounds[round];
  const warTags = entry?.warTags ?? [];

  if (!warTags.length) {
    return (
      <EmptyState
        title="Not drawn yet"
        body="This round's matchups are published when the one before it finishes."
      />
    );
  }

  return (
    <View style={s.stack}>
      {entry ? (
        <View style={s.head}>
          <StateChip state={entry.status} />
          <Text style={s.count}>
            {warTags.length} {warTags.length === 1 ? 'war' : 'wars'}
          </Text>
        </View>
      ) : null}

      {warTags.map((warTag) => {
        const war = warsByTag.get(warTag);
        if (!war) {
          return (
            <Panel key={warTag} style={s.panel}>
              <Text style={s.loadingRow}>Loading war {warTag}…</Text>
            </Panel>
          );
        }
        const { us, them } = warSides(war, tag);
        return (
          <Panel key={warTag} style={s.panel}>
            <View style={s.matchHead}>
              <StateChip state={text(war['state'])} />
              <WarClock war={war} />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${text(us['name'])} versus ${text(them['name'])}`}
              style={s.match}
              onPress={() => pushView({ kind: 'cwlWar', tag: warTag, clanTag: tag })}
            >
              <View style={s.matchSide}>
                <ClanBadge clan={us} size={36} />
                <Text style={s.matchName} numberOfLines={2}>
                  {text(us['name'])}
                </Text>
              </View>

              <View style={s.matchScore}>
                <View style={s.starLine}>
                  <Text style={s.stars}>{text(us['stars'])}</Text>
                  <Art name="star" size={14} />
                  <Text style={s.stars}>{text(them['stars'])}</Text>
                </View>
                <Text style={s.destruction}>
                  {pct(us['destructionPercentage'])} · {pct(them['destructionPercentage'])}
                </Text>
              </View>

              <View style={s.matchSide}>
                <ClanBadge clan={them} size={36} />
                <Text style={s.matchName} numberOfLines={2}>
                  {text(them['name'])}
                </Text>
              </View>
            </Pressable>

            {/* Siblings, never nested: react-native-web's Pressable is
                DOM-backed and bubbles, so a clan button inside the matchup
                button would open the clan *and* push the war. */}
            <View style={s.profiles}>
              {[us, them].map((side, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="link"
                  accessibilityLabel={`View ${text(side['name'])}`}
                  onPress={() => openClan(text(side['tag']))}
                >
                  <Text style={s.profileLink} numberOfLines={1}>
                    {text(side['name'])} ›
                  </Text>
                </Pressable>
              ))}
            </View>
          </Panel>
        );
      })}
    </View>
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
    stack: { gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    count: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    panel: { padding: 12 },
    matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    match: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    matchSide: { flex: 1, minWidth: 0, alignItems: 'center' },
    matchName: {
      marginTop: 6,
      textAlign: 'center',
      fontFamily: t.fonts.display,
      fontSize: 11,
      color: t.foreground,
    },
    matchScore: { alignItems: 'center' },
    starLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    stars: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground },
    destruction: { marginTop: 4, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    profiles: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    profileLink: { fontFamily: t.fonts.display, fontSize: 10, color: t.primary },

    loading: {
      paddingVertical: 48,
      textAlign: 'center',
      fontSize: 13,
      color: t.primary,
      fontFamily: t.fonts.sans,
    },
    loadingRow: { fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
