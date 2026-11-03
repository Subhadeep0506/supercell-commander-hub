import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { compactNumber } from '@/lib/clan';
import type { VillageSide } from '@/lib/village-export';
import { maxedBy, schedule, type Remaining, type Strategy } from '@/lib/village-plan';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ItemTile, briefDuration, clockLabel, useNow } from './BuilderBits';

const SHOWN = 8;

/**
 * When the village finishes, and what to start next.
 *
 * The date assumes every builder runs without a pause, which no real village
 * manages -- loot is always the binding constraint. It is labelled as a
 * best case rather than presented as a forecast.
 */
export function MaxedByList({
  side,
  remaining,
  strategy = 'balanced',
  onOpenItem,
}: {
  side: VillageSide;
  remaining: Remaining[];
  strategy?: Strategy;
  onOpenItem: (catalogId: string, level: number) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const now = useNow();

  const plan = useMemo(
    () => schedule(side, remaining, strategy, now, SHOWN),
    [side, remaining, strategy, now],
  );
  const finish = maxedBy(side, remaining, now);
  const totalDays = Math.round((finish - now) / 86400_000);

  if (remaining.length === 0) {
    return (
      <Panel>
        <Text style={s.title}>Everything is maxed</Text>
        <Text style={s.sub}>Nothing left to upgrade at this hall level.</Text>
      </Panel>
    );
  }

  return (
    <Panel>
      <View style={s.head}>
        <Text style={s.title} numberOfLines={2}>
          Everything maxed by {longDate(finish)}
        </Text>
        <Text style={s.days}>{totalDays}d</Text>
      </View>
      <Text style={s.sub}>
        Best case: every builder busy, loot never the constraint. {remaining.length} upgrades left.
      </Text>

      {plan.map((task, i) => (
        <View key={i} style={s.row}>
          <Text style={s.rank}>{i + 1}</Text>
          <ItemTile
            catalogId={task.catalogId}
            level={task.fromLevel}
            size={40}
            onPress={() => onOpenItem(task.catalogId, task.fromLevel)}
            accessibilityLabel={`View ${task.name}`}
          />
          <View style={s.rowText}>
            <Text style={s.name} numberOfLines={1}>
              {task.name}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {task.fromLevel} → {task.toLevel} · {briefDuration(task.seconds * 1000)}
              {task.cost ? ` · ${compactNumber(task.cost)}` : ''}
            </Text>
          </View>
          {task.startsAt <= now ? (
            <Text style={s.start}>Start now</Text>
          ) : (
            <Text style={s.when}>{clockLabel(task.startsAt)}</Text>
          )}
        </View>
      ))}
    </Panel>
  );
}

function longDate(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`;
}

const build = (t: Theme) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    title: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 15, color: t.foreground },
    days: { fontFamily: t.fonts.display, fontSize: 13, color: t.primary },
    sub: { marginTop: 6, fontSize: 11, lineHeight: 17, color: t.mutedForeground, fontFamily: t.fonts.sans },

    row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    rank: { width: 14, textAlign: 'center', fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    rowText: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    meta: { marginTop: 2, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    start: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: `${t.success}33`,
      color: t.success,
      fontFamily: t.fonts.display,
      fontSize: 10,
    },
    when: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
