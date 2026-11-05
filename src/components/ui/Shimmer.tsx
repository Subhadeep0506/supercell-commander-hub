import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Loading affordances for both games.
 *
 * The app used to answer every pending request with a line of text -- "Loading
 * war league…", "Reading the battle log…". It reads as an error message, and
 * on a warm cache it flashes on and off again before it can be read.
 *
 * Two shapes replace it:
 *
 *  - `Shimmer` / `SkeletonRows` for a *first* load, where nothing is on screen
 *    yet and a placeholder can usefully trace the shape of what is coming.
 *  - `Spinner` for a refetch *over* content that is already rendered, where a
 *    skeleton would throw away data the user can already read.
 *
 * Deliberately a pulsing opacity rather than a sweeping highlight: a travelling
 * gradient needs either a masked view or an SVG gradient animated per frame,
 * and neither earns its keep against a 200ms cache hit.
 */

/** react-native-web cannot drive opacity off the main thread, and warns if asked. */
const NATIVE_DRIVER = Platform.OS !== 'web';

function usePulse() {
  const value = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 700,
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(value, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);

  return value;
}

/**
 * One placeholder block.
 *
 * `width` takes a percentage so a column of rows can vary its line lengths and
 * read as text rather than as a stack of identical bars.
 */
export function Shimmer({
  width = '100%',
  height = 14,
  radius,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const opacity = usePulse();

  return (
    <Animated.View
      // Decorative: the surrounding skeleton carries the accessibility label,
      // so a screen reader hears "Loading" once rather than once per bar.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.muted,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A stack of skeleton rows standing in for a list.
 *
 * `avatar` adds a square ahead of the lines, which is the shape of almost every
 * list in this app -- clan matches, rankings, rosters, battle rows.
 */
export function SkeletonRows({
  rows = 4,
  avatar = false,
  label = 'Loading',
  style,
}: {
  rows?: number;
  avatar?: boolean;
  /** Announced to screen readers in place of the bars. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={[s.rows, style]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={s.row}>
          {avatar ? <Shimmer width={40} height={40} radius={theme.radius.md} /> : null}
          <View style={s.rowText}>
            {/* Two lines of unequal length: a title and its metadata. */}
            <Shimmer width={`${70 - (i % 3) * 12}%`} height={12} />
            <Shimmer width={`${45 - (i % 2) * 10}%`} height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A block placeholder for something that is not a list -- a chart, a panel, a
 * grid of cards.
 */
export function SkeletonBlock({
  height = 120,
  label = 'Loading',
  style,
}: {
  height?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={[s.block, style]}>
      <Shimmer width="55%" height={13} />
      <Shimmer width="100%" height={height} radius={theme.radius.md} />
    </View>
  );
}

/**
 * A refetch over content that is already on screen.
 *
 * `label` is optional: beside a section heading the spinner alone is enough,
 * and a caption there would push the heading out of line.
 */
export function Spinner({
  label,
  size = 'small',
  style,
}: {
  label?: string;
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      style={[s.spinner, style]}
    >
      <ActivityIndicator size={size} color={theme.primary} />
      {/*
        Guarded on a non-empty string rather than on truthiness: `{label && …}`
        renders a bare '' into this View, which only warns on the web and is a
        hard error on Android.
      */}
      {label ? <Text style={s.spinnerLabel}>{label}</Text> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    rows: { gap: 12, paddingVertical: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowText: { flex: 1, minWidth: 0, gap: 7 },

    block: { gap: 12, paddingVertical: 8 },

    spinner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    spinnerLabel: { fontFamily: t.fonts.sans, fontSize: 12, color: t.mutedForeground },
  });
