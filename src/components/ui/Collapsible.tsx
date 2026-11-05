import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useHub } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Chevron } from './Chevron';

/**
 * Replaces the `<details>` / `<summary>` pair in the Achievements section.
 *
 * `summary` receives the current open state so callers can render their own
 * count, the way the reference does with "N complete".
 *
 * **The chevron belongs to this component, not to callers.** It used to be
 * each caller's job, which produced three different glyphs at three sizes and
 * two call sites with no arrow at all -- nothing marked those rows as
 * expandable. Pass `chevron={false}` only where the summary genuinely has no
 * room for one.
 */
export function Collapsible({
  summary,
  children,
  initiallyOpen = false,
  accessibilityLabel,
  chevron = true,
  onToggle,
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
  chevron?: boolean;
  /**
   * Reports the new state to the caller. The open state stays owned here --
   * this only exists so a caller can defer work until the body is actually
   * showing, such as the clan filters waiting to fetch 250 locations.
   */
  onToggle?: (open: boolean) => void;
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
          // Computed outside the updater: StrictMode may invoke an updater
          // twice, which would fire onToggle twice for one tap.
          const next = !open;
          setOpen(next);
          onToggle?.(next);
        }}
        style={s.summary}
      >
        {/*
          The caller's summary is boxed so it takes the row and leaves the
          chevron pinned right, whatever shape it is -- several callers return
          a fragment of loose children, and one returns a two-row column.
        */}
        <View style={s.summarySlot}>{summary(open)}</View>
        {chevron ? <Chevron open={open} /> : null}
      </Pressable>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

const build = (_t: Theme) =>
  StyleSheet.create({
    summary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    summarySlot: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    body: { marginTop: 16, gap: 16 },
  });
