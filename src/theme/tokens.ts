import { Platform } from 'react-native';
import { crColors, darkColors, lightColors } from './colors';

/**
 * Which skin is active -- and it is **not** a function of which game is open.
 *
 * Clash Royale used to be a third skin here, a complete palette swap on a blue
 * background. That made switching games replace the whole theme object, which
 * invalidated every `useMemo(() => build(theme), [theme])` in the app and
 * re-ran `StyleSheet.create` in all of them: the lag on the game picker.
 *
 * Royale now takes the same neutrals as everything else and keeps its identity
 * through the `royale` accent block below, so the object is referentially
 * identical whichever game you are on and a switch costs nothing to repaint.
 */
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

/**
 * --arena-shadow: `0 4px 0 var(--arena-edge)` -- a hard offset block, not a
 * blur, which is what gives the Royale panels their stacked-plate look. The
 * zero radius is the whole effect; softening it reads as Clash of Clans.
 *
 * No longer the panel shadow for a whole skin -- it is reached through
 * `theme.royale.shadow` by the Royale components that want it, so Clash of
 * Clans keeps its soft card on the same screenful of tokens.
 */
function plateShadow(edge: string) {
  return {
    shadowColor: edge,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 0,
    shadowOpacity: 1,
    elevation: 4,
  } as const;
}

/**
 * The Clash Royale accent, in both schemes.
 *
 * Every value is a token the generator already emits into `crColors` -- this
 * assembles them, it does not invent colours. `colors.ts` is generated from
 * frontend/src/styles.css and must not be hand-edited, so `crColors` stays the
 * source of Royale hues and stops being a whole-app palette.
 *
 * **The two schemes do not share values, and that is the point.** `arena-edge`
 * is #00112d, which is *darker than the dark neutral background* (#151817):
 * carried over unchanged, every level badge, podium base and chest index would
 * sink into the page and vanish. On dark a Royale chip has to sit lighter than
 * the card it is on; on light it sits darker. Same role, opposite direction.
 */
type RoyaleAccent = {
  edge: string;
  chip: string;
  onChip: string;
  heading: string;
  highlight: string;
  onHighlight: string;
};

// Annotated rather than `as const`: literal types here would make `Theme` a
// union of the light and dark shapes, and every component that takes a `Theme`
// would have to accept both.
const ROYALE: Record<Scheme, RoyaleAccent> = {
  light: {
    /** The 4px plate rim under a panel. */
    edge: crColors['arena-edge'],
    /** Filled blue plinth: level badges, podium bases, chest indices. */
    chip: crColors['arena-heading'],
    /** Text and icons on `chip`. */
    onChip: crColors['foreground'],
    /** Section headings and rules. */
    heading: crColors['arena-heading'],
    /**
     * Gold, for the marks that must pop.
     *
     * **A fill, not a text colour on light** -- #f3c443 on #f3f6f5 is about
     * 1.7:1, fine behind dark text and unreadable as text.
     */
    highlight: crColors['primary'],
    onHighlight: crColors['primary-foreground'],
  },
  dark: {
    // A Royale navy that still reads against #151817, rather than one that is
    // darker than the page it sits on.
    edge: crColors['muted'],
    chip: crColors['arena-panel-flat'],
    onChip: crColors['arena-shine'],
    // Royale's own --accent: light enough to carry a heading on near-black,
    // where #0063ab would be muddy.
    heading: crColors['accent'],
    highlight: crColors['primary'],
    onHighlight: crColors['primary-foreground'],
  },
};

/**
 * The Brawl Stars accent, built on the same six slots as ROYALE.
 *
 * Hardcoded hexes rather than a `bsColors` block, because there is no Brawl
 * Stars palette to import: `crColors` exists only as the leftover of the
 * third theme that used to be swapped in wholesale, and adding a fourth of
 * those is the thing that arrangement was unwound to avoid.
 *
 * Purple plate, yellow highlight -- the game's own pairing. Yellow is a fill
 * and never a text colour on light, for the same contrast reason spelled out
 * under ROYALE.light.highlight: #ffc800 on #f3f6f5 is about 1.6:1.
 *
 * Deliberately *not* driven by the player's Ranked tier. `brawler-meta.json`
 * carries a HexColor per rank and it was tempting, but the theme object has to
 * stay referentially stable -- every component in the app holds a
 * `useMemo(() => build(theme), [theme])`, so a palette that changed when you
 * ranked up would re-run StyleSheet.create in all of them.
 */
