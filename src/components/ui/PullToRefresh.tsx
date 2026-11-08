import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { GestureDetector, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import { Spinner } from '@/components/ui/Shimmer';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * A scrolling container you can pull down to refresh.
 *
 * **Why this is gesture-handler and not `RefreshControl` or a `PanResponder`.**
 * Both of those shipped broken to the device, for different reasons:
 *
 *  - `RefreshControl` is a *literal* no-op in react-native-web: its
 *    implementation destructures `onRefresh` into an ignored-props list and
 *    renders a bare `View`. The browser -- the only test surface this project
 *    has -- can never exercise it, so a regression in it cannot be caught
 *    before an APK is cut.
 *  - A JS `PanResponder` around a `ScrollView` cannot win on Android.
 *    `ReactScrollView.onInterceptTouchEvent` claims any vertical drag past the
 *    touch slop and calls `NativeGestureUtil.notifyNativeGestureStarted`, which
 *    lands in `JSTouchDispatcher.onChildStartedNativeGesture` -- whose body is
 *    `dispatchCancelEvent(...)`. The JS touch stream is cancelled, the
 *    responder is terminated, and the pull springs back to nothing. Android's
 *    ScrollView intercepts *even at offset 0 where it cannot scroll further*,
 *    which is exactly the case pull-to-refresh needs. (Slider.tsx gets away
 *    with a PanResponder because it claims on touch-*down*; claiming on *move*,
 *    as a pull must, always loses that race.)
 *
 * Gesture handler resolves this above the scroller rather than fighting it:
 * `useNativeGesture` represents the native ScrollView as a gesture, so the two
 * are arbitrated by RNGH instead of one cancelling the other.
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
   * Read on every gesture update to decide whether this is a pull or a scroll,
   * and it must not re-render the screen 60 times a second to do so.
   */
  const offset = useRef(0);
  /**
   * `translationY` at the moment the finger reached the top of the list.
   *
   * Without it, dragging down from halfway through a long page would scroll to
   * the top and then slam the pull straight to full, because `translationY` is
   * measured from where the finger started, not from where the list ran out.
   * Reset whenever the gesture starts, ends, or leaves the top.
   */
  const origin = useRef<number | null>(null);
  /** Latest damped pull, for the release decision. */
  const pulled = useRef(0);
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

  const settle = useCallback(() => {
    origin.current = null;
    pulled.current = 0;
    // Unmounted only once it has finished springing back, so the spinner does
    // not vanish mid-animation.
    Animated.spring(pull, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start(() =>
      setActive(false),
    );
  }, [pull]);

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

  /**
   * The ScrollView, as a gesture.
   *
   * This is the whole reason the gesture works on Android. The native scroller
   * is no longer an opaque thing that cancels us -- it is a gesture RNGH knows
   * about, so `simultaneousWith` below is a relation it can honour.
   */
  const scrollGesture = useNativeGesture({});

  const pan = usePanGesture({
    // Activates only on a *downward* drag past 12pt. An upward drag never
    // activates this gesture, so scrolling is untouched.
    activeOffsetY: 12,
    // A horizontal drag fails it outright, so the horizontal rails -- HGrid,
    // ChipRow, the chest track -- keep their own gesture.
    failOffsetX: [-20, 20],
    /*
     * Simultaneous, deliberately not `block`.
     *
     * `block` would make the scroller wait until this gesture fails -- but with
     * `activeOffsetY: 12` an upward drag neither activates *nor* fails the pan,
     * so blocking would stall scrolling forever. Running both is safe instead:
     * at offset 0 the scroller has nowhere to go, so there is nothing to fight.
     */
    simultaneousWith: scrollGesture,
    onActivate: () => {
      origin.current = null;
      if (offset.current <= 0 && !refreshing) setActive(true);
    },
    onUpdate: (e) => {
      if (refreshing) return;
      // Scrolled away from the top mid-gesture: drop any pull and re-arm the
      // origin, so coming back to the top starts the pull from zero again.
      if (offset.current > 0) {
        origin.current = null;
        if (pulled.current !== 0) {
          pulled.current = 0;
          pull.setValue(0);
        }
        return;
      }
      origin.current ??= e.translationY;
      const next = Math.max(0, Math.min(MAX_PULL, (e.translationY - origin.current) / DAMPING));
      pulled.current = next;
      pull.setValue(next);
    },
    /*
     * Release. `onDeactivate` fires only if the gesture actually activated,
     * and carries `canceled` when it was interrupted -- so it covers both the
     * ordinary release and the OS taking the touch away. There is deliberately
     * no `onFinalize` handler: it runs in the same tick and would read a stale
     * `armed`, settling the pull out from under a refresh that just started.
     */
    onDeactivate: (e) => {
      if (e.canceled || pulled.current < THRESHOLD) {
        settle();
        return;
      }
      setArmed(true);
      Animated.spring(pull, {
        toValue: THRESHOLD,
        useNativeDriver: false,
        bounciness: 0,
      }).start();
      onRefresh();
    },
  });

  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={s.root}>
        {/*
          The indicator sits behind the content and is revealed by it, rather
          than pushing it down from above -- so nothing reflows.
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
          {/* The ScrollView must be the *direct* child of this detector. */}
          <GestureDetector gesture={scrollGesture}>
            <ScrollView {...rest} onScroll={track} scrollEventThrottle={16}>
              {children}
            </ScrollView>
          </GestureDetector>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, overflow: 'hidden', backgroundColor: t.background },
    indicator: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    body: { flex: 1 },
  });
