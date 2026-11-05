import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { VillageSide } from '@/lib/village-export';
import { STRATEGIES, schedule, type Remaining, type Strategy } from '@/lib/village-plan';
import { ChipRow } from '@/components/ui/ChipRow';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { GroupLegend, briefDuration, groupColour, itemImage, useNow } from './BuilderBits';

const RANGES = [
  { id: '3d', label: '3 days', days: 3 },
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
] as const;

/** Pixels per day. Wide enough that a 4-hour upgrade is still a visible bar. */
const DAY_WIDTH = 150;
/**
 * Rows are tall enough for the item's artwork beside two lines of label.
 *
 * Was 34, which left a 24px bar carrying 9px text -- the name, the target
 * level and the duration all on one line, truncated on anything but the
 * longest bar. The art is what makes a row scannable: a hero upgrade should
 * read as the hero at a glance rather than as a coloured block.
 */
const ROW_HEIGHT = 56;
const BAR_HEIGHT = ROW_HEIGHT - 12;
const ART_SIZE = BAR_HEIGHT - 10;
/** Keeps a short upgrade wide enough to still show its icon. */
const MIN_BAR = ART_SIZE + 14;

/**
 * The plan timeline: one row per builder, plus the Laboratory and Pet House.
 *
 * Bars are laid out against real timestamps, so the "Now" marker and the day
 * columns line up with the countdowns elsewhere on the screen rather than
 * being drawn to a separate idea of time.
 */
