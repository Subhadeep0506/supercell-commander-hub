import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Sheet } from './Sheet';

/**
 * A dropdown: a trigger that opens a Sheet of options.
 *
 * React Native ships no picker, and this project deliberately carries neither
 * reanimated nor gesture-handler, so an overlay anchored to the trigger would
 * have to be built from scratch. A Sheet is the shape the app already uses for
 * "choose one of these" -- the ranking location picker was exactly this, written
 * inline -- and it has the advantage of being reachable on a phone, where a
 * 250-row anchored menu is not.
 *
 * Lifted out of CrLeaderboard so the deck builder and the location picker share
 * one control rather than two that drift.
 */
export type SelectOption = {
  id: string;
  label: string;
  /** Optional artwork before the label, in both the trigger and the list. */
  icon?: ImageSourcePropType;
};

export function Select({
  options,
  value,
  onChange,
  accessibilityLabel,
  title,
  placeholder = 'Choose…',
  style,
}: {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  /** Also the sheet's heading when `title` is not given. */
  accessibilityLabel: string;
  title?: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [s.trigger, pressed && s.pressed, style]}
        onPress={() => setOpen(true)}
      >
        {selected?.icon ? (
          <Image
            source={selected.icon}
            style={s.icon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <Text style={s.triggerLabel} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={s.chevron}>▾</Text>
      </Pressable>

      <Sheet
        open={open}
        variant="plain"
        onClose={() => setOpen(false)}
        title={title ?? accessibilityLabel}
      >
        <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
          {options.map((option) => {
            const on = option.id === value;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [s.row, on && s.rowOn, pressed && s.pressed]}
                onPress={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.icon ? (
                  <Image
                    source={option.icon}
                    style={s.icon}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
                <Text style={[s.rowLabel, on && s.rowLabelOn]} numberOfLines={2}>
                  {option.label}
                </Text>
                {on ? <Text style={s.tick}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 12,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
    },
    pressed: { opacity: 0.75 },
    triggerLabel: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 12, color: t.cardForeground },
    chevron: { fontFamily: t.fonts.symbol, fontSize: 14, color: t.mutedForeground },
    icon: { width: 20, height: 22, flexShrink: 0 },

    list: { padding: 12, gap: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 13,
      paddingHorizontal: 10,
      borderRadius: t.radius.sm,
    },
    rowOn: { backgroundColor: t.muted },
    rowLabel: { flex: 1, minWidth: 0, fontFamily: t.fonts.sans, fontSize: 13, color: t.foreground },
    rowLabelOn: { color: t.accent },
    tick: { fontFamily: t.fonts.symbol, fontSize: 13, color: t.accent },
  });
