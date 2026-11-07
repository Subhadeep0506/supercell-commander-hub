import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { text, type ApiRecord } from '@/api/game-api';
import { WIN_BONUS_STARS, leagueRule, standings } from '@/lib/cwl';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art } from '../CocBits';
import { ClanBadge } from '../clan/ClanBits';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { pct } from './WarBits';

/**
 * The league table.
 *
 * Stars include the 10 awarded for winning a war, which is how the in-game
 * table is built -- a clan can lead on raw stars and still sit second. Wars
 * being fought right now count too, so the order moves during battle day.
 *
 * The promotion and demotion lines are the one thing here the API does not
 * supply; see the note on `leagueRule` in lib/cwl.ts.
 */
export function LeagueStandings({
  group,
  warsByTag,
  leagueName,
  myTag,
  loading,
  loaded,
  expected,
}: {
  group: ApiRecord;
  warsByTag: Map<string, ApiRecord>;
  leagueName?: string;
  myTag?: string;
  loading: boolean;
  loaded: number;
  expected: number;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();

  const table = standings(group, warsByTag);
  const rule = leagueRule(leagueName);
  const mine = myTag?.toUpperCase();
  const played = table.some((row) => row.warsCounted > 0);
  const cuts = cutRows(table.length, rule);

  return (
    <Panel style={s.panel}>
      <View style={s.head}>
        <Text style={s.title}>Standings</Text>
        <Text style={s.progress}>
          {loading && loaded < expected ? `${loaded}/${expected} wars…` : `${expected} wars`}
        </Text>
      </View>

      {!played && !loading ? (
        <Text style={s.pending}>
          No war has been fought yet. The table fills in from the first battle day.
        </Text>
      ) : null}

      {table.map((row, i) => {
        const promoted = i < rule.promote;
        const relegated = i >= table.length - rule.demote;
        const own = mine && row.tag === mine;
        return (
          <View key={row.tag}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${text(row.clan['name'])}`}
              style={[s.row, own && s.rowOwn]}
              onPress={() => openClan(row.tag, 'coc')}
            >
              <Text style={[s.rank, promoted && s.rankUp, relegated && s.rankDown]}>{i + 1}</Text>
              <ClanBadge clan={row.clan} size={30} />
              <View style={s.rowText}>
                <Text style={[s.name, own && s.nameOwn]} numberOfLines={1}>
                  {text(row.clan['name'])}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  {row.warsCounted} {row.warsCounted === 1 ? 'war' : 'wars'} · {row.wins}{' '}
                  {row.wins === 1 ? 'win' : 'wins'}
                </Text>
              </View>
              <View style={s.scoreCell}>
                <View style={s.starLine}>
                  <Text style={s.stars}>{row.stars}</Text>
                  <Art name="star" size={13} />
                </View>
                <Text style={s.destruction}>{pct(row.destruction)}</Text>
              </View>
            </Pressable>

            {/* Drawn between rows so each line sits exactly where the cut
                falls. `cuts` has already resolved the two against each other,
                so a short table cannot draw both in the same gap. */}
            <Cut show={i === cuts.promote} label="Promotion" tone="up" />
            <Cut show={i === cuts.demote} label="Relegation" tone="down" />
          </View>
        );
      })}

      <Text style={s.footnote}>Includes the {WIN_BONUS_STARS}-star win bonus.</Text>
    </Panel>
  );
}

/**
 * Which row each line is drawn *after*, or -1 for a line that cannot be drawn.
 *
 * A league group is eight clans, so the two cuts never meet in practice -- but
 * the group is whatever the API sends, and a four-clan group with 2 up and 2
 * down would otherwise stack both rules in the same gap and read as one.
 */
function cutRows(size: number, rule: { promote: number; demote: number }) {
  const promote = rule.promote > 0 && rule.promote < size ? rule.promote - 1 : -1;
  const demote = rule.demote > 0 && rule.demote < size ? size - rule.demote - 1 : -1;
  return { promote, demote: demote === promote ? -1 : demote };
}

/** The rule marking where a cut falls. */
function Cut({ show, label, tone }: { show: boolean; label: string; tone: 'up' | 'down' }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (!show) return null;
  return (
    <View style={s.cut} accessibilityLabel={`${label} line`}>
      <View style={[s.cutRule, tone === 'up' ? s.cutRuleUp : s.cutRuleDown]} />
      <Text style={[s.cutLabel, tone === 'up' ? s.cutLabelUp : s.cutLabelDown]}>{label}</Text>
      <View style={[s.cutRule, tone === 'up' ? s.cutRuleUp : s.cutRuleDown]} />
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    panel: { padding: 12 },
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    title: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    progress: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    pending: { marginTop: 10, fontSize: 12, lineHeight: 18, color: t.mutedForeground, fontFamily: t.fonts.sans },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    rowOwn: { borderColor: t.cocHighlight, backgroundColor: `${t.cocHighlight}1A` },
    rank: { width: 18, textAlign: 'center', fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    rankUp: { color: t.success },
    rankDown: { color: t.destructive },
    rowText: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    nameOwn: { color: t.cocHighlight },
    meta: { marginTop: 2, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    scoreCell: { alignItems: 'flex-end' },
    starLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stars: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    destruction: { marginTop: 2, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    cut: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    cutRule: { flex: 1, height: 1 },
    cutRuleUp: { backgroundColor: t.success },
    cutRuleDown: { backgroundColor: t.destructive },
    cutLabel: { fontFamily: t.fonts.display, fontSize: 9 },
    cutLabelUp: { color: t.success },
    cutLabelDown: { color: t.destructive },

    footnote: {
      marginTop: 12,
      fontSize: 10,
      lineHeight: 15,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
    },
  });
