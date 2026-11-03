import { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { townHallArt } from '@/assets/art';
import { record, text, type ApiRecord } from '@/api/game-api';
import { formatDuration, parseApiTime, timeAgo } from '@/lib/clan';
import { memberTh, thColour, thHistogram, type RoundStatus } from '@/lib/cwl';
import { useCountdown } from '@/hooks/use-countdown';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art } from '../CocBits';

/** War state as the API spells it, as a reader would say it. */
export const WAR_STATE_LABELS: Record<string, string> = {
  preparation: 'Preparation',
  inWar: 'Battle day',
  warEnded: 'War ended',
  notInWar: 'Not in war',
};

export function warStateLabel(state: unknown): string {
  const key = typeof state === 'string' ? state : '';
  return WAR_STATE_LABELS[key] ?? text(state);
}

/** A small state pill, coloured by how urgent the phase is. */
export function StateChip({ state }: { state: RoundStatus | string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const live = state === 'inWar';
  const done = state === 'warEnded' || state === 'ended';
  return (
    <View style={[s.chip, live && s.chipLive, done && s.chipDone]}>
      <Text style={[s.chipText, live && s.chipTextLive, done && s.chipTextDone]}>
        {warStateLabel(state)}
      </Text>
    </View>
  );
}

/**
 * Time left in the current phase.
 *
 * Preparation counts to `startTime`, battle day to `endTime`, and a finished
 * war says how long ago it ended instead -- a countdown to a past time is
 * noise. Nothing renders when the war carries no timestamps at all.
 */
export function WarClock({ war }: { war: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const state = war['state'];
  const target = parseApiTime(state === 'preparation' ? war['startTime'] : war['endTime']);
  // Hooks cannot be skipped, so the countdown is always mounted; it idles on
  // an undefined target and tears its interval down once the target passes.
  const remaining = useCountdown(state === 'warEnded' ? undefined : target);

  if (state === 'warEnded') {
    const ended = parseApiTime(war['endTime']);
    return ended ? <Text style={s.clock}>Ended {timeAgo(war['endTime'])}</Text> : null;
  }
  if (!target) return null;
  // `formatDuration` floors at "now", which would read as "Ends in now" --
  // the API's state lags the clock by a minute or two at every changeover.
  if (remaining <= 0) {
    return (
      <Text style={s.clock}>
        {state === 'preparation' ? 'Starting any moment' : 'Ending any moment'}
      </Text>
    );
  }
  return (
    <Text style={s.clock}>
      {state === 'preparation' ? 'Battle day in ' : 'Ends in '}
      <Text style={s.clockValue}>{formatDuration(remaining)}</Text>
    </Text>
  );
}

/** Town Hall artwork with the level as a readable fallback. */
export function Hall({ member, size = 40 }: { member: ApiRecord; size?: number }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const level = memberTh(member);
  const source = townHallArt(level);
  if (source) {
    return (
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel={`Town Hall ${level}`}
      />
    );
  }
  return (
    <View style={[s.hallFallback, { width: size, height: size }]}>
      <Text style={s.hallFallbackText}>{level || '—'}</Text>
    </View>
  );
}

/**
 * A roster's Town Hall spread as one bar.
 *
 * `flexGrow` carries the proportions so the segments always fill the track
 * exactly, the same technique the war log's split bars use.
 */
export function ThBar({ members, style }: { members: ApiRecord[]; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const spread = thHistogram(members);
  if (!spread.length) return null;
  return (
    <View
      style={[s.thBar, style]}
      accessibilityLabel={`Town Halls: ${spread.map((b) => `${b.count} at ${b.th}`).join(', ')}`}
    >
      {spread.map((bucket) => (
        <View
          key={bucket.th}
          style={[s.thSeg, { flexGrow: bucket.count, backgroundColor: thColour(bucket.th) }]}
        />
      ))}
    </View>
  );
}

/** The `TH18 ▰▰▰ TH3` key above the clan list. */
export function ThLegend({ high, low }: { high: number; low: number }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const levels: number[] = [];
  for (let n = high; n >= low; n--) levels.push(n);
  return (
    <View style={s.legend}>
      <Text style={s.legendCap}>TH{high}</Text>
      <View style={s.legendRamp}>
        {levels.map((n) => (
          <View key={n} style={[s.legendStep, { backgroundColor: thColour(n) }]} />
        ))}
      </View>
      <Text style={s.legendCap}>TH{low}</Text>
    </View>
  );
}

/** Stars either side of the fan-kit star, with destruction beneath. */
export function ScoreLine({
  us,
  them,
  size = 28,
}: {
  us: ApiRecord;
  them: ApiRecord;
  size?: number;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.score}>
      <View style={s.starLine}>
        <Text style={[s.scoreText, { fontSize: size }]}>{text(us['stars'])}</Text>
        <Art name="star" size={Math.round(size * 0.64)} />
        <Text style={[s.scoreText, { fontSize: size }]}>{text(them['stars'])}</Text>
      </View>
      <Text style={s.destruction}>
        {pct(us['destructionPercentage'])} · {pct(them['destructionPercentage'])}
      </Text>
    </View>
  );
}

/** Destruction arrives with long decimals; one place is all there is room for. */
export function pct(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

/** `badgeUrls` is on the group's clan records and on each war side alike. */
export function badgeOf(side: ApiRecord): ApiRecord {
  return record(side['badgeUrls']);
}

const build = (t: Theme) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    chipLive: { borderColor: t.success, backgroundColor: `${t.success}22` },
    chipDone: { borderColor: t.border, backgroundColor: t.muted },
    chipText: { fontFamily: t.fonts.display, fontSize: 10, color: t.primary },
    chipTextLive: { color: t.success },
    chipTextDone: { color: t.mutedForeground },

    clock: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    clockValue: { fontFamily: t.fonts.display, color: t.foreground },

    hallFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    hallFallbackText: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },

    thBar: { flexDirection: 'row', gap: 2, height: 8, overflow: 'hidden' },
    thSeg: { flexBasis: 0, minWidth: 2, borderRadius: 2 },

    legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendCap: { fontSize: 9, color: t.mutedForeground, fontFamily: t.fonts.sans },
    legendRamp: { flexDirection: 'row', width: 92, height: 6, borderRadius: 999, overflow: 'hidden' },
    legendStep: { flexGrow: 1, flexBasis: 0 },

    score: { alignItems: 'center' },
    starLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    scoreText: { fontFamily: t.fonts.display, color: t.foreground },
    destruction: { marginTop: 6, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
