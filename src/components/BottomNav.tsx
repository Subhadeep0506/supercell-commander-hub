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
 * `.coc-nav-wrap` / `.coc-bottom` -- the floating pill bar with a separate
 * circular Clash Book shortcut beside it.
 *
 * The selected item expands (`flex: 2.6`) and is the only one showing its
 * label; the rest are icon-only.
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
      {active ? <Text style={s.itemLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    bar: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      height: 64,
      padding: 7,
      borderWidth: 1,
      borderColor: t.primary,
      backgroundColor: t.card,
      borderRadius: 999,
      ...t.shadow.panel,
    },
    item: {
      flex: 1,
      minWidth: 0,
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 999,
    },
    // The selected pill grows and is the only one with a visible label.
    itemOn: { flex: 2.6, paddingHorizontal: 9, backgroundColor: t.primary },
    iconBox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
    icon: { width: 26, height: 26 },
    itemLabel: { fontFamily: t.fonts.display, fontSize: 11, color: t.primaryForeground },
    shortcut: {
      width: 64,
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.primary,
      borderRadius: 999,
      ...t.shadow.panel,
    },
    shortcutOn: { backgroundColor: t.primary },
    shortcutIcon: { width: 30, height: 30 },
  });
