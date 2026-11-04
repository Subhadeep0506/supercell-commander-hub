import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { record, type ApiRecord, type GameResult } from '@/api/game-api';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** A successful body as a record, or undefined for an error or bad JSON. */
export function parsed(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

/** Loading text shared by every sheet layer. */
export function LayerLoading({ label }: { label: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <Text style={s.loading}>{label}</Text>;
}

/** Fills the sheet so a short empty state centres rather than hugging the top. */
export function LayerFill({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={s.fill}>{children}</View>;
}

export const sheetTitleStyle = (t: Theme) => ({
  flex: 1,
  minWidth: 0,
  color: t.primary,
  fontFamily: t.fonts.display,
  fontSize: 18,
});

const build = (t: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    loading: {
      paddingVertical: 48,
      textAlign: 'center',
      fontSize: 13,
      color: t.primary,
      fontFamily: t.fonts.sans,
    },
  });
