import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useHub } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Replaces the `<details>` / `<summary>` pair in the Achievements section.
 *
 * `summary` receives the current open state so callers can render their own
 * chevron or count, the way the reference does with "N complete ›".
 */
export function Collapsible({
  summary,
  children,
  initiallyOpen = false,
  accessibilityLabel,
}: {
  summary: (open: boolean) => ReactNode;
  children: ReactNode;
  initiallyOpen?: boolean;
  /**
   * Names the toggle. Without one a screen reader announces the whole summary
   * -- badge, name, counts -- as the button's label, and nothing can address
   * the row to open it.
   */
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const theme = useTheme();
  const { click } = useHub();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          click();
          setOpen((v) => !v);
        }}
        style={s.summary}
      >
        {summary(open)}
      </Pressable>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

const build = (_t: Theme) =>
  StyleSheet.create({
    summary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    body: { marginTop: 16, gap: 16 },
  });
