import { isValidElement, useMemo, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { arenaArt, arenaEvolutionArt } from '@/assets/arena';
import {
  CR_ICONS,
  arenaBadgeArt,
  clanBadgeArt,
  type CrIconName,
} from '@/assets/royale';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { record, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { useRefresh } from '@/hooks/use-refresh';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Shared Clash Royale pieces, ported from the `.arena-*` and `.royale-*` rules
 * in frontend/src/styles.css.
 *
 * The Clash of Clans equivalent is CocBits. Kept separate rather than merged
 * because the two designs still differ in shape -- Royale stacks hard-edged
 * plates, Clash uses a soft card -- but they no longer differ in palette.
 * Royale used to repaint the whole app blue; it now takes the same background,
 * cards and text as everything else and carries its identity in
 * `theme.royale`: blue plinths and headings, gold for what must pop, and the
 * `0 4px 0` plate shadow that is the actual Royale shape.
 */

/** `12345` -> `12,345`; anything non-numeric falls through to `text()`. */
export function num(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : text(value);
}

/**
 * A URL field, or undefined.
 *
 * Deliberately not `text()`, which renders a missing value as an em-dash --
 * perfect for a label, and a broken image request when handed to an `<Image>`
 * as a uri.
 */
export function url(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Card, tower-troop or UI artwork.
 *
 * Bundled art wins over the CDN deliberately: all 123 cards and 4 tower troops
 * ship in the APK, so the common path never touches the network. Only
 * evolution art falls through to `iconUrls.evolutionMedium`, because the fan
 * kit covers 18 of the 57 cards that evolve.
 */
export function CrArt({
  name,
  iconUrl,
  evolved = false,
  style,
}: {
  name: unknown;
  iconUrl?: string;
  evolved?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const bundled = evolved ? arenaEvolutionArt(name) ?? arenaArt(name) : arenaArt(name);
  if (bundled) {
    return (
      <Image
        source={bundled}
        style={[s.art, style]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  if (iconUrl) return <RemoteImage uri={iconUrl} style={[s.art, style] as StyleProp<ImageStyle>} />;
  // `.arena-art-fallback` -- initials rather than a hole in the grid.
  return (
    <View style={[s.art, s.artFallback, style as StyleProp<ViewStyle>]}>
      <Text style={s.artFallbackText}>
        {typeof name === 'string' ? name.slice(0, 2).toUpperCase() : '?'}
      </Text>
    </View>
  );
}

/** A standalone icon from the arena set. */
export function CrIcon({
  name,
  size = 24,
  style,
}: {
  name: CrIconName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const source = CR_ICONS[name];
  if (!source) return null;
  return (
    <Image
      source={source}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * `.arena-shell` -- the page scroller, and nothing else.
 *
 * It used to open every screen with an eyebrow, the screen's name, the Clash
 * Royale wordmark and an Accounts button. All four are gone: the TopBar above
 * already names the game and offers Passport, the BottomNav below already
 * marks which tab you are on, and the account is whichever passport is active.
 * That header was three restatements and a shortcut, costing a third of the
 * first screenful before any content appeared.
 */
export function CrShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  // Wired once here rather than per screen -- see the note on CocShell.
  const { refreshing, onRefresh } = useRefresh();
  return (
    <PullToRefresh
      refreshing={refreshing}
      onRefresh={onRefresh}
      style={s.scroll}
      contentContainerStyle={s.shell}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </PullToRefresh>
  );
}

/** `.arena-section-heading` -- title, optional count, optional right slot. */
export function SectionHead({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionHeadLeft}>
        <Text style={s.h2} numberOfLines={2}>
          {title}
        </Text>
        {count !== undefined && <Text style={s.sectionCount}>{num(count)}</Text>}
      </View>
      {children}
    </View>
  );
}

/**
 * `.arena-section` -- a titled card.
 *
 * Was a bare block separated from its neighbours by a rule under the heading,
 * while every Clash of Clans section sat in a Panel. One app, two ways of
 * grouping things. It is a card in both games now; the heading keeps its
 * title and count but loses the rule, which the card edge makes redundant.
 *
 * Do not nest one of these inside another card -- a card within a card reads
 * as a rendering fault rather than as structure. No caller does today.
 */
export function Section({
  title,
  count,
  right,
  children,
}: {
  title: string;
  count?: number;
  right?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={[s.section, s.sectionCard]}>
      <SectionHead title={title} count={count}>
        {right}
      </SectionHead>
      {children}
    </View>
  );
}

/**
 * `.arena-metric` -- one labelled figure.
 *
 * `value` takes an element as well as a scalar, so a figure that carries its own
 * art -- the crown records below -- can sit in the grid without a second
 * component. A plain value still goes through `num()`, which is what every
 * existing call site relies on.
 */
export function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode | unknown;
  icon?: CrIconName;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.metric}>
      {icon && <CrIcon name={icon} size={24} style={s.metricIcon} />}
      <View style={s.metricText}>
        <Text style={s.metricLabel} numberOfLines={2}>
          {label}
        </Text>
        {isValidElement(value) ? (
          <View style={s.metricValueSlot}>{value}</View>
        ) : (
          <Text style={s.metricValue} numberOfLines={1}>
            {num(value)}
          </Text>
        )}
      </View>
    </View>
  );
}

/** `.arena-metrics` -- a two-column run of metrics. */
export function MetricGrid({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={s.metrics}>{children}</View>;
}

/* -------------------------------------------------------------------------- */
/* Crowns                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Blue is yours, red is theirs -- across the whole app.
 *
 * A win count takes the blue crown and a loss count the red one, and in a pair
 * your figure is blue and the opponent's red. This is a deliberate house rule
 * rather than the game's: Clash Royale draws *your* crowns red and the
 * opponent's blue in battle, which is the opposite way round and reads as a
 * warning colour on a result you won. Every call site goes through these two
 * components so the two conventions cannot end up mixed on one screen.
 *
 * Always one crown per figure, never one per crown counted -- "17 crowns" is a
 * tally beside an icon, not seventeen pictures.
 */
function CrownFigure({ value, tone, size }: { value: unknown; tone: 'blue' | 'red'; size: number }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.crownFigure}>
      <Text style={s.crownValue}>{num(value)}</Text>
      <CrIcon name={tone === 'blue' ? 'crownBlue' : 'crownRed'} size={size} />
    </View>
  );
}

/** `17🔵 · 11🔴 · 2D` -- a win/loss record. */
export function CrownRecord({
  wins,
  losses,
  draws = 0,
  size = 14,
}: {
  wins: number;
  losses: number;
  draws?: number;
  size?: number;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.crownRow}>
      <CrownFigure value={wins} tone="blue" size={size} />
      <Text style={s.crownSep}>·</Text>
      <CrownFigure value={losses} tone="red" size={size} />
      {draws > 0 ? <Text style={s.crownDraw}>{`· ${num(draws)}D`}</Text> : null}
    </View>
  );
}

/** `3🔵–1🔴` -- crowns in one battle, or totalled across a window. */
export function CrownPair({
  mine,
  theirs,
  size = 14,
}: {
  mine: number | null;
  theirs: number | null;
  size?: number;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.crownRow}>
      <CrownFigure value={mine ?? '—'} tone="blue" size={size} />
      <Text style={s.crownSep}>–</Text>
      <CrownFigure value={theirs ?? '—'} tone="red" size={size} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Player portraits                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The picture that stands for a player.
 *
 * Three steps, in descending order of how much it says about *this* account:
 *
 *   1. their arena badge, which changes as they climb;
 *   2. their clan crest, which is at least real art about them;
 *   3. a framed king.
 *
 * Step 2 exists because step 1 misses far more often than it looks. The arena
 * id map was generated from RoyaleAPI/cr-api-assets, last published 2026-03-05,
 * and every arena added since -- Spirit Square, Magic Academy, Royal Road and
 * three more -- resolves to nothing. On the calibration clan that is 14 of 35
 * members, so the bare king used to be the first thing you saw on four player
 * cards in ten. See assets-req.md #15-20.
 *
 * The king is framed rather than floated so the miss reads as a designed empty
 * state instead of a stray picture dropped on the panel.
 */
export function PlayerPortrait({
  player,
  badgeId,
  size = 60,
  fallback = 'king',
  style,
}: {
  /** A player record, or nothing while one is still loading. */
  player: ApiRecord | null | undefined;
  /**
   * A clan crest known from context rather than from the record.
   *
   * A clan's own `memberList` rows carry no `clan` field -- they are already
   * inside one -- so the crest for step 2 has to come from the panel above
   * them.
   */
  badgeId?: unknown;
  size?: number;
  /** Overrides the king for a surface where something truer is known. */
  fallback?: CrIconName;
  /** Typed as an image style, cast for the framed branch -- same as CrArt. */
  style?: StyleProp<ImageStyle>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const art = player
    ? arenaBadgeArt(record(player['arena'])['id']) ??
      clanBadgeArt(record(player['clan'])['badgeId'] ?? badgeId)
    : undefined;

  if (art) {
    return (
      <Image
        source={art}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={[s.portraitFrame, { width: size, height: size }, style as StyleProp<ViewStyle>]}
    >
      <CrIcon name={fallback} size={Math.round(size * 0.68)} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Podium                                                                      */
/* -------------------------------------------------------------------------- */

/** One slot on the podium: art, name, subtitle, score. */
export type PodiumPlace = {
  key: string;
  rank: number;
  art: ReactNode;
  name: string;
  subtitle: string;
  score: unknown;
  onPress: () => void;
};

/**
 * The top three, raised on a plinth.
 *
 * Mirrors the Clash of Clans leaderboard's own podium rather than inventing a
 * second shape for it -- the ladders answer the same question and should read
 * the same -- in Royale's panel-and-hard-shadow dressing rather than Clash's
 * soft card.
 *
 * Rendered 2-1-3 so the winner stands in the middle on the tallest base, which
 * is why `places` is reordered here rather than at the call site.
 *
 * Shared by the rankings and the clan roster: a clan's Members tab is a ladder
 * too, and was the one place that showed its leaders as three ordinary rows.
 */
export function Podium({ places, icon }: { places: PodiumPlace[]; icon: CrIconName }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (places.length < 3) return null;
  const order = [places[1]!, places[0]!, places[2]!];

  return (
    <View style={s.podium}>
      {order.map((place, i) => (
        <Pressable
          key={place.key}
          accessibilityRole="button"
          accessibilityLabel={`View ${place.name}`}
          style={({ pressed }) => [s.podiumPlace, pressed && s.pressed]}
          onPress={place.onPress}
        >
          <View style={[s.podiumArt, i === 1 && s.podiumArtWinner]}>{place.art}</View>
          <View style={[s.medal, i === 1 && s.medalWinner]}>
            <Text style={[s.medalText, i === 1 && s.medalTextWinner]}>{place.rank}</Text>
          </View>
          <Text style={s.podiumName} numberOfLines={1}>
            {place.name}
          </Text>
          {place.subtitle ? (
            <Text style={s.podiumSub} numberOfLines={1}>
              {place.subtitle}
            </Text>
          ) : null}
          <View style={s.podiumScoreRow}>
            <CrIcon name={icon} size={16} />
            <Text style={s.podiumScore} numberOfLines={1}>
              {num(place.score)}
            </Text>
          </View>
          <View
            style={[s.podiumBase, i === 1 ? s.podiumBaseWinner : i === 2 && s.podiumBaseThird]}
          />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Art for a game mode.
 *
 * The icon set is hand-sourced and smaller than the mode list, so several
 * share: anything battle-shaped gets crossed swords, anything bracketed gets the
 * tournament wreath. Better a right-feeling icon on every row than art on three
 * and nothing on four.
 *
 * Shared by the ladder chips and the per-mode record rows, which name the same
 * modes and had no reason to picture them differently.
 */
export function modeIcon(name: string): ImageSourcePropType {
  const n = name.toLowerCase();
  if (n.includes('merge tactics')) return CR_ICONS.target;
  if (n.includes('2v2') || n.includes('touchdown')) return CR_ICONS.clanWars;
  if (n.includes('draft') || n.includes('journey')) return CR_ICONS.tournament;
  if (n.includes('retro')) return CR_ICONS.book;
  if (n.includes('ladder') || n.includes('ranked')) return CR_ICONS.ranked;
  if (n.includes('river') || n.includes('clan war')) return CR_ICONS.clanWars;
  if (n.includes('challenge') || n.includes('tournament')) return CR_ICONS.tournament;
  return CR_ICONS.battle;
}

/** `.arena-rank-row` -- rank, name/subtitle, trailing score. Tappable. */
export function RankRow({
  rank,
  podium = false,
  art,
  title,
  subtitle,
  score,
  icon = 'trophy',
  onPress,
}: {
  rank?: ReactNode;
  podium?: boolean;
  /**
   * Leading thumbnail: a bundled image, or an element for a row that needs a
   * fallback chain of its own -- a PlayerPortrait, say. Passing nothing leaves
   * the slot out entirely, which is right only where *no* row in the list has
   * art; a list where some rows have it and some do not reads as broken.
   */
  art?: ImageSourcePropType | ReactNode;
  title: string;
  subtitle?: string;
  score?: unknown;
  icon?: CrIconName;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const body = (
    <>
      {rank !== undefined && (
        <View style={[s.rank, podium && s.rankPodium]}>
          <Text style={[s.rankText, podium && s.rankPodiumText]} numberOfLines={1}>
            {rank}
          </Text>
        </View>
      )}
      {/*
        Anything that is not a React element is handed to `source` as-is, and
        that includes a bare string: Metro resolves a bundled image to an
        opaque numeric asset id, but **Vite resolves it to a URL string**.
        Narrowing this to numbers and objects silently drops every row's art on
        web while leaving native fine -- which is a one-line change that only
        the browser check can catch.

        There is no text-node risk either way, because `art` goes to a prop
        rather than into the View as a child.
      */}
      {isValidElement(art) ? (
        <View style={s.rowArt}>{art}</View>
      ) : art ? (
        <Image
          source={art as ImageSourcePropType}
          style={s.rowArt}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={s.rankBody}>
        <Text style={s.rankTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rankSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {score !== undefined && (
        <View style={s.rankScore}>
          <CrIcon name={icon} size={23} />
          <Text style={s.rankScoreText} numberOfLines={1}>
            {num(score)}
          </Text>
        </View>
      )}
    </>
  );
  if (!onPress) return <View style={s.rankRow}>{body}</View>;
  return (
    <Pressable
      style={({ pressed }) => [s.rankRow, pressed && s.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${title}`}
    >
      {body}
    </Pressable>
  );
}

/** `.arena-list` -- a stack of rows. */
export function CrList({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={s.list}>{children}</View>;
}

/** `.arena-empty`. */
export function CrEmpty({ title, body }: { title?: string; body: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.empty}>
      {title ? <Text style={s.emptyTitle}>{title}</Text> : null}
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}

/**
 * `.arena-loading`.
 *
 * Was a line of text, which read as an error message and -- on a warm cache --
 * flashed on and off before it could be read. Now a skeleton of the list that
 * is coming; `label` survives as the screen-reader announcement, so none of
 * the call sites changed.
 *
 * `rows` lets a caller match the shape it is standing in for: a short header
 * block wants two, a ladder wants six.
 */
export function CrLoading({ label, rows: count = 4 }: { label: string; rows?: number }) {
  return <SkeletonRows rows={count} avatar label={label} />;
}

/**
 * `.arena-service-error`.
 *
 * Mirrors CocBits' Source: nothing on success, an explicit service error
 * otherwise. The app never silently renders an empty screen in place of a
 * failed request.
 *
 * The success branch used to be an "Official Supercell API · via RoyaleAPI"
 * provenance footer. Removed from both games -- see CocBits.
 */
export function Source({ result }: { result: GameResult }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (result.ok) return null;
  return (
    <View accessibilityRole="alert" style={s.errorBox}>
      <Text style={s.errorTitle}>
        {result.status === 404 ? 'Not found' : `Game service error · ${result.status}`}
      </Text>
      <Text style={s.errorBody}>
        {result.status === 404
          ? 'Check the tag and try another account.'
          : 'The game service could not be reached. Try again in a moment.'}
      </Text>
    </View>
  );
}

/*
 * `DerivedNote` lived here -- a paragraph under every computed figure saying
 * which endpoint had not provided it. Removed 2026-11-07: the app was carrying
 * roughly a screenful of API caveats across the three games, and a reader who
 * wants to know where a number came from is better served by the figure being
 * labelled ("Counted from 94 logs") than by a paragraph about what Supercell
 * does not publish. Where a qualifier genuinely changes the reading of a
 * number it is now a chip or a short line beside it.
 */

export const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    // `.arena-shell { max-width: 560px; margin-inline: auto }`
    shell: {
      padding: 12,
      // A little top padding now that no heading separates the content from
      // the game tabs above it.
      paddingTop: 16,
      paddingBottom: 110,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },

    // Cards carry their own separation now, so the 28px that used to stand in
    // for it would read as a gap twice over.
    section: { marginTop: 14 },
    sectionFirst: { marginTop: 0 },
    sectionCard: {
      padding: 14,
      backgroundColor: t.card,
      borderWidth: 2,
      // The blue rim, not the neutral one, and no plate shadow under it.
      // The `0 4px 0` plate used to be the thing that said "Royale" now that
      // the palette is shared; the rim says it in one device instead of two,
      // and without the offset block of navy under every card.
      borderColor: t.chrome.cr.rim,
      borderRadius: t.radius.md,
      // Clips the fan-kit art that several sections scale past their box, the
      // same reason CoC's Panel does.
      overflow: 'hidden',
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
      // The rule is gone: the card edge already separates this from whatever
      // sits above it, and the two together read as a double border.
    },
    sectionHeadLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    h2: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground, flexShrink: 1 },
    sectionCount: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },

    art: { width: '100%', height: '100%', flexShrink: 0 },
    artFallback: { alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 28 },
    artFallbackText: { fontFamily: t.fonts.display, fontSize: 16, color: t.mutedForeground },

    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
    // Two columns. The gap is 10, so each column is half the row minus half
    // the gap -- expressed as a basis because Yoga has no `calc()`.
    metric: {
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 10,
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: t.card,
      borderRadius: t.radius.md,
    },
    metricIcon: { width: 24, height: 28 },
    metricText: { flex: 1, minWidth: 0 },
    metricLabel: { fontFamily: t.fonts.sans, fontSize: 10, lineHeight: 14, color: t.mutedForeground },
    metricValue: {
      fontFamily: t.fonts.display,
      fontSize: 18,
      marginTop: 5,
      color: t.cardForeground,
    },
    // An element value sits where the text would, on the same top margin, so a
    // crown record lines up with the plain figures beside it in the grid.
    metricValueSlot: { marginTop: 5 },

    crownRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
    crownFigure: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    crownValue: { fontFamily: t.fonts.display, fontSize: 15, color: t.cardForeground },
    crownSep: { fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    // Draws have no crown of their own -- nobody took one -- so they stay a
    // suffix rather than borrowing a colour that would claim a result.
    crownDraw: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },

    portraitFrame: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.royale.chip,
      borderWidth: 2,
      // Neutral, not the blue rim: these are small frames repeated down a
      // roster, and a card's rim colour on each of them reads as noise.
      borderColor: t.border,
      borderRadius: t.radius.md,
    },

    list: { gap: 8 },
    rankRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 13,
      paddingHorizontal: 10,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
    },
    pressed: { opacity: 0.75 },
    rank: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderRadius: t.radius.sm,
    },
    rankPodium: { backgroundColor: t.primary },
    rankText: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    rankPodiumText: { color: t.primaryForeground },
    rowArt: { width: 30, height: 34, flexShrink: 0 },
    rankBody: { flex: 1, minWidth: 0 },
    rankTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.cardForeground },
    rankSubtitle: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      lineHeight: 13,
      marginTop: 4,
      color: t.mutedForeground,
    },
    rankScore: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    rankScoreText: { fontFamily: t.fonts.display, fontSize: 12, color: t.cardForeground },

    // A card, not a pair of rules: an empty state sits where content would,
    // so it should occupy the same shape the content would have.
    empty: {
      paddingVertical: 25,
      paddingHorizontal: 12,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
      backgroundColor: t.card,
      alignItems: 'center',
    },
    emptyTitle: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground, marginBottom: 6 },
    emptyBody: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 22,
      textAlign: 'center',
      color: t.mutedForeground,
    },
    source: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 17,
      marginTop: 18,
      color: t.mutedForeground,
    },
    errorBox: {
      borderLeftWidth: 3,
      borderLeftColor: t.destructive,
      padding: 14,
      backgroundColor: t.muted,
      marginVertical: 14,
    },
    errorTitle: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    errorBody: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 20,
      marginTop: 4,
      color: t.mutedForeground,
    },

    // `alignItems: flex-end` is what makes the three plinths line up on their
    // bases rather than their tops, so the winner's taller base lifts the whole
    // column.
    podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 16 },
    podiumPlace: { flex: 1, minWidth: 0, alignItems: 'center' },
    podiumArt: {
      width: 62,
      height: 62,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.md,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
    },
    podiumArtWinner: { borderColor: t.royale.highlight },
    medal: {
      marginTop: -11,
      minWidth: 24,
      paddingVertical: 3,
      paddingHorizontal: 6,
      alignItems: 'center',
      borderRadius: t.radius.sm,
      backgroundColor: t.muted,
      borderWidth: 2,
      borderColor: t.border,
    },
    /*
     * First place is gold, and it is gold in all three of its marks -- the
     * medal, the art border and the plinth below. The medal used to take the
     * shared accent while the plinth took Royale's, which read as two
     * different ideas of "winner" stacked on one column.
     */
    medalWinner: { backgroundColor: t.royale.highlight, borderColor: t.royale.highlight },
    medalText: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    medalTextWinner: { color: t.royale.onHighlight },
    podiumName: {
      marginTop: 8,
      width: '100%',
      textAlign: 'center',
      fontFamily: t.fonts.display,
      fontSize: 11,
      color: t.foreground,
    },
    podiumSub: {
      marginTop: 3,
      width: '100%',
      textAlign: 'center',
      fontFamily: t.fonts.sans,
      fontSize: 9,
      color: t.mutedForeground,
    },
    podiumScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
    podiumScore: { fontFamily: t.fonts.display, fontSize: 12, color: t.accent, flexShrink: 1 },
    // A Royale chip rather than `muted`: muted sits a shade off the page
    // background, so second and third place would read as holes rather than
    // plinths. The chip is deliberately lighter than the card on dark and
    // darker on light, so a plinth is always a plinth.
    podiumBase: {
      width: '100%',
      height: 26,
      marginTop: 8,
      borderTopLeftRadius: t.radius.sm,
      borderTopRightRadius: t.radius.sm,
      backgroundColor: t.royale.chip,
    },
    // Gold for first place -- one of the few marks that should pop.
    podiumBaseWinner: { height: 44, backgroundColor: t.royale.highlight },
    podiumBaseThird: { height: 18 },
  });
