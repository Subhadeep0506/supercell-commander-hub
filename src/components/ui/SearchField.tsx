import { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { UI_ART } from '@/assets/art';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { noFocusRing } from './noFocusRing';

/**
 * `.book-search` -- the bordered field with the fan-kit magnifying glass,
 * used by the Clash Book, the leaderboard filter and the clan/player lookups.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmitEditing,
  autoCapitalize = 'none',
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  onSubmitEditing?: () => void;
  autoCapitalize?: 'none' | 'characters';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={[s.wrap, style]}>
      {UI_ART.search ? <Image source={UI_ART.search} style={s.icon} resizeMode="contain" /> : null}
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 15,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      borderRadius: 8,
    },
    icon: { width: 22, height: 25 },
    input: {
      flex: 1,
      minWidth: 0,
      padding: 0,
      color: t.foreground,
      fontFamily: t.fonts.sans,
      fontSize: 14,
      ...noFocusRing,
    },
  });
