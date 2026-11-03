import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { COC_ART, NAV_ART, UI_ART, resourceArt } from '@/assets/art';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { groupedNumber, shortDate, timeAgo } from '@/lib/clan';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, Source } from '../CocBits';
import { ClanBadge, EmptyState } from './ClanBits';
import { useDetailSheet } from './DetailSheetProvider';

const PAGE = 10;

/**
 * Recent clan wars.
 *
 * A clan can keep its war log private, and many competitive ones do. The API
 * answers 403 for those -- a deliberate setting rather than a fault -- so it
 * gets its own explanation instead of the generic service-error panel.
 *
 * Each row collapses to a result line and expands to the full picture. Note
 * that the war log's `opponent` object carries no `attacks` and no
 * `expEarned`; only `clan` does. Those two are therefore labelled as this
 * clan's rather than shown as a side-by-side pair that would imply the API
 * told us both.
 */
export function ClanWarLog({ clan, tag }: { clan: ApiRecord; tag: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();
  const [open, setOpen] = useState<number>();

  // `isWarLogPublic: false` on the clan record means the 403 is already known
  // before the request, so it is not made at all.
  const isPublic = clan['isWarLogPublic'] !== false;
  const { data: result, isFetching } = useQuery({
    ...gameQuery({ game: 'coc', resource: 'warLog', tag, limit: PAGE }),
    enabled: isPublic,
  });

  const wars = useMemo(() => {
    if (!result?.ok) return [];
    try {
      return rows(record(JSON.parse(result.data))['items']);
    } catch {
      return [];
    }
  }, [result]);

  const forbidden = !isPublic || (result?.ok === false && result.status === 403);

  if (forbidden) {
    return (
      <EmptyState
        title="This war log is private"
        body={`${text(clan['name'])} keeps its war history hidden. Only the clan's own members can see it, and a leader has to make it public before it shows up here.`}
      />
    );
  }

  if (isFetching && !wars.length) {
    return <Text style={s.loading}>Loading war history…</Text>;
  }

  if (!wars.length) {
    return (
      <View style={s.fill}>
        <EmptyState
          title="No wars yet"
          body="This clan has not finished a war. Once it does, every result lands here."
        />
        {result && !result.ok ? <Source result={result} /> : null}
      </View>
    );
  }

  return (
    <View style={s.stack}>
      {wars.map((war, i) => {
        const us = record(war['clan']);
        const them = record(war['opponent']);
        const outcome = text(war['result']);
        const expanded = open === i;
        const size = Number(war['teamSize']) || 0;
        const per = Number(war['attacksPerMember']) || 2;

        return (
          <Panel key={i} style={s.panel}>
            {/*
              Two sibling targets, never nested: react-native-web's Pressable
              is DOM-backed and bubbles, so a name button inside a row button
              would open the clan *and* toggle the row on a single tap.
            */}
            <View style={s.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${text(them['name'])}`}
                style={s.rowClan}
                onPress={() => openClan(text(them['tag']))}
              >
                <View
                  style={[
                    s.pill,
                    outcome === 'win' ? s.pillWin : outcome === 'lose' ? s.pillLose : s.pillTie,
                  ]}
                >
                  <Text style={s.pillText}>
                    {outcome === 'win' ? 'WIN' : outcome === 'lose' ? 'LOSS' : 'TIE'}
                  </Text>
                </View>

                <ClanBadge clan={them} size={40} level />

                <View style={s.text}>
                  <Text style={s.name} numberOfLines={1}>
                    {text(them['name'])}
                  </Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {size}v{size} · {timeAgo(war['endTime'])}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`War against ${text(them['name'])}`}
                style={s.rowToggle}
                onPress={() => setOpen(expanded ? undefined : i)}
              >
                <View style={s.score}>
                  <View style={s.starLine}>
                    <Text style={s.stars}>{text(us['stars'])}</Text>
                    <Art name="star" size={14} />
                    <Text style={s.stars}>{text(them['stars'])}</Text>
                  </View>
                  <Text style={s.destruction}>
                    {pct(us['destructionPercentage'])} · {pct(them['destructionPercentage'])}
                  </Text>
                </View>
                <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
              </Pressable>
            </View>

            {expanded ? (
              <View style={s.detail}>
                <SplitBar
                  label="Stars"
                  ours={Number(us['stars']) || 0}
                  theirs={Number(them['stars']) || 0}
                  format={(n) => String(n)}
                  theme={theme}
                />
                <SplitBar
                  label="Destruction"
                  ours={Number(us['destructionPercentage']) || 0}
                  theirs={Number(them['destructionPercentage']) || 0}
                  format={(n) => `${n.toFixed(1)}%`}
                  theme={theme}
                />

                <View style={s.statGrid}>
                  <WarStat
                    icon={NAV_ART.clan}
                    label="Members"
                    value={size ? `${size}` : '—'}
                    theme={theme}
                  />
                  <WarStat
                    icon={UI_ART.sword}
                    label="Attacks used"
                    value={
                      us['attacks'] === undefined
                        ? '—'
                        : `${text(us['attacks'])} / ${size * per}`
                    }
                    theme={theme}
                  />
                  <WarStat
                    icon={COC_ART['Barbarian']}
                    label="Attacks per member"
                    value={String(per)}
                    theme={theme}
                  />
                  <WarStat
                    icon={resourceArt('XP')}
                    label="XP earned"
                    value={us['expEarned'] === undefined ? '—' : groupedNumber(us['expEarned'])}
                    theme={theme}
                  />
                  <WarStat
                    icon={NAV_ART.war}
                    label="Opponent level"
                    value={text(them['clanLevel'])}
                    theme={theme}
                  />
                  <WarStat
                    icon={COC_ART['clock']}
                    label="Ended"
                    value={shortDate(war['endTime'])}
                    theme={theme}
                  />
                </View>
              </View>
            ) : null}
          </Panel>
        );
      })}

      {result ? <Source result={result} /> : null}
    </View>
  );
}

/**
 * Ours against theirs as one bar, green over red.
 *
 * `flexGrow` carries the proportions, so the two segments always fill the
 * track exactly whatever the figures are -- the same technique the clan's
 * all-time war record bar uses. A 0-0 war leaves both segments at their
 * minimum width rather than collapsing the track.
 */
function SplitBar({
  label,
  ours,
  theirs,
  format,
  theme,
}: {
  label: string;
  ours: number;
  theirs: number;
  format: (n: number) => string;
  theme: Theme;
}) {
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.split}>
      <View style={s.splitHead}>
        <Text style={s.splitOurs}>{format(ours)}</Text>
        <Text style={s.splitLabel}>{label}</Text>
        <Text style={s.splitTheirs}>{format(theirs)}</Text>
      </View>
      <View style={s.splitTrack} accessibilityLabel={`${label}: ${format(ours)} to ${format(theirs)}`}>
        <View style={[s.splitSeg, s.splitUs, { flexGrow: ours }]} />
        <View style={[s.splitSeg, s.splitThem, { flexGrow: theirs }]} />
      </View>
    </View>
  );
}

function WarStat({
  icon,
  label,
  value,
  theme,
}: {
  icon?: ImageSourcePropType;
  label: string;
  value: string;
  theme: Theme;
}) {
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.stat}>
      {icon ? <Image source={icon} style={s.statIcon} resizeMode="contain" /> : null}
      <View style={s.statText}>
        <Text style={s.statValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={s.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** Destruction arrives with long decimals; one place is all the row has room for. */
function pct(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 10 },
    fill: { flex: 1 },
    panel: { padding: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowClan: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },

    pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, minWidth: 46, alignItems: 'center' },
    pillWin: { backgroundColor: t.success },
    pillLose: { backgroundColor: t.destructive },
    pillTie: { backgroundColor: t.mutedForeground },
    pillText: { fontFamily: t.fonts.display, fontSize: 10, color: t.background },

    text: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    meta: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    score: { alignItems: 'flex-end' },
    starLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    stars: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    destruction: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    chevron: { width: 14, textAlign: 'center', fontSize: 13, color: t.mutedForeground },

    detail: { marginTop: 14, gap: 12 },
    split: {},
    splitHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    splitOurs: { fontFamily: t.fonts.display, fontSize: 13, color: t.success },
    splitLabel: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    splitTheirs: { fontFamily: t.fonts.display, fontSize: 13, color: t.destructive },
    splitTrack: {
      flexDirection: 'row',
      height: 8,
      marginTop: 6,
      borderRadius: 999,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    splitSeg: { flexBasis: 0, minWidth: 2 },
    splitUs: { backgroundColor: t.success },
    splitThem: { backgroundColor: t.destructive },

    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    stat: {
      flexBasis: '47%',
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.muted,
      borderRadius: 6,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    statIcon: { width: 20, height: 20 },
    statText: { flexShrink: 1, minWidth: 0 },
    statValue: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    statLabel: { marginTop: 2, fontSize: 9, color: t.mutedForeground, fontFamily: t.fonts.sans },

    loading: {
      paddingVertical: 40,
      textAlign: 'center',
      fontSize: 13,
      color: t.primary,
      fontFamily: t.fonts.sans,
    },
  });
