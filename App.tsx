import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { HubProvider } from '@/state/HubProvider';
import { AppShell, RootNavigator } from '@/navigation/RootNavigator';
import { linking } from '@/navigation/linking';
import { navigationRef, syncCurrentRoute } from '@/navigation/navigationRef';
import { navigationTheme } from '@/navigation/navigationTheme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Root() {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme(theme)}
        linking={linking}
        // Keeps the chrome's idea of the active route in step; it renders
        // outside the navigator and cannot use useNavigationState.
        onReady={syncCurrentRoute}
        onStateChange={syncCurrentRoute}
        fallback={<ActivityIndicator color={theme.primary} style={styles.fill} />}
      >
        <AppShell>
          <RootNavigator />
        </AppShell>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    /*
      Gesture handler's root view, and it has to be the outermost thing here.
      It is "the entry point for all gestures": a GestureDetector that is not a
      descendant of one simply never recognises anything.

      That used to be a silent failure, which is how pull-to-refresh shipped
      broken twice. It is not silent any more -- RNGH throws in __DEV__ on
      native if a detector cannot find this, and App.test.tsx asserts it is
      here. Note the check is skipped on web, so the browser cannot catch its
      absence; the test is what covers that gap.
    */
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <HubProvider>
            <ThemeProvider>
              <Root />
            </ThemeProvider>
          </HubProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
