import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Ported from the `Meter` in components/hub-ui.tsx.
 *
 * Guards the same way the original did: a zero or missing max yields 0% rather
 * than NaN, which the achievement rows rely on.
 *
 * `fill` overrides the default `theme.primary`. The Brawl Stars screens pass
 * `theme.brawl.highlight`: everything else on those screens is purple and
 * yellow, and a Clash of Clans teal bar in the middle of the Ranked panel read
 * as a component someone had forgotten to restyle.
 */
export function Meter({
  value,
  max = 100,
  fill,
  style,
}: {
  value: number;
  max?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={[s.track, style]}>
      <View style={[s.fill, { width: `${pct}%` }, fill ? { backgroundColor: fill } : null]} />
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    track: {
      height: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: t.primary },
  });
