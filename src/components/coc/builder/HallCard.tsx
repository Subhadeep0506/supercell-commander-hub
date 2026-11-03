import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '@/lib/clan';
import type { VillageSide } from '@/lib/village-export';
import {
  completion,
  isRushed,
  laneTime,
  wallsLeft,
  type Remaining,
} from '@/lib/village-plan';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ItemTile, SectionBar, briefDuration } from './BuilderBits';

/** Days, rounded -- "117d" reads better than a precise hour count here. */
function days(seconds: number): string {
  if (seconds <= 0) return '0d';
  const d = Math.round(seconds / 86400);
  return d >= 1 ? `${d}d` : formatDuration(seconds * 1000);
}

/**
 * The hall summary: how far through this hall level the village is, and how
 * much work is left in each queue.
 *
 * The percentage is level-weighted (see village-plan.completion) and the same
 * formula backs every section bar, so the headline and the sections can never
 * disagree.
 */
export function HallCard({
  side,
  remaining,
  exportedAt,
  onUpdate,
}: {
  side: VillageSide;
  remaining: Remaining[];
  exportedAt: number;
  onUpdate: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const done = completion(side);
  const walls = wallsLeft(side);
  const rushed = isRushed(side);
  const hallId = side.base === 'home' ? 'home/town-hall' : 'builder/builder-hall';
  const hallName = side.base === 'home' ? 'Town Hall' : 'Builder Hall';
  const shortName = side.base === 'home' ? 'TH' : 'BH';

  const age = Date.now() - exportedAt;

  return (
    <Panel>
      <View style={s.head}>
        <ItemTile catalogId={hallId} level={side.hallLevel} size={72} />
        <View style={s.headText}>
          <Text style={s.title}>
            {hallName} {side.hallLevel}
          </Text>
          <Text style={s.done}>
            <Text style={s.donePct}>{Math.round(done.pct)}%</Text> done for {shortName}
            {side.hallLevel}
          </Text>
          <View style={s.badges}>
            {rushed ? (
              <Text style={s.rushed} accessibilityLabel={`Rushed ${side.hallLevel}`}>
                ⚠ Rushed · {side.hallLevel}
              </Text>
            ) : null}
            <Text style={s.age}>↻ {briefDuration(age)} ago</Text>
          </View>
        </View>
      </View>

      <SectionBar pct={done.pct} />

      <View style={s.stats}>
        {/* Divided across the builders: this is wall-clock time to finish, not
            total work, and it has to agree with the "maxed by" date below. */}
        <Stat
          value={days(laneTime(remaining, 'builder') / Math.max(1, side.builders))}
          label="Builder time"
          theme={theme}
        />
        <View style={s.divider} />
        <Stat value={days(laneTime(remaining, 'lab'))} label="Lab time" theme={theme} />
        <View style={s.divider} />
        <Stat value={String(Math.max(0, walls.total - walls.have))} label="Walls left" theme={theme} />
      </View>

      <Button
        variant="outline"
        size="sm"
        accessibilityLabel="Update village data"
        onPress={onUpdate}
        style={s.update}
      >
        ↻ Update
      </Button>
    </Panel>
  );
}

function Stat({ value, label, theme }: { value: string; label: string; theme: Theme }) {
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    headText: { flex: 1, minWidth: 0 },
    title: { fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    done: { marginTop: 4, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    donePct: { color: t.primary, fontFamily: t.fonts.display },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    rushed: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: `${t.destructive}33`,
      color: t.destructive,
      fontFamily: t.fonts.display,
      fontSize: 10,
    },
    age: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: t.muted,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
      fontSize: 10,
    },

    stats: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: 14,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: t.muted,
    },
    divider: { width: 1, backgroundColor: t.border },
    stat: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 },
    statValue: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    statLabel: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    update: { marginTop: 14, alignSelf: 'flex-start' },
  });
