import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { record, type ApiRecord, type GameResult } from '@/api/game-api';
import { SkeletonBlock, SkeletonRows } from '@/components/ui/Shimmer';
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

/**
 * The loading state shared by every sheet layer.
 *
 * A sheet opens empty and fills in, so this traces the shape of what is
 * coming -- a header block over a list -- rather than printing the label as a
 * line of text in the middle of a blank panel. `label` is kept as the
 * accessibility announcement so the ~8 call sites need no change.
 */
export function LayerLoading({ label }: { label: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.loading}>
      <SkeletonBlock height={72} label={label} />
      <SkeletonRows rows={5} avatar label={label} />
    </View>
  );
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

const build = (_t: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    loading: { padding: 16, gap: 10 },
  });
