import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useHub } from '@/state/HubProvider';
import { useTheme, type GameTone, type Theme } from '@/theme/ThemeProvider';

export type Tab<T extends string> = { id: T; label: string };

/** Padding between the track's edge and the pill, on all four sides. */
const INSET = 4;

/**
 * A segmented control: a tinted track with a filled pill that slides onto the
 * selected tab.
 *
 * Replaces the reference's `.coc-tabs` -- borderless buttons over a bottom rule
 * with a 3px underline on the selected one. That read as unfinished next to the
 * rest of the app, where every other control is a rounded panel, and the
 * underline appeared instantly with nothing connecting the old position to the
 * new one.
 *
 * The pill is a single absolutely-positioned `Animated.View` rather than a
 * background on the active tab: one element that moves says "this is the same
 * selection, now over there", where two elements cross-fading says "something
 * disappeared and something else appeared".
 *
 * Only `translateX` animates, so the whole thing runs on the native driver.
 * Width is derived from the measured track and the tab count instead -- tabs
 * are equal-width by construction (`flex: 1`), so no per-tab measurement is
 * needed and there is no layout pass between the tap and the movement.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  tone,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (v: T) => void;
  /**
   * Which game's colour the selected pill wears -- gold, blue or purple.
   *
   * **Required, and passed rather than inferred.** `useHub().game` is set by
   * exactly one thing, the logo picker in TopBar, and nothing about opening a
   * sheet or navigating updates it; a Brawl Stars leaderboard reached while
   * the hub still said `coc` would come out gold. Every call site knows its
   * own game statically, so it says so, and a new one that forgets is a type
   * error rather than a wrong colour.
   */
  tone: GameTone;
}) {
  const theme = useTheme();
  const { click } = useHub();
  const s = useMemo(() => build(theme), [theme]);
  const chrome = theme.chrome[tone];

  /*
   * The track's inner width, measured. Zero until the first layout, which is
   * what `ready` below tests: a pill drawn at zero width would flash as a
   * hairline on the first frame of every screen that has tabs.
   */
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  const slide = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: index,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, slide]);

  const cell = tabs.length > 0 ? (trackWidth - INSET * 2) / tabs.length : 0;
  const ready = trackWidth > 0 && tabs.length > 0;

  /*
   * `interpolate` rejects a single-entry range, and a one-tab set is legal
   * even if nothing passes one today -- the pill then simply never moves.
   */
  const stops = tabs.length > 1 ? tabs.map((_, i) => i) : [0, 1];
  const offsets = stops.map((i) => i * cell);

  return (
    <View
      style={s.track}
      accessibilityRole="tablist"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {ready ? (
        <Animated.View
          // Decorative: the selection is already announced by each tab's own
          // `accessibilityState`, and a second announcement for the same fact
          // is noise in a screen reader.
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[
            s.pill,
            {
              backgroundColor: chrome.fill,
              width: cell,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: stops,
                    outputRange: offsets,
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={s.tab}
            onPress={() => {
              click();
              onChange(tab.id);
            }}
          >
            {/*
              12px, not the old 14: three tabs across ("Home Village",
              "Builder Base", "Clan Capital") now share the track's inner width
              minus the pill's own padding, and at 14 the longest of them
              wrapped on a 430pt screen.
            */}
            <Text
              style={[s.label, active && { color: chrome.on }]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      alignItems: 'stretch',
      padding: INSET,
      marginBottom: 16,
      borderRadius: 14,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    // The fill is per game and set inline; everything else is shared.
    pill: {
      position: 'absolute',
      top: INSET,
      bottom: INSET,
      left: INSET,
      borderRadius: 10,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
  });
