import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { themes, type Theme } from './tokens';
import { registerFonts } from './fonts';

export type { Theme };

const ThemeCtx = createContext<Theme>(themes.light);

// Injects @font-face on web; a no-op on native, where the fonts are linked
// into the build. Called at module scope so the faces are requested before
// first paint rather than after an effect runs.
registerFonts();

/**
 * Mirrors the reference app's `@media (prefers-color-scheme: dark)` block.
 * Only Clash of Clans tokens exist so far; Clash Royale and Brawl Stars skins
 * slot in here when those screens land.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => (scheme === 'dark' ? themes.dark : themes.light), [scheme]);
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
