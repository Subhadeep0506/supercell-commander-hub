import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { themes, type GameTone, type Theme } from './tokens';
import { registerFonts } from './fonts';

export type { GameTone, Theme };

const ThemeCtx = createContext<Theme>(themes.light);

// Injects @font-face on web; a no-op on native, where the fonts are linked
// into the build. Called at module scope so the faces are requested before
// first paint rather than after an effect runs.
registerFonts();

/**
 * Mirrors the reference app's `@media (prefers-color-scheme: dark)` block.
 *
 * **Deliberately independent of which game is open.** This used to read
 * `useHub().game` and hand back a third, all-blue Clash Royale palette. That
 * replaced the entire theme object on every switch, which invalidated the
 * `useMemo(() => build(theme), [theme])` every component in the app holds and
 * re-ran `StyleSheet.create` in all of them -- the lag on the game picker, and
 * the reason `TopBar` defers `setGame` to the next frame to get the highlighter
 * moving first.
 *
 * Royale now wears the same neutrals as everything else and keeps its identity
 * through `theme.royale`, so this object is referentially stable across a
 * switch and nothing has to repaint for it. Brawl Stars slots in the same way
 * when those screens land.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(
    () => (scheme === 'dark' ? themes.dark : themes.light),
    [scheme],
  );
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
