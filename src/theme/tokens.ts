import { Platform } from 'react-native';
import { crColors, darkColors, lightColors } from './colors';

/**
 * Which skin is active. Clash of Clans follows the system light/dark setting;
 * `cr` is a third, scheme-independent skin, because the reference stylesheet
 * declares Clash Royale once and gives it no dark override.
 */
export type Scheme = 'light' | 'dark' | 'cr';

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
  /**
   * --arena-shadow: `0 4px 0 var(--arena-edge)` -- a hard offset block, not a
   * blur, which is what gives the Royale panels their stacked-plate look. The
   * zero radius is the whole effect; softening it reads as Clash of Clans.
   */
  cr: {
    panel: {
      shadowColor: crColors['arena-edge'],
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 0,
      shadowOpacity: 1,
      elevation: 4,
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

/**
 * `Scheme` names which shadow set and which skin is in play. Clash of Clans is
 * a light/dark pair; Clash Royale is a single palette, because the reference
 * stylesheet gives it no entry in the dark media query.
 */
function build(raw: Record<string, string>, scheme: Scheme) {
  return {
    scheme,
    /**
     * The --arena-* tokens, which only Clash Royale declares.
     *
     * Clash of Clans falls back to its own neutrals rather than these being
     * optional, so `Theme` stays one type and no component has to branch on
     * the game to read a colour.
     *
     * `hero` and `panel` are flat stand-ins for CSS gradients -- see
     * `flatten()` in scripts/oklch-to-hex.mjs for why, and note they are
     * generated from the gradient's own stops rather than hand-picked.
     */
    arena: {
      edge: raw['arena-edge'] ?? raw['border']!,
      shine: raw['arena-shine'] ?? raw['card']!,
      heading: raw['arena-heading'] ?? raw['primary']!,
      hero: raw['arena-hero-flat'] ?? raw['primary']!,
      panel: raw['arena-panel-flat'] ?? raw['card']!,
      overlay: raw['arena-overlay'] ?? raw['book-overlay']!,
    },
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
  cr: build(crColors, 'cr'),
} as const;

export type Theme = typeof themes.light;
