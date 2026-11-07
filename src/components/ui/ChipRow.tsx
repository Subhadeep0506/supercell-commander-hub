import { useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Button } from './Button';

export type Chip = {
  id: string;
  label: string;
  count?: number;
  /** Optional artwork before the label. The Clash Book filter uses `count`. */
  icon?: ImageSourcePropType;
};

/**
 * `.book-categories` -- a horizontally scrolling row of filter chips with the
 * scrollbar hidden, used by the Clash Book category filter.
 */
export function ChipRow({
  chips,
  value,
  onChange,
  accessibilityLabel,
  dense = false,
}: {
  chips: Chip[];
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
  /**
   * Drops the 38px of vertical padding the default carries.
   *
   * That padding is sized for the Clash Book filter, which is one row standing
   * alone above a grid. Stack three of these -- rarity, class and locked, as
   * the Brawl Stars collection does -- and it becomes 114px of whitespace
   * between the stats and the first tile. Opt in rather than changing the
   * default, which thirteen other call sites are laid out around.
   */
  dense?: boolean;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={s.row}
      style={[s.scroll, dense && s.scrollDense]}
    >
      {chips.map((chip) => {
        const active = chip.id === value;
        return (
          <Button
            key={chip.id}
            variant={active ? 'default' : 'outline'}
            size="sm"
            selected={active}
            accessibilityLabel={chip.label}
            onPress={() => onChange(chip.id)}
          >
            <View style={s.chipInner}>
              {chip.icon ? (
                <Image source={chip.icon} style={s.icon} resizeMode="contain" />
              ) : null}
              <Text style={[s.label, active && s.labelActive]}>{chip.label}</Text>
              {chip.count === undefined ? null : (
                <Text style={[s.count, active && s.labelActive]}>{chip.count}</Text>
              )}
            </View>
          </Button>
        );
      })}
    </ScrollView>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { flexGrow: 0, paddingTop: 16, paddingBottom: 22 },
    scrollDense: { paddingTop: 0, paddingBottom: 0 },
    row: { flexDirection: 'row', gap: 8 },
    chipInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    icon: { width: 16, height: 16 },
    label: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    labelActive: { color: t.primaryForeground },
    count: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground, opacity: 0.65 },
  });
