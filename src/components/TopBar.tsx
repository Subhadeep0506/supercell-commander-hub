import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_LOGOS } from '@/assets/art';
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

/**
 * Ported from the `TopBar` in components/hub-ui.tsx: the Commander Hub title
 * row, the Today/Passport links, and the three-up game chooser whose active
 * tab is underlined.
 *
 * All three tabs show their wordmark logo and nothing else. The reference
 * paired a logo with a short label, and used the in-game character icon for
 * Clash of Clans -- but the wordmarks already carry the game names, so the
 * label was duplication that squeezed each logo into half a tab.
 *
 * Logos are sized by height, not width: Brawl Stars is far squarer (1.25)
 * than Clash of Clans (2.17) and Clash Royale (2.0), so matching widths would
 * leave it towering over the other two.
 */
export function TopBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { game, setGame } = useHub();
  const active = gameFromRoute(useCurrentRouteName(), game);
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <View style={s.inner}>
        <View style={s.titleRow}>
          <Pressable onPress={() => navigate('Today')}>
            <Text style={s.brand}>COMMANDER HUB</Text>
          </Pressable>
          <View style={s.links}>
            <Pressable onPress={() => navigate('Today')}>
              <Text style={s.link}>Today</Text>
            </Pressable>
            <Pressable onPress={() => navigate('Passport')}>
              <Text style={s.link}>Passport</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.games} accessibilityLabel="Choose game">
          {GAMES.map((g) => {
            const on = active === g.id;
            const source = GAME_LOGOS[g.id];
            return (
              <Pressable
                key={g.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={g.name}
                style={[s.gameTab, on ? s.gameTabOn : s.gameTabOff]}
                onPress={() => {
                  setGame(g.id);
                  navigate(g.route);
                }}
              >
                {source ? <Image source={source} style={s.gameLogo} resizeMode="contain" /> : null}
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
      paddingBottom: 12,
    },
    brand: { fontFamily: t.fonts.display, fontSize: 14, color: t.primary },
    links: { flexDirection: 'row', gap: 16 },
    link: { fontFamily: t.fonts.sans, fontSize: 12, color: t.foreground },
    games: { flexDirection: 'row', gap: 8 },
    gameTab: {
      flex: 1,
      minWidth: 0,
      height: 62,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingBottom: 8,
      borderBottomWidth: 4,
    },
    gameTabOn: { borderBottomColor: t.primary, backgroundColor: t.muted },
    gameTabOff: { borderBottomColor: 'transparent', opacity: 0.65 },
    // Full tab width with a fixed height: resizeMode="contain" then binds on
    // height for all three, so every wordmark renders at the same cap height.
    gameLogo: { width: '100%', height: 38 },
  });
