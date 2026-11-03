import { Platform } from 'react-native';
import { darkColors, lightColors } from './colors';

export type Scheme = 'light' | 'dark';

/**
 * Font families.
 *
 * On web these are the @font-face names registered in theme/fonts.web.ts.
 * On Android the family name is the filename in app/src/main/assets/fonts/,
 * which scripts/build-assets.mjs writes using each font's own PostScript name
 * (Clash-Bold, Clash-Regular, LilitaOne).
 */
export const fonts = {
  display: Platform.select({ web: '"Clash Display", sans-serif', default: 'Clash-Bold' })!,
  sans: Platform.select({ web: '"Clash Regular", sans-serif', default: 'Clash-Regular' })!,
  /**
   * For glyph-only controls. The fan-kit faces have no usable minus sign
   * (U+2212 renders as a dot), so the level stepper and similar symbol
   * buttons fall back to the platform font.
   */
  symbol: Platform.select({ web: 'system-ui, sans-serif', default: 'System' })!,
};

/** --radius: 0.5rem */
export const radius = { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 } as const;

/**
 * --coc-shadow and --book-shadow, expressed as RN style props.
 * react-native-web turns these back into boxShadow; Android uses elevation.
 */
const shadows = {
  light: {
    panel: {
      shadowColor: 'rgba(13, 25, 21, 0.05)',
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 12,
      shadowOpacity: 1,
      elevation: 2,
    },
    book: {
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      shadowOpacity: 1,
      elevation: 16,
    },
  },
  dark: {
    panel: {
      shadowColor: 'rgba(0, 0, 0, 0.12)',
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 12,
      shadowOpacity: 1,
      elevation: 2,
    },
    book: {
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      shadowOpacity: 1,
      elevation: 16,
    },
  },
} as const;

function build(raw: Record<string, string>, scheme: Scheme) {
  return {
    scheme,
    background: raw['background']!,
    foreground: raw['foreground']!,
    card: raw['card']!,
    cardForeground: raw['card-foreground']!,
    popover: raw['popover']!,
    popoverForeground: raw['popover-foreground']!,
    primary: raw['primary']!,
    primaryForeground: raw['primary-foreground']!,
    secondary: raw['secondary']!,
    secondaryForeground: raw['secondary-foreground']!,
    muted: raw['muted']!,
    mutedForeground: raw['muted-foreground']!,
    accent: raw['accent']!,
    accentForeground: raw['accent-foreground']!,
    destructive: raw['destructive']!,
    destructiveForeground: raw['destructive-foreground']!,
    success: raw['success']!,
    gold: raw['gold']!,
    gem: raw['gem']!,
    border: raw['border']!,
    input: raw['input']!,
    ring: raw['ring']!,
    cocHighlight: raw['coc-highlight']!,
    bookOverlay: raw['book-overlay']!,
    bookFrame: raw['book-frame']!,
    bookFrameLight: raw['book-frame-light']!,
    bookFrameText: raw['book-frame-text']!,
    rarity: {
      common: raw['r-common']!,
      rare: raw['r-rare']!,
      epic: raw['r-epic']!,
      legendary: raw['r-legendary']!,
      champion: raw['r-champion']!,
    },
    shadow: shadows[scheme],
    radius,
    fonts,
  };
}

export const themes = {
  light: build(lightColors, 'light'),
  dark: build(darkColors, 'dark'),
} as const;

export type Theme = typeof themes.light;
