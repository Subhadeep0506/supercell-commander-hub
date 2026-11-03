import { useMemo, type ReactNode } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COC_ART, superTroopArt } from '@/assets/art';
import { itemArt, playerBookItem } from '@/lib/clash-book';
import { text, type GameResult } from '@/api/game-api';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Button } from '@/components/ui/Button';

/**
 * Art lookup used all over the CoC screens.
 *
 * Mirrors the reference's two-step fallback: the hand-picked COC_ART map
 * first, then the Clash Book artwork for an item of that name. Several icon
 * names in CocPlayer ("Spell Factory", "Clan Castle", "Giant Gauntlet") exist
 * only in the book, which is why the second step matters.
 */
export function Art({
  name,
  size = 32,
  scale = 1,
  style,
}: {
  name: string;
  size?: number;
  scale?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const source = COC_ART[name] ?? bookFallback(name) ?? superTroopArt(name);
  if (!source) return null;
  return (
    <Image
      source={source}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={[artBase, { width: size, height: size }, scale !== 1 && { transform: [{ scale }] }, style]}
    />
  );
}

const artBase: ImageStyle = { flexShrink: 0 };

/**
 * A run of star slots, filled to `count`.
 *
 * Every star in the app is this one fan-kit icon. Unearned slots are the same
 * image dimmed rather than a second asset: React Native has no grayscale
 * filter, and opacity reads correctly against both the card and muted
 * backgrounds this appears on.
 */
export function Stars({
  count,
  max = 3,
  size = 13,
}: {
  count: unknown;
  max?: number;
  size?: number;
}) {
  const n = Math.max(0, Math.min(max, Number(count) || 0));
  return (
    <View style={starsRow}>
      {Array.from({ length: max }, (_, i) => (
        <Art key={i} name="star" size={size} style={i < n ? undefined : starOff} />
      ))}
    </View>
  );
}

const starsRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 1 };
const starOff: ImageStyle = { opacity: 0.22 };

function bookFallback(name: string) {
  const entry = playerBookItem(name);
  return entry ? itemArt(entry)?.source : undefined;
}

/**
 * `.coc-stat` -- an icon beside a value and its caption.
 *
 * `icon` takes either a COC_ART name or a bundled source directly, matching
 * StatCell in clan/ClanBits. The source form exists for artwork that is not
 * reachable by name: the trimmed nav icons, whose `coc/main` equivalents carry
 * so much transparent padding that they render at half the weight of the
 * Clash Book art beside them.
 */
export function SmallStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: unknown;
  icon?: string | ImageSourcePropType;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.stat}>
      {typeof icon === 'string' ? (
        <Art name={icon} />
      ) : icon ? (
        <Image source={icon} style={s.statSource} resizeMode="contain" />
      ) : null}
      <View style={s.statText}>
        <Text style={s.statValue}>{text(value)}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** The "Official Supercell API" footer, or the service error that replaced it. */
export function Source({ result }: { result: GameResult }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (result.ok) return <Text style={s.source}>Official Supercell API · via RoyaleAPI</Text>;
  return (
    <View accessibilityRole="alert" style={s.errorBox}>
      <Text style={s.errorTitle}>Game service error · {result.status}</Text>
      <Text style={s.errorBody}>{describe(result.error)}</Text>
    </View>
  );
}

/**
 * Upstream errors are normally JSON, but a blocked or intercepted request
 * returns an HTML page instead. Dumping raw markup into the UI helps nobody,
 * so it is summarised.
 */
function describe(error: string): string {
  const trimmed = error.trim();
  if (/^\s*</.test(trimmed)) {
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(trimmed)?.[1]?.trim();
    return title
      ? `The request was intercepted before it reached the game service (“${title}”). This is a network restriction, not a problem with your tag.`
      : 'The request was intercepted before it reached the game service. This is a network restriction, not a problem with your tag.';
  }
  try {
    const parsed = JSON.parse(trimmed) as { message?: string; reason?: string };
    return parsed.message ?? parsed.reason ?? trimmed;
  } catch {
    return trimmed.slice(0, 300);
  }
}

/** `.coc-shell` + `.coc-account` -- the per-screen header with the Accounts link. */
export function CocShell({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.shell}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.account}>
        <View style={s.accountLeft}>
          <Art name="Barbarian King" size={40} />
          <Text style={s.accountTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          style={s.accountsBtn}
          textStyle={s.accountsText}
          onPress={() => navigation.navigate('Passport')}
        >
          Accounts
        </Button>
      </View>
      {children}
    </ScrollView>
  );
}

export const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    // Bottom padding clears the floating nav pill (64px + its inset).
    shell: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingTop: 16,
      paddingBottom: 120,
    },
    account: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 18,
    },
    accountLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
    accountTitle: { flexShrink: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 18, color: t.primary },
    accountsBtn: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    accountsText: { fontSize: 11 },

    stat: {
      // Not `flex: 1`: that sets flexBasis to 0, so in a wrapping row every
      // card collapses onto one line. A percentage basis gives two per row and
      // still lets a pair fill the full width.
      flexBasis: '47%',
      flexGrow: 1,
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      backgroundColor: t.muted,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    // Matches the 32px box <Art> renders into, so both icon forms weigh the same.
    statSource: { width: 32, height: 32, flexShrink: 0 },
    statText: { flexShrink: 1, minWidth: 0 },
    statValue: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    statLabel: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    source: { marginTop: 20, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    errorBox: { marginTop: 16, borderLeftWidth: 2, borderLeftColor: t.destructive, paddingLeft: 12 },
    errorTitle: { fontFamily: t.fonts.display, fontSize: 14, color: t.destructive },
    errorBody: { marginTop: 8, fontSize: 13, lineHeight: 19, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
