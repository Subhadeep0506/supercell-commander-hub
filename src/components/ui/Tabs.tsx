import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useHub } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

export type Tab<T extends string> = { id: T; label: string };

/**
 * `.coc-tabs` -- a two-up row with an underline on the selected tab.
 *
 * The reference styles these as borderless buttons inside a grid with a
 * bottom rule; the selected one gets `border-bottom: 3px solid var(--primary)`
 * and the primary colour.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  const { click } = useHub();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View style={s.row} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={[s.tab, active && s.tabActive]}
            onPress={() => {
              click();
              onChange(tab.id);
            }}
          >
            <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      marginBottom: 16,
    },
    tab: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 4,
      alignItems: 'center',
      // Reserves the space the active underline will occupy, so selecting a
      // tab does not shift the row by 3px.
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
      marginBottom: -1,
    },
    tabActive: { borderBottomColor: t.primary },
    label: { fontFamily: t.fonts.display, fontSize: 14, color: t.mutedForeground },
    labelActive: { color: t.primary },
  });
