import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
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
  const state = useRef({ width, max, value, onChange });
  state.current = { width, max, value, onChange };

  /**
   * The track's left edge in page coordinates.
   *
   * This is the whole fix for the drag jitter. The responder used to seek from
   * `nativeEvent.locationX`, which is measured against **the view that
   * received the touch** -- and once a drag crosses the thumb or the filled
   * portion, that view is the child, not the track. The origin moved under the
   * gesture every few pixels, so the value snapped back and forth instead of
   * following the finger.
   *
   * Taken on grant rather than from `measureInWindow`, which is asynchronous
   * and would not have answered before the first move event. At grant time the
   * target really is the track (the children are `pointerEvents="none"`), so
   * `pageX - locationX` is its left edge exactly.
   */
  const originX = useRef(0);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          seek(e.nativeEvent.pageX);
        },
        onPanResponderMove: (_e, gesture: PanResponderGestureState) => seek(gesture.moveX),
      }),
    [],
  );

  function seek(pageX: number) {
    const { width: w, max: m, value: current, onChange: cb } = state.current;
    if (w <= 0 || m <= 0) return;
    const ratio = Math.max(0, Math.min(1, (pageX - originX.current) / w));
    const next = Math.round(ratio * m);
    // A move that lands on the same step must not call back: BookItemModal's
    // handler rebuilds the whole layer stack, so an unchanged value still
    // re-renders every card behind the sheet.
    if (next !== current) cb(next);
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
      {/* pointerEvents="none" so the track stays the gesture target for the
          whole drag -- without it the thumb captures the touch and `locationX`
          and `pageX - locationX` are both measured against the wrong box. */}
      <View style={s.track} pointerEvents="none">
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>
      <View style={[s.thumb, { left: `${pct}%` }]} pointerEvents="none" />
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
