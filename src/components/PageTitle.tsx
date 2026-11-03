import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** Ported from the `PageTitle` in components/hub-ui.tsx. */
export function PageTitle({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.wrap}>
      <Text style={s.kicker}>{kicker.toUpperCase()}</Text>
      <Text style={s.title}>{title}</Text>
      {children ? <Text style={s.body}>{children}</Text> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginBottom: 16 },
    kicker: { fontFamily: t.fonts.display, fontSize: 12, color: t.accent, letterSpacing: 0.5 },
    title: { marginTop: 8, fontFamily: t.fonts.display, fontSize: 30, color: t.primary },
    body: { marginTop: 8, fontSize: 13, lineHeight: 19, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
