import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAV_ART } from '@/assets/art';
import { CR_ICONS } from '@/assets/royale';
import { GAME_NAV, gameFromRoute } from '@/lib/game-navigation';
import { useHub } from '@/state/HubProvider';
import type { RouteName } from '@/navigation/routes';
import { navigate, useCurrentRouteName } from '@/navigation/navigationRef';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * `.coc-nav-wrap` / `.coc-bottom` -- the floating bar, with a separate Clash
 * Book shortcut beside it on the Clash of Clans side.
 *
 * **Every tab shows its icon above its label, and all labels are always
 * visible.** The selected one is marked by a filled rounded panel rather than
 * by being the only one with words under it: the old bar expanded the active
 * item to `flex: 2.6` and hid every other label, which left four unexplained
 * pictures and made the bar reflow on each tap.
 *
 * Both games share this layout and differ only in palette, because the fill
 * is `theme.primary` -- gold under Royale, teal under Clash of Clans.
 *
 * Icons come from NAV_ART -- one consistent Clash Book render style, trimmed
 * to their content by the asset pipeline. The reference instead mixed
 * character art, a HUD button and a flat icon, then corrected each one with a
 * different transform (war 2.2x, builder 3.2x); every icon here sits in the
 * same box at the same size.
 */
export function BottomNav() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { game, click } = useHub();
  const current = useCurrentRouteName();
  const s = useMemo(() => build(theme), [theme]);

  const active = gameFromRoute(current, game);
  const items = GAME_NAV[active];
  // Brawl Stars keeps its own bar, which lands with its screens.
  if (active === 'bs' || !items.length) return null;

  const go = (route: RouteName) => {
    click();
    navigate(route);
  };

  if (active === 'cr') {
    // Royale's Home is a row in the bar rather than a separate button, and
    // there is no Clash Book shortcut beside it. Icons come from the arena
    // set, because NAV_ART has no card icon -- index-aligned with GAME_NAV.cr.
    // Index-aligned with GAME_NAV.cr: Home, Decks, Clan, Leaderboard.
    // Home is the blue crown, not the king: the king render is already the
    // app's generic Royale fallback (player portraits, missing arena badges),
    // so using it for a tab as well made the bar look like a placeholder.
    const crIcons = [CR_ICONS.crownBlue, CR_ICONS.cards, CR_ICONS.clanWars, CR_ICONS.trophy];
    return (
      <View
        style={[s.wrap, { paddingBottom: Math.max(12, insets.bottom) }]}
        pointerEvents="box-none"
      >
        <View style={s.row}>
          <View style={s.bar}>
            {items.map((item, i) => (
              <NavLink
                key={item.route}
                label={item.label === 'Leaderboard' ? 'Rankings' : item.label}
                source={crIcons[i]}
                active={current === item.route}
                onPress={() => go(item.route)}
                theme={theme}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  // Index-aligned with GAME_NAV.coc: War, Builder, Clan, Leaderboard.
  const iconFor = [NAV_ART.war, NAV_ART.builder, NAV_ART.clan, NAV_ART.rankings];

  return (
    <View style={[s.wrap, { paddingBottom: Math.max(12, insets.bottom) }]} pointerEvents="box-none">
      <View style={s.row}>
        <View style={s.bar}>
          <NavLink
            label="Home"
            source={NAV_ART.home}
            active={current === 'CocHome'}
            onPress={() => go('CocHome')}
            theme={theme}
          />
          {items.map((item, i) => (
            <NavLink
              key={item.route}
              label={item.label === 'Leaderboard' ? 'Rankings' : item.label}
              source={iconFor[i]}
              active={current === item.route}
              onPress={() => go(item.route)}
              theme={theme}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Clash Book"
          accessibilityState={{ selected: current === 'CocBook' }}
          onPress={() => go('CocBook')}
          style={[s.shortcut, current === 'CocBook' && s.shortcutOn]}
        >
          {NAV_ART.book ? (
            <Image source={NAV_ART.book} style={s.shortcutIcon} resizeMode="contain" />
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

function NavLink({
  label,
  source,
  active,
  onPress,
  theme,
}: {
  label: string;
  source: unknown;
  active: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  const s = useMemo(() => build(theme), [theme]);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.item, active && s.itemOn]}
    >
      <View style={s.iconBox}>
        {source ? (
          <Image source={source as never} style={s.icon} resizeMode="contain" />
        ) : null}
      </View>
      {/*
        `adjustsFontSizeToFit` is iOS-only, so the label is sized to fit the
        narrowest case instead: five tabs beside the Book shortcut on a 430pt
        screen leaves roughly 60pt each, and "Rankings" is the longest word.
      */}
      <Text style={[s.itemLabel, active && s.itemLabelOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
    // `stretch`, so the Book shortcut takes the bar's height instead of
    // sizing to its own icon. The bar has no fixed height any more -- it is
    // sized by the tallest tab, which is icon + gap + label + padding.
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    // A rounded rectangle, not a pill: the tabs inside are now rounded panels
    // of their own, and a pill's end caps crowded the first and last of them.
    bar: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 6,
      gap: 2,
      borderWidth: 1,
      borderColor: t.primary,
      backgroundColor: t.card,
      borderRadius: 18,
      ...t.shadow.panel,
    },
    // Equal width, every one of them: the active tab is marked by its fill,
    // not by taking more room than its neighbours.
    item: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 7,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: 12,
    },
    itemOn: { backgroundColor: t.primary },
    iconBox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
    icon: { width: 26, height: 26 },
    itemLabel: { fontFamily: t.fonts.display, fontSize: 10, color: t.foreground },
    itemLabelOn: { color: t.primaryForeground },
    // Matches the bar's corner radius and height so the two read as one
    // control split in a gap, rather than a bar beside a circle.
    shortcut: {
      width: 66,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.primary,
      borderRadius: 18,
      ...t.shadow.panel,
    },
    shortcutOn: { backgroundColor: t.primary },
    shortcutIcon: { width: 30, height: 30 },
  });
