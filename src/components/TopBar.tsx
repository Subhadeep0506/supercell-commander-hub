import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFetching } from '@tanstack/react-query';
import { GAME_ICONS } from '@/assets/art';
import { Spinner } from '@/components/ui/Shimmer';
import { gameFromRoute } from '@/lib/game-navigation';
import { useHub } from '@/state/HubProvider';
import type { Game } from '@/api/game-api';
import type { RouteName } from '@/navigation/routes';
import { navigate, useCurrentRouteName } from '@/navigation/navigationRef';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

export const GAMES: { id: Game; name: string; short: string; route: RouteName }[] = [
  { id: 'coc', name: 'Clash of Clans', short: 'Clans', route: 'CocHome' },
  { id: 'cr', name: 'Clash Royale', short: 'Royale', route: 'CrHome' },
  { id: 'bs', name: 'Brawl Stars', short: 'Brawl', route: 'BsHome' },
];

/** Height of the tab strip. The icon is square inside it. */
const TAB_HEIGHT = 54;
const ICON = 34;

/**
 * Ported from the `TopBar` in components/hub-ui.tsx: the Commander Hub title
 * row, the Today/Passport links, and the three-up game chooser.
 *
 * **Square app icons, not wordmarks.** Three wide wordmarks filled the bar
 * edge to edge and still read as a static billboard -- nothing moved when you
 * switched, and the only mark of the active game was a 4px underline. Each tab
 * is now its icon over a raised panel that slides between them, which is the
 * one piece of motion that tells you the switch registered before the next
 * screen has finished fetching.
 */
export function TopBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { game, setGame } = useHub();
  const active = gameFromRoute(useCurrentRouteName(), game);
  const fetching = useIsFetching();
  const s = useMemo(() => build(theme), [theme]);

  /*
   * The tab the user just pressed, before the navigation has landed.
   *
   * `active` is derived from the current *route*, so without this the
   * highlighter could not move until the destination screen had mounted and
   * re-themed -- which is the lag being complained about, just with an
   * animation attached to the wrong end of it. The optimistic value is
   * dropped as soon as the route agrees with it.
   */
  const [pending, setPending] = useState<Game | undefined>();
  const selected = pending ?? active;
  useEffect(() => {
    if (pending && pending === active) setPending(undefined);
  }, [pending, active]);

  const index = Math.max(
    0,
    GAMES.findIndex((g) => g.id === selected),
  );

  // Measured rather than assumed: the strip is `maxWidth: 768` inside whatever
  // the screen gives it, so a third of the window is the wrong number on a
  // tablet and on the browser at any width.
  const [tabWidth, setTabWidth] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // react-native-web cannot drive layout properties off the main thread and
    // warns when asked; Android wants it. Same gate as Shimmer.
    Animated.timing(slide, {
      toValue: index,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [index, slide]);

  const onPick = (g: (typeof GAMES)[number]) => {
    if (g.id === selected) return;
    /*
     * Two steps, one frame apart, and the order is the whole point.
     *
     * `setGame` re-themes the entire tree -- ThemeProvider keys off it, so
     * every screen rebuilds its StyleSheet -- and `navigate` mounts a screen
     * whose queries have not run. Doing both on the tap meant nothing moved
     * until all of it had finished, which read as the tap not registering.
     *
     * So the cheap, local state change goes first: only TopBar re-renders, the
     * highlighter starts sliding immediately. The expensive pair runs on the
     * next frame, by which time the user has already been told the tap landed.
     */
    setPending(g.id);
    requestAnimationFrame(() => {
      setGame(g.id);
      navigate(g.route);
    });
  };

  return (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <View style={s.inner}>
        <View style={s.titleRow}>
          <Pressable onPress={() => navigate('Today')}>
            <Text style={s.brand}>COMMANDER HUB</Text>
          </Pressable>
          {/*
            One indicator for the whole app, beside the title.

            Switching games navigates to a screen whose queries have not run
            yet, and until they answer the screen is legitimately empty -- which
            looked like the switch had hung. This says "still fetching" wherever
            you are, including on the screens whose own skeletons only cover
            their first load.
          */}
          {fetching > 0 ? <Spinner style={s.busy} /> : null}
          <View style={s.links}>
            <Pressable onPress={() => navigate('Today')}>
              <Text style={s.link}>Today</Text>
            </Pressable>
            <Pressable onPress={() => navigate('Passport')}>
              <Text style={s.link}>Passport</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={s.games}
          accessibilityLabel="Choose game"
          onLayout={(e: LayoutChangeEvent) =>
            setTabWidth(e.nativeEvent.layout.width / GAMES.length)
          }
        >
          {/* The raised panel, behind the icons. Rendered only once the strip
              has been measured, so it never flashes at the wrong width. */}
          {tabWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                s.highlight,
                {
                  width: tabWidth,
                  transform: [
                    {
                      translateX: slide.interpolate({
                        inputRange: [0, GAMES.length - 1],
                        outputRange: [0, tabWidth * (GAMES.length - 1)],
                      }),
                    },
                  ],
                },
              ]}
            />
          ) : null}

          {GAMES.map((g) => {
            const on = selected === g.id;
            const source = GAME_ICONS[g.id];
            return (
              <Pressable
                key={g.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={g.name}
                style={s.gameTab}
                onPress={() => onPick(g)}
              >
                {source ? (
                  <Image
                    source={source}
                    style={[s.gameIcon, !on && s.gameIconOff]}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={[s.gameFallback, !on && s.gameIconOff]}>{g.short}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    header: {
      borderBottomWidth: 2,
      borderBottomColor: t.border,
      backgroundColor: t.background,
    },
    inner: { width: '100%', maxWidth: 768, alignSelf: 'center', paddingHorizontal: 12 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingBottom: 10,
    },
    brand: { fontFamily: t.fonts.display, fontSize: 14, color: t.primary },
    // marginRight: 'auto' so the spinner sits beside the title rather than
    // pushing the links around as it appears and disappears.
    busy: { marginLeft: 8, marginRight: 'auto', paddingVertical: 0 },
    links: { flexDirection: 'row', gap: 16 },
    link: { fontFamily: t.fonts.sans, fontSize: 12, color: t.foreground },

    games: { flexDirection: 'row', height: TAB_HEIGHT, marginBottom: 8 },
    gameTab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
    // Elevated rather than underlined: it reads as the selected tab lifting
    // out of the bar, and it is the thing that slides.
    highlight: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      borderRadius: 14,
      backgroundColor: t.muted,
      borderWidth: 2,
      borderColor: t.primary,
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    gameIcon: { width: ICON, height: ICON, borderRadius: 8 },
    gameIconOff: { opacity: 0.45 },
    gameFallback: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
  });
