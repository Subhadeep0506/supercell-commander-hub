import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * `.coc-panel` -- the card that wraps almost every section of the CoC screens.
 *
 * `overflow: hidden` matters: several pieces of fan-kit art are scaled up well
 * past their box (see ART_SCALE) and would otherwise bleed across the layout.
 */
export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={[s.panel, style]}>{children}</View>;
}

const build = (t: Theme) =>
  StyleSheet.create({
    panel: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: 16,
      overflow: 'hidden',
      ...t.shadow.panel,
    },
  });