export function BuilderPlanGantt({
  side,
  remaining,
  onOpenItem,
}: {
  side: VillageSide;
  remaining: Remaining[];
  /**
   * Opens the Clash Book entry for a bar, the same way the lists below this
   * chart do. Without it the timeline was the only place on the screen where
   * an upgrade was not tappable.
   */
  onOpenItem?: (catalogId: string, level: number) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const now = useNow();

  const [range, setRange] = useState<string>('week');
  const [strategy, setStrategy] = useState<Strategy>('balanced');

  const windowDays = RANGES.find((r) => r.id === range)?.days ?? 7;
  const start = now;
  const end = start + windowDays * 86400_000;
  const width = windowDays * DAY_WIDTH;
  const xFor = (at: number) => ((at - start) / (end - start)) * width;

  const plan = useMemo(
    () => schedule(side, remaining, strategy, now, 80),
    [side, remaining, strategy, now],
  );

  // One row per lane that actually has work, so an empty Pet House row does
  // not take up space on a village with no pets.
  const lanes = useMemo(() => {
    const keys = new Map<string, { lane: string; index: number; label: string }>();
    for (let i = 0; i < Math.max(1, side.builders); i++) {
      keys.set(`builder:${i}`, { lane: 'builder', index: i, label: String(i + 1) });
    }
    for (const task of plan) {
      const key = `${task.lane}:${task.laneIndex}`;
      if (!keys.has(key)) {
        keys.set(key, {
          lane: task.lane,
          index: task.laneIndex,
          label: task.lane === 'lab' ? 'Lab' : 'Pets',
        });
      }
    }
    return [...keys.entries()];
  }, [plan, side.builders]);

  const dayMarks = useMemo(
    () => Array.from({ length: windowDays }, (_, i) => start + i * 86400_000),
    [start, windowDays],
  );

  const visible = plan.filter((t) => t.endsAt > start && t.startsAt < end);

  return (
    <Panel>
      <View style={s.head}>
        <Text style={s.title}>Builder plan</Text>
      </View>

      <ChipRow
        accessibilityLabel="Plan strategy"
        value={strategy}
        onChange={(id) => setStrategy(id as Strategy)}
        chips={STRATEGIES.map((m) => ({ id: m.id, label: m.label }))}
      />
      <ChipRow
        accessibilityLabel="Plan range"
        value={range}
        onChange={setRange}
        chips={RANGES.map((r) => ({ id: r.id, label: r.label }))}
      />

      {visible.length === 0 ? (
        <Text style={s.empty}>Nothing left to schedule in this window.</Text>
      ) : (
        <View style={s.chart}>
          {/* Labels sit outside the scroller: inside it they scroll away, and
              overlaid on the track the bars cover them. */}
          <View style={s.labels}>
            <View style={s.dayRow} />
            {lanes.map(([key, lane]) => (
              <View key={key} style={s.laneLabelCell}>
                <Text style={s.laneLabel} numberOfLines={1}>
                  {lane.label}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll}>
            <View style={{ width }}>
              <View style={s.dayRow}>
                {dayMarks.map((at, i) => (
                  <Text key={i} style={[s.day, { left: xFor(at) + 4 }]} numberOfLines={1}>
                    {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : shortDay(at)}
                  </Text>
                ))}
              </View>

              <View style={{ height: lanes.length * ROW_HEIGHT }}>
                {dayMarks.map((at, i) => (
                  <View key={`g${i}`} style={[s.gridLine, { left: xFor(at) }]} />
                ))}

                {visible.map((task, i) => {
                const row = lanes.findIndex(([key]) => key === `${task.lane}:${task.laneIndex}`);
                if (row < 0) return null;
                const left = Math.max(0, xFor(task.startsAt));
                const right = Math.min(width, xFor(task.endsAt));
                const barWidth = Math.max(MIN_BAR, right - left);
                // The artwork always fits; the label only earns its place once
                // the bar is wide enough to show more than a truncated word.
                const roomForText = barWidth > MIN_BAR + 46;
                const art = itemImage(task.catalogId, task.fromLevel);
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={`${task.name} to level ${task.toLevel}, ${briefDuration(
                      task.seconds * 1000,
                    )}`}
                    disabled={!onOpenItem}
                    onPress={() => onOpenItem?.(task.catalogId, task.fromLevel)}
                    style={({ pressed }) => [
                      s.bar,
                      pressed && s.barPressed,
                      {
                        top: row * ROW_HEIGHT + 6,
                        left,
                        width: barWidth,
                        backgroundColor: groupColour(task.group, theme),
                      },
                    ]}
                  >
                    {art ? (
                      <Image
                        source={art}
                        style={s.barArt}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                      />
                    ) : null}
                    {roomForText ? (
                      <View style={s.barText}>
                        <Text style={s.barName} numberOfLines={1}>
                          {task.name}
                        </Text>
                        <Text style={s.barMeta} numberOfLines={1}>
                          → {task.toLevel} · {briefDuration(task.seconds * 1000)}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

                <View style={[s.nowLine, { left: xFor(now) }]} />
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      <GroupLegend groups={['heroes', 'offense', 'defense', 'economy', 'other']} />
    </Panel>
  );
}

function shortDay(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
}

const build = (t: Theme) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    empty: { marginTop: 14, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },

    chart: { flexDirection: 'row', marginTop: 6 },
    labels: { width: 30, flexShrink: 0 },
    laneLabelCell: { height: ROW_HEIGHT, justifyContent: 'center' },
    laneLabel: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    scroll: { flex: 1 },
    dayRow: { height: 20 },
    day: { position: 'absolute', fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: t.border },

    bar: {
      position: 'absolute',
      height: BAR_HEIGHT,
      borderRadius: 6,
      paddingHorizontal: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      overflow: 'hidden',
    },
    barPressed: { opacity: 0.75 },
    barArt: { width: ART_SIZE, height: ART_SIZE, flexShrink: 0 },
    barText: { flex: 1, minWidth: 0 },
    barName: { fontSize: 10, color: t.primaryForeground, fontFamily: t.fonts.display },
    barMeta: {
      marginTop: 1,
      fontSize: 9,
      color: t.primaryForeground,
      fontFamily: t.fonts.sans,
      opacity: 0.85,
    },

    nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: t.destructive },
  });
