import { useMemo, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useHub } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'default' | 'sm' | 'icon' | 'auto';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mirrors aria-selected in the reference markup -- used by the tab rows. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Plays the hub click sound. GameBtn did this for every button. */
  sound?: 'tap' | 'ok' | 'err' | false;
};

/**
 * Collapses the reference app's ui/button.tsx (shadcn variants) and the
 * `btn-game` utility into one component.
 *
 * The chunky 3D button in the utility is deliberately absent: styles.css
 * overrides it for this game with
 * `[data-game="coc"] .btn-game { border: 1px solid var(--border); box-shadow: none }`,
 * so Clash of Clans buttons are flat. The Royale and Brawl skins restore the
 * offset shadow and will need it back here.
 */
export function Button({
  children,
  variant = 'default',
  size = 'default',
  selected,
  style,
  textStyle,
  sound = 'ok',
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const { click } = useHub();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected }}
      disabled={disabled}
      onPress={(event) => {
        if (sound) click(sound);
        onPress?.(event);
      }}
      style={({ pressed }) => [
        s.base,
        s[`size_${size}`],
        s[`variant_${variant}`],
        pressed && s.pressed,
        disabled && s.disabled,
        style,
      ]}
      {...rest}
    >
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text style={[s.text, s[`text_${variant}`], s[`textSize_${size}`], textStyle]}>
          {children}
        </Text>
      ) : (
        <View style={s.row}>{children}</View>
      )}
    </Pressable>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // `pressed` replaces :active. The reference translates the whole button
    // down 3px, but only when the 3D shadow is present -- which it is not for
    // Clash of Clans -- so opacity is the honest equivalent here.
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.5 },

    size_default: { minHeight: 36, paddingHorizontal: 16, paddingVertical: 8 },
    size_sm: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 6 },
    size_icon: { width: 36, height: 36, paddingHorizontal: 0, paddingVertical: 0 },
    size_auto: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8 },

    variant_default: { backgroundColor: t.primary, borderColor: t.border },
    variant_secondary: { backgroundColor: t.secondary, borderColor: t.border },
    variant_outline: { backgroundColor: t.background, borderColor: t.border },
    variant_ghost: { backgroundColor: 'transparent' },
    variant_destructive: { backgroundColor: t.destructive, borderColor: t.border },
    variant_link: { backgroundColor: 'transparent', paddingHorizontal: 0, minHeight: 0 },

    text: { fontFamily: t.fonts.display, fontSize: 14, textAlign: 'center' },

    // Colour, by variant.
    text_default: { color: t.primaryForeground },
    text_secondary: { color: t.secondaryForeground },
    text_outline: { color: t.foreground },
    text_ghost: { color: t.foreground },
    text_destructive: { color: t.destructiveForeground },
    text_link: { color: t.primary, textDecorationLine: 'underline' },

    // Size, under its own prefix. `default` is a member of both ButtonVariant
    // and ButtonSize, so a shared `text_` namespace made the size lookup
    // resolve to the *variant* entry: every non-default variant at the default
    // size had its colour overwritten with primaryForeground. An outline
    // button then rendered near-black text on a near-black background.
    textSize_default: {},
    textSize_sm: { fontSize: 12 },
    textSize_icon: { fontSize: 18 },
    textSize_auto: {},
  });
