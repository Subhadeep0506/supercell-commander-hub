import { DarkTheme, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import type { Theme } from '@/theme/ThemeProvider';

/**
 * React Navigation keeps its own palette and paints the stack's content
 * background from it. Left at the default that is a light grey, which shows
 * through every screen regardless of the app's own theme.
 */
export function navigationTheme(theme: Theme): NavTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.card,
      text: theme.foreground,
      border: theme.border,
      notification: theme.destructive,
    },
  };
}
