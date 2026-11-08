import { useMemo, type ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import type { GameResult } from '@/api/game-api';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { useRefresh } from '@/hooks/use-refresh';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Shared furniture for the Brawl Stars screens.
 *
 * Mirrors components/cr/CrBits.tsx in role. It is a separate module rather
 * than a reuse of that one because every piece here reads `theme.brawl` where
 * the Royale equivalents read `theme.royale` -- parameterising CrBits on which
 * accent to use would thread an argument through two dozen call sites to save
 * about sixty lines.
 *
 * `Metric`, `MetricGrid` and the list/empty/loading trio are deliberately
 * shaped like their Royale counterparts, so a reader who knows one screen
 * knows the other.
 */

/** Thousands separators, em dash for anything that is not a number. */
export function num(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('en-US');
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value).toLocaleString('en-US');
  }
  return '—';
}

/**
 * `nameColor` as a usable colour, or undefined.
 *
 * The API hands back ARGB as a string -- `"0xffcb5aff"` -- which no platform
 * accepts. The alpha byte is dropped rather than converted: it is `ff` on
 * every sample in both captures, and a name rendered semi-transparent would
 * read as a loading state.
 *
 * **Returns undefined freely.** `nameColor` is absent entirely from battle-log
 * participants and from reset accounts, so the caller must have a default.
 */
export function nameTint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^0x[0-9a-f]{2}([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1]}` : undefined;
}

/** The scrolling page body, with room for the floating bottom bar. */
export function BsShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  // Wired once here rather than per screen -- see the note on CocShell.
  const { refreshing, onRefresh } = useRefresh();
  return (
    <PullToRefresh
      refreshing={refreshing}
      onRefresh={onRefresh}
      style={s.shell}
      contentContainerStyle={s.shellInner}
    >
      {children}
    </PullToRefresh>
  );
}

/** A titled plate. The 4px purple rim is what makes a Brawl screen a Brawl screen. */
export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right ? <View style={s.sectionRight}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * One labelled number.
 *
 * `hint` is a second line under the value, for the unit disambiguations this
 * game needs more than the other two -- "Insane II" under a Robo Rumble level,
 * "seconds" under a Big Game time.
 */
export function Metric({
  label,
  value,
  hint,
  icon,
  tint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ImageSourcePropType;
  tint?: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.metric}>
      {icon ? <Image source={icon} style={s.metricIcon} resizeMode="contain" /> : null}
      <Text style={[s.metricValue, tint ? { color: tint } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.metricLabel} numberOfLines={2}>
        {label}
      </Text>
      {/*
        Rendered through a ternary rather than `hint && <Text>`: a bare string
        left in a View by a falsy-and is a console warning on web and a hard
        crash on Android, and half the fields on these screens are optional.
      */}
      {hint ? (
        <Text style={s.metricHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={s.metricGrid}>{children}</View>;
}

/** A small filled pill. `tone` swaps the accent fill for a neutral one. */
export function Chip({
  label,
  tone = 'accent',
  color,
  icon,
}: {
  label: string;
  tone?: 'accent' | 'muted';
  color?: string;
  /** Drawn before the label, at the label's own size. */
  icon?: ImageSourcePropType;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={[s.chip, tone === 'muted' && s.chipMuted, color ? { borderColor: color } : null]}>
      {icon ? <Image source={icon} style={s.chipIcon} resizeMode="contain" /> : null}
      <Text style={[s.chipText, tone === 'muted' && s.chipTextMuted, color ? { color } : null]}>
        {label}
      </Text>
    </View>
  );
}

/** A number with its unit's art beside it. The screens are full of these. */
export function IconValue({
  icon,
  children,
  style,
  size = 14,
}: {
  icon?: ImageSourcePropType;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  size?: number;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.iconValue}>
      {icon ? (
        <Image
          source={icon}
          style={{ width: size, height: size, borderRadius: theme.radius.sm }}
          resizeMode="contain"
        />
      ) : null}
      <Text style={style}>{children}</Text>
    </View>
  );
}

export function BsList({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={s.list}>{children}</View>;
}

export function BsEmpty({ title, body }: { title?: string; body: string }) {
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
 * A failed request, said out loud. Matches `CrBits.Source` and
 * `CocBits.Source`, which despite the shared name are error alerts rather
 * than footers.
 *
 * It used to print "Brawl Stars API · 19:42:11" under every successful screen
 * as well. That told the reader nothing they could act on and cost a line on
 * every panel, so the success branch is gone and the error branch -- the part
 * that earns its space -- stays.
 */
export function Source({ result }: { result?: GameResult }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (!result || result.ok) return null;
  return (
    <View accessibilityRole="alert" style={s.errorBox}>
      <Text style={s.errorTitle}>
        {result.status === 404 ? 'Not found' : `Game service error · ${result.status}`}
      </Text>
      <Text style={s.errorBody}>
        {result.status === 404
          ? 'Check the tag and try another account.'
          : 'The game service could not be reached.'}
      </Text>
    </View>
  );
}

export const build = (t: Theme) =>
  StyleSheet.create({
    shell: { flex: 1 },
    // 112 of bottom padding clears the floating nav bar, matching CrShell.
    shellInner: {
      padding: 12,
      paddingBottom: 112,
      gap: 12,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    /*
      A 2px purple rim the whole way round, and no shadow.

      It used to be a hairline border, a 4px purple left edge and a hard
      `0 4px 0` plate shadow in the same purple. Three devices saying "card",
      and the shadow in particular read as a second card slipping out from
      under the first on a dark page. One rim does the whole job: inside the
      detail sheet the panel sits on `t.background` (#151817) while its fill is
      `t.card` (#1e2120) -- eleven points of luminance, flat without a border --
      and the colour is what says which game you are in.
    */
    section: {
      backgroundColor: t.card,
      borderRadius: t.radius.xl,
      borderWidth: 2,
      borderColor: t.chrome.bs.rim,
      padding: 12,
      gap: 10,
    },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: {
      flex: 1,
      fontFamily: t.fonts.display,
      fontSize: 13,
      letterSpacing: 0.4,
      color: t.brawl.heading,
    },
    sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 92,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
      // Same reasoning as `section`: muted on card is a six-point step.
      borderWidth: 1,
      borderColor: t.border,
    },
    /*
      Rounded, because a good half of these are opaque squares.

      `BS_STAT` mixes transparent cut-outs (the trophy, the rank badge) with
      full-bleed art that has its own background -- the power-point stack, the
      Brawl icon, and every `modeArt` win counter. The cut-outs are unaffected
      by a radius; the squares were the only hard corners left on the screen.
    */
    metricIcon: { width: 24, height: 24, marginBottom: 2, borderRadius: t.radius.sm },
    metricValue: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    metricLabel: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      textAlign: 'center',
      color: t.mutedForeground,
    },
    metricHint: { fontFamily: t.fonts.sans, fontSize: 9, color: t.brawl.heading },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.brawl.heading,
    },
    chipMuted: { borderColor: t.border },
    // 3, not radius.sm: at 12px a 4px radius starts eating the glyph.
    chipIcon: { width: 12, height: 12, borderRadius: 3 },
    chipText: { fontFamily: t.fonts.display, fontSize: 10, color: t.brawl.heading },
    iconValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    chipTextMuted: { color: t.mutedForeground },
    list: { gap: 6 },
    empty: { padding: 20, alignItems: 'center', gap: 6 },
    emptyTitle: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    emptyBody: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      color: t.mutedForeground,
    },
    errorBox: {
      gap: 2,
      padding: 10,
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.destructive,
    },
    errorTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.destructive },
    errorBody: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
  });