const BRAWL: Record<Scheme, RoyaleAccent> = {
  light: {
    edge: '#4c2a85',
    chip: '#6d3bbf',
    onChip: '#f8f8f8',
    heading: '#6d3bbf',
    highlight: '#ffc800',
    onHighlight: '#2a1a3e',
  },
  dark: {
    // Lifted off the near-black page the way ROYALE.dark lifts its navy: the
    // light scheme's #4c2a85 is darker than #151817 and would read as a hole.
    edge: '#5b3a9e',
    chip: '#3b2560',
    onChip: '#e9d5ff',
    // Light enough to carry a heading on near-black, where #6d3bbf is muddy.
    heading: '#a78bfa',
    highlight: '#ffc800',
    onHighlight: '#2a1a3e',
  },
};

/**
 * What a game paints its own chrome with: the selected tab, and the rim on
 * every card.
 *
 * Six values rather than three, because the right colour is not the same in
 * both schemes. On dark each game's `fill` is the *light* member of its pair
 * -- gold, cyan, lilac -- so it carries dark text; on light two of the three
 * invert to a deep blue and a deep purple and carry white. Clash of Clans is
 * gold either way, which is why its `on` never changes.
 *
 * `rim` is a separate slot from `fill` on purpose. A 2px border runs the whole
 * way round every card on a screen, so it wants the quieter member of the
 * pair; a tab pill is one filled shape and wants the loud one. Using `fill`
 * for both made a Clash of Clans screen read as a sheet of gold boxes.
 *
 * **All three are present in both schemes, whichever game is open.** The theme
 * object must not depend on the current game -- every component holds a
 * `useMemo(() => build(theme), [theme])`, so a palette that changed on a game
 * switch would re-run `StyleSheet.create` across the whole app. Components
 * pick a game by passing a `tone`, never by reading one from global state.
 */
const GAME_CHROME = (scheme: Scheme, raw: Record<string, string>) =>
  ({
    coc: {
      fill: raw['coc-highlight']!,
      // Gold in both schemes, so the text on it is dark in both.
      on: ROYALE[scheme].onHighlight,
      rim: raw['coc-highlight']!,
    },
    cr: {
      fill: ROYALE[scheme].heading,
      on: scheme === 'dark' ? ROYALE[scheme].onHighlight : raw['primary-foreground']!,
      rim: ROYALE[scheme].heading,
    },
    bs: {
      fill: BRAWL[scheme].heading,
      on: scheme === 'dark' ? ROYALE[scheme].onHighlight : raw['primary-foreground']!,
      // The plate purple the panels already wore as a left edge, not the
      // lilac heading: at 2px round a whole card the heading glowed.
      rim: BRAWL[scheme].edge,
    },
  }) as const;

export type GameTone = keyof ReturnType<typeof GAME_CHROME>;

/** One palette per scheme. Both carry every game accent; neither is a game. */
function build(raw: Record<string, string>, scheme: Scheme) {
  return {
    scheme,
    /** Per-game tab fill and card rim. See GAME_CHROME. */
    chrome: GAME_CHROME(scheme, raw),
    /**
     * The Clash Royale accent, present in both schemes.
     *
     * Read by the components under components/cr/ and by nothing else, so a
     * Royale screen stays recognisably Royale -- blue plinths and headings,
     * gold highlights, the hard-edged plate panel -- on the same background,
     * cards and text as the rest of the app.
     */
    royale: { ...ROYALE[scheme], shadow: plateShadow(ROYALE[scheme].edge) },
    /**
     * The Brawl Stars accent, present in both schemes for the same reason the
     * Royale one is: read by components/bs/ and by nothing else, so the object
     * stays identical whichever game is open and a switch repaints nothing.
     */
    brawl: { ...BRAWL[scheme], shadow: plateShadow(BRAWL[scheme].edge) },
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

/**
 * Two skins, not three.
 *
 * `crColors` is still imported -- it is where the Royale accent above comes
 * from -- but it is no longer a palette the whole app can wear.
 */
export const themes = {
  light: build(lightColors, 'light'),
  dark: build(darkColors, 'dark'),
} as const;

export type Theme = typeof themes.light;
