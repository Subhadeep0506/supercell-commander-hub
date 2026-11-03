import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Replaces `<input type="range">` in the Clash Book level control.
 *
 * Built on PanResponder rather than a slider package: the reference needs only
 * integer steps over a short range, and adding a native dependency for it
 * would mean linking work on a target we cannot currently build.
 *
 * `value` is an index, not a level -- the caller maps it to the level row.
 */
export function Slider({
  value,
  max,
  onChange,
  accessibilityLabel,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [width, setWidth] = useState(0);

  // PanResponder is created once; refs keep it reading current values without
  // tearing down and rebuilding the responder on every render.
  const state = useRef({ width, max, onChange });
  state.current = { width, max, onChange };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => seek(e.nativeEvent.locationX),
        onPanResponderMove: (e) => seek(e.nativeEvent.locationX),
      }),
    [],
  );

  function seek(x: number) {
    const { width: w, max: m, onChange: cb } = state.current;
    if (w <= 0 || m <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    cb(Math.round(ratio * m));
  }

  const pct = max > 0 ? (Math.max(0, Math.min(max, value)) / max) * 100 : 0;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max, now: value }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={s.hit}
      {...responder.panHandlers}
    >
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>
      <View style={[s.thumb, { left: `${pct}%` }]} />
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    // A 36px tall hit area around a 6px track -- a 6px target is unusable on
    // a phone, and the browser's native range input has the same padding.
    hit: { height: 36, justifyContent: 'center' },
    track: { height: 6, borderRadius: 999, backgroundColor: t.muted, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: t.primary },
    thumb: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 999,
      marginLeft: -9,
      backgroundColor: t.primary,
      borderWidth: 2,
      borderColor: t.card,
    },
  });
