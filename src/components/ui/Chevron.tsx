import Svg, { Path } from 'react-native-svg';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The expand/collapse arrow.
 *
 * Replaces the text glyphs this app used to scatter around for the job -- a
 * mix of `⌄ ⌃ › ▾ ▸` at 12-15px, drawn by whichever font happened to be on the
 * row. They were easy to miss, inconsistent between screens, and two of the
 * Clash Royale clan-log cards never got one at all.
 *
 * Drawn rather than typed because the glyphs are not reliably present in the
 * fan-kit faces and render at different weights across Android versions; a
 * stroked path is the same arrow everywhere and scales cleanly.
 *
 * This is for *expanding in place*. A `›` that opens a sheet is a different
 * affordance and is deliberately left alone.
 */
export function Chevron({
  open,
  size = 20,
  color,
  style,
}: {
  open: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  return (
    <View
      // Decorative. The pressable that owns it carries the label and the
      // expanded state, so announcing the arrow as well would say it twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[s.box, { width: size, height: size }, style]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/*
          Rotated by swapping the path rather than by a transform: Animated is
          not in play here, and a static flip keeps the stroke caps crisp at
          the small sizes these rows use.
        */}
        <Path
          d={open ? 'M6 15 L12 9 L18 15' : 'M6 9 L12 15 L18 9'}
          stroke={color ?? theme.primary}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({ box: { flexShrink: 0 } });
