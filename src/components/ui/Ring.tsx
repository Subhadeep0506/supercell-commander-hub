import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * A donut gauge with the percentage in the middle.
 *
 * `Meter` is the right shape for a row in a list; a headline figure wants to
 * read as one number rather than as the widest bar on the screen. Built on
 * react-native-svg, which is already a dependency and already renders under
 * both bundlers -- `StatIcon` has been drawing with it since the CR work.
 *
 * The arc starts at twelve o'clock: `rotation` on the circle rather than on
 * the wrapper, because a transform on the `View` would take the centred text
 * with it.
 */
export function Ring({
  pct,
  size = 104,
  thickness = 12,
  color,
  label,
}: {
  pct: number;
  size?: number;
  thickness?: number;
  color?: string;
  /** Names the figure for a screen reader, e.g. "65% complete for TH13". */
  label?: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const value = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const centre = size / 2;
  const radius = centre - thickness / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View
      style={[s.wrap, { width: size, height: size }]}
      accessibilityLabel={label ?? `${Math.round(value)} percent`}
    >
      {/*
        The quarter-turn is a React Native style transform on the <Svg>, not
        `rotation`/`origin` on the <Circle>.

        react-native-svg renders those as a `transform-origin` *attribute*
        under react-native-web, which React rejects as an invalid DOM property
        -- a console error on every render, and the browser checks fail the
        run on any console error at all. The ring is symmetric, so turning the
        whole canvas is equivalent, and the centred text is a sibling View
        rather than a child, so it does not come along.
      */}
      <Svg width={size} height={size} style={s.turn}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={theme.muted}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={color ?? theme.primary}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          // A full circle is offset 0 and an empty one the whole
          // circumference, so the arc grows clockwise from the top.
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </Svg>
      <View style={s.middle} pointerEvents="none">
        <Text style={[s.value, { fontSize: Math.round(size / 4) }]}>{Math.round(value)}%</Text>
      </View>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    turn: { transform: [{ rotate: '-90deg' }] },
    middle: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    value: { fontFamily: t.fonts.display, color: t.foreground },
  });
