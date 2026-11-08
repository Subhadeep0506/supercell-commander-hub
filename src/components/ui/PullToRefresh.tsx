import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { Spinner } from '@/components/ui/Shimmer';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * A scrolling container you can pull down to refresh.
 *
 * **Why this is not `RefreshControl`.** It was, and the gesture did nothing on
 * device. Two things make that component unusable here:
 *
 *  - On the web it is a *literal* no-op. react-native-web's implementation
 *    destructures `onRefresh` into its ignored-props list and renders a bare
 *    `View`, so the browser -- the only test surface this project has -- can
 *    never exercise it, and a regression in it cannot be caught before an APK
 *    is cut.
 *  - On the device it is a native Fabric component, and this app runs React
 *    Native 0.88 with `newArchEnabled=true`. Whatever went wrong there is not
 *    reproducible without a USB device, which this machine does not have.
 *
 * So the gesture is ordinary JS touch handling instead: the same code path on
 * Android and in the browser, debuggable in both, with nothing native under it
 * to disagree about.
 */

/** How far the content travels at full pull. */
const MAX_PULL = 72;
/** Past this, releasing refreshes. Below it, the pull springs back. */
const THRESHOLD = 56;
/**
 * Finger travel is divided by this before it moves anything.
 *
 * A 1:1 pull feels like the page has come unstuck from the screen; damping it
 * gives the rubber-band resistance the gesture is supposed to have.
 */
const DAMPING = 2.5;

export function PullToRefresh({
  refreshing,
  onRefresh,
  children,
  onScroll,
  ...rest
}: ScrollViewProps & {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const pull = useRef(new Animated.Value(0)).current;
  /**
   * Live scroll offset, in a ref rather than state.
   *
   * The pan responder reads it on every touch to decide whether this is a pull
   * or a scroll, and it must not re-render the whole screen 60 times a second
   * to do so.
   */
  const offset = useRef(0);
  /** True between release-past-threshold and the refetch settling. */
  const [armed, setArmed] = useState(false);
  /**
   * Whether the indicator is mounted at all.
   *
   * It is *not* enough to leave it mounted at zero opacity. Doing that put a
   * permanent `progressbar` labelled "Refreshing" into every screen: it showed
   * up in `document.body.innerText`, so it broke text assertions in the
   * browser checks, a screen reader announced it on every page, and the
   * ActivityIndicator inside it animated forever on a screen nobody was
   * pulling.
   */
  const [active, setActive] = useState(false);

  // react-native-web cannot drive animation off the main thread and warns when
  // asked; Android wants it. Same gate as TopBar and Shimmer.
  const native = Platform.OS !== 'web';

  const settle = useCallback(() => {
    // Unmounted only once it has finished springing back, so the spinner does
    // not vanish mid-animation.
    Animated.spring(pull, { toValue: 0, useNativeDriver: native, bounciness: 0 }).start(() =>
      setActive(false),
    );
  }, [native, pull]);

  // Hold the indicator open while the refetch runs, then let it go. Without
  // this the spinner would snap away the instant the finger lifted, so a slow
  // refresh would look like nothing had happened.
  //
  // Also covers the case where there was nothing to refetch and `refreshing`
  // never went true at all: `armed` alone is enough to put the page back.
  useEffect(() => {
    if (refreshing || !armed) return;
    setArmed(false);
    settle();
  }, [refreshing, armed, settle]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Never claim the gesture on touch-down -- that would swallow every tap
        // on every card in the page.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          // Three guards, and all three are load-bearing:
          //   offset <= 0  -- only at the very top, so scrolling back up
          //                   through a long page never turns into a refresh.
          //   dy > 8       -- past the slop, so a tap that drifts is still a tap.
          //   |dy| > |dx|  -- vertical intent, so the horizontal rails (HGrid,
          //                   ChipRow, the chest track) keep their own gesture.
          !refreshing && offset.current <= 0 && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        // Mount the indicator the moment the gesture is claimed, not before.
        onPanResponderGrant: () => setActive(true),
        onPanResponderMove: (_, g) => {
          pull.setValue(Math.max(0, Math.min(MAX_PULL, g.dy / DAMPING)));
        },
        onPanResponderRelease: (_, g) => {
          if (Math.min(MAX_PULL, g.dy / DAMPING) >= THRESHOLD) {
            setArmed(true);
            Animated.spring(pull, {
              toValue: THRESHOLD,
              useNativeDriver: native,
              bounciness: 0,
            }).start();
            onRefresh();
            return;
          }
          settle();
        },
        // A terminated gesture -- the OS handing the touch to something else --
        // must put the page back, or the content stays pushed down for good.
        onPanResponderTerminate: () => settle(),
      }),
    [native, onRefresh, pull, refreshing, settle],
  );

  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return (
    <View style={s.root} {...responder.panHandlers}>
      {/*
        The indicator sits behind the content and is revealed by it, rather
        than pushing it down from above -- so nothing reflows and the whole
        animation is a transform, which Android can run off the main thread.
      */}
      {active || refreshing ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.indicator,
            {
              opacity: pull.interpolate({
                inputRange: [0, THRESHOLD],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
              transform: [
                {
                  translateY: pull.interpolate({
                    inputRange: [0, MAX_PULL],
                    outputRange: [-8, MAX_PULL - 28],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          <Spinner label="Refreshing" />
        </Animated.View>
      ) : null}

      <Animated.View style={[s.body, { transform: [{ translateY: pull }] }]}>
        <ScrollView {...rest} onScroll={track} scrollEventThrottle={16}>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, overflow: 'hidden', backgroundColor: t.background },
    indicator: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    body: { flex: 1 },
  });
