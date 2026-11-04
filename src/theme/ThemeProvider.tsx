import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { themes, type Theme } from './tokens';
import { registerFonts } from './fonts';
import { useHub } from '@/state/HubProvider';

export type { Theme };

const ThemeCtx = createContext<Theme>(themes.light);

// Injects @font-face on web; a no-op on native, where the fonts are linked
// into the build. Called at module scope so the faces are requested before
// first paint rather than after an effect runs.
registerFonts();

/**
 * Mirrors the reference app's `[data-game]` skins and its
 * `@media (prefers-color-scheme: dark)` block.
 *
 * The reference swaps skins by setting `document.documentElement.dataset.game`
 * and letting CSS cascade; there are no custom properties here, so the game is
 * read from the hub and the whole token set is swapped instead.
 *
 * Clash Royale ignores the system colour scheme deliberately -- its block in
 * styles.css has no dark counterpart, so it is one palette in both. Brawl
 * Stars slots in the same way when those screens land.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const { game } = useHub();
  const theme = useMemo(
    () => (game === 'cr' ? themes.cr : scheme === 'dark' ? themes.dark : themes.light),
    [game, scheme],
  );
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
