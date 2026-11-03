import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { DetailSheetProvider } from '@/components/coc/clan/DetailSheetProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { RootStackParamList } from './routes';

import { CocHomeScreen } from '@/screens/coc/CocHomeScreen';
import { CocWarScreen } from '@/screens/coc/CocWarScreen';
import { CocClanScreen } from '@/screens/coc/CocClanScreen';
import { CocLeaderboardScreen } from '@/screens/coc/CocLeaderboardScreen';
import { CocBuilderScreen } from '@/screens/coc/CocBuilderScreen';
import { CocBookScreen } from '@/screens/coc/CocBookScreen';
import { PassportScreen } from '@/screens/PassportScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The reference app renders one chrome for every route -- TopBar above an
 * `<Outlet/>`, BottomNav below -- so the stack draws its own screens with
 * headers off and the chrome wraps the navigator instead of living inside it.
 */
export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="CocHome"
      screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { flex: 1 } }}
    >
      <Stack.Screen name="CocHome" component={CocHomeScreen} />
      <Stack.Screen name="CocWar" component={CocWarScreen} />
      <Stack.Screen name="CocClan" component={CocClanScreen} />
      <Stack.Screen name="CocLeaderboard" component={CocLeaderboardScreen} />
      <Stack.Screen name="CocBuilder" component={CocBuilderScreen} />
      <Stack.Screen name="CocBook" component={CocBookScreen} />
      <Stack.Screen name="Passport" component={PassportScreen} />
      <Stack.Screen name="Today" component={TodayPlaceholder} />
      <Stack.Screen name="CrHome" component={CrPlaceholder} />
      <Stack.Screen name="BsHome" component={BsPlaceholder} />
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

function Placeholder({ title, detail }: { title: string; detail: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <ScrollView contentContainerStyle={s.placeholder}>
      <Text style={s.placeholderTitle}>{title}</Text>
      <Text style={s.placeholderBody}>{detail}</Text>
    </ScrollView>
  );
}

const TodayPlaceholder = () => (
  <Placeholder
    title="Today"
    detail="The cross-game Today screen is built after Clash Royale and Brawl Stars, because its main panel is the Brawl Stars event rotation."
  />
);
const CrPlaceholder = () => (
  <Placeholder
    title="Clash Royale"
    detail="Royale screens are a later phase. The deck builder, saved decks, battle log and clan search all live here."
  />
);
const BsPlaceholder = () => (
  <Placeholder
    title="Brawl Stars"
    detail="Brawl screens are a later phase: brawlers, stats, clubs, maps, events and upgrades."
  />
);

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
