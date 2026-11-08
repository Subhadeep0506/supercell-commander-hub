import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { DetailSheetProvider } from '@/components/detail/DetailSheetProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { RootStackParamList } from './routes';

import { CocHomeScreen } from '@/screens/coc/CocHomeScreen';
import { CocWarScreen } from '@/screens/coc/CocWarScreen';
import { CocWarRoundScreen } from '@/screens/coc/CocWarRoundScreen';
import { CocClanScreen } from '@/screens/coc/CocClanScreen';
import { CocLeaderboardScreen } from '@/screens/coc/CocLeaderboardScreen';
import { CocBuilderScreen } from '@/screens/coc/CocBuilderScreen';
import { CocBookScreen } from '@/screens/coc/CocBookScreen';
import { CrHomeScreen } from '@/screens/cr/CrHomeScreen';
import { CrDecksScreen } from '@/screens/cr/CrDecksScreen';
import { CrClanScreen } from '@/screens/cr/CrClanScreen';
import { CrLeaderboardScreen } from '@/screens/cr/CrLeaderboardScreen';
import { BsHomeScreen } from '@/screens/bs/BsHomeScreen';
import { BsStatsScreen } from '@/screens/bs/BsStatsScreen';
import { BsClubScreen } from '@/screens/bs/BsClubScreen';
import { BsLeaderboardScreen } from '@/screens/bs/BsLeaderboardScreen';
import { PassportScreen } from '@/screens/PassportScreen';
import { TodayScreen } from '@/screens/TodayScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The reference app renders one chrome for every route -- TopBar above an
 * `<Outlet/>`, BottomNav below -- so the stack draws its own screens with
 * headers off and the chrome wraps the navigator instead of living inside it.
 */
export function RootNavigator() {
  return (
    // Today is the landing screen, which is also the root path it already
    // owned in ROUTE_PATHS -- the two used to disagree, so opening the app and
    // opening its URL gave different screens.
    <Stack.Navigator
      initialRouteName="Today"
      screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { flex: 1 } }}
    >
      <Stack.Screen name="CocHome" component={CocHomeScreen} />
      <Stack.Screen name="CocWar" component={CocWarScreen} />
      <Stack.Screen name="CocWarRound" component={CocWarRoundScreen} />
      <Stack.Screen name="CocClan" component={CocClanScreen} />
      <Stack.Screen name="CocLeaderboard" component={CocLeaderboardScreen} />
      <Stack.Screen name="CocBuilder" component={CocBuilderScreen} />
      <Stack.Screen name="CocBook" component={CocBookScreen} />
      <Stack.Screen name="Passport" component={PassportScreen} />
      <Stack.Screen name="Today" component={TodayScreen} />
      <Stack.Screen name="CrHome" component={CrHomeScreen} />
      <Stack.Screen name="CrDecks" component={CrDecksScreen} />
      <Stack.Screen name="CrClan" component={CrClanScreen} />
      <Stack.Screen name="CrLeaderboard" component={CrLeaderboardScreen} />
      <Stack.Screen name="BsHome" component={BsHomeScreen} />
      <Stack.Screen name="BsStats" component={BsStatsScreen} />
      <Stack.Screen name="BsClub" component={BsClubScreen} />
      <Stack.Screen name="BsLeaderboard" component={BsLeaderboardScreen} />
    </Stack.Navigator>
  );
}

/** Chrome shared by every screen, matching the reference's root layout. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    // The clan sheet lives out here with the rest of the chrome: it opens over
    // any screen, and one instance serves all of them.
    <DetailSheetProvider>
      <View style={s.root}>
        <TopBar />
        <View style={s.body}>{children}</View>
        <BottomNav />
      </View>
    </DetailSheetProvider>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    body: { flex: 1 },
    placeholder: {
      padding: 24,
      paddingTop: 48,
      alignItems: 'center',
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    placeholderTitle: { fontFamily: t.fonts.display, fontSize: 24, color: t.primary },
    placeholderBody: {
      marginTop: 12,
      textAlign: 'center',
      fontFamily: t.fonts.sans,
      fontSize: 13,
      lineHeight: 20,
      color: t.mutedForeground,
    },
  });
