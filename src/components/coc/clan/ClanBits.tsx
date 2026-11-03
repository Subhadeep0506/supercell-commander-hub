import { useMemo, type ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { emptyStateArt } from '@/assets/capital';
import { COC_ART } from '@/assets/art';
import { record, text, type ApiRecord } from '@/api/game-api';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** Small pill: an optional icon beside a label. Used for every chip row. */
export function Chip({
  label,
  icon,
  glyph,
  tone = 'default',
}: {
  label: string;
  icon?: ImageSourcePropType;
  glyph?: string;
  tone?: 'default' | 'highlight';
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={[s.chip, tone === 'highlight' && s.chipHighlight]}>
      {icon ? <Image source={icon} style={s.chipIcon} resizeMode="contain" /> : null}
      {!icon && glyph ? <Text style={s.chipGlyph}>{glyph}</Text> : null}
      <Text style={[s.chipText, tone === 'highlight' && s.chipTextHighlight]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** One cell of a divided stat strip: icon, value, caption. */
export function StatCell({
  value,
  label,
  icon,
  glyph,
  tone,
}: {
  value: ReactNode;
  label?: string;
  icon?: ImageSourcePropType;
  glyph?: string;
  tone?: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.statCell}>
      <View style={s.statTop}>
        {icon ? <Image source={icon} style={s.statIcon} resizeMode="contain" /> : null}
        {!icon && glyph ? <Text style={s.statGlyph}>{glyph}</Text> : null}
        <Text style={[s.statValue, tone ? { color: tone } : null]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {label ? <Text style={s.statLabel}>{label}</Text> : null}
    </View>
  );
}

/** A row of StatCells separated by hairlines, as in the mock's stat strips. */
export function StatStrip({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={[s.statStrip, style]}>{children}</View>;
}

/**
 * The clan's own badge.
 *
 * Badges are player-assembled from crests and layers, so there is no bundled
 * set -- `badgeUrls` is the only source there has ever been. On a network that
 * cannot reach Supercell's CDN this falls back to the bundled Clan Castle, so
 * the header keeps its shape rather than leaving a hole.
 */
export function ClanBadge({
  clan,
  size = 96,
  level,
}: {
  clan: ApiRecord;
  size?: number;
  level?: boolean;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const urls = record(clan['badgeUrls']);
  const uri = [urls['large'], urls['medium'], urls['small']].find((u) => typeof u === 'string');

  // The clan record and the war log call it `clanLevel`; raid log entries call
  // the same thing `level`. Reading only the first silently drops the pip on
  // every raid row.
  const n = clan['clanLevel'] ?? clan['level'];
  // The pip is sized off the badge so it stays legible on a 38px war-log row
  // without swamping it.
  const pip = Math.max(16, Math.round(size * 0.32));

  return (
    <View style={{ width: size, height: size }}>
      <RemoteImage
        uri={uri as string | undefined}
        fallback={COC_ART['war']}
        accessibilityLabel={`${text(clan['name'])} badge`}
        style={{ width: size, height: size }}
      />
      {level && n !== undefined ? (
        <View
          style={[
            s.levelPip,
            { minWidth: pip, marginLeft: -pip / 2, borderRadius: Math.round(pip / 3) },
          ]}
        >
          <Text style={[s.levelText, { fontSize: Math.max(9, Math.round(pip * 0.55)) }]}>
            {text(n)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The shared "nothing to show" panel.
 *
 * `empty-state.png` is a hand-supplied drop-in (see scripts/build-assets.mjs);
 * until it lands the panel renders without art rather than with a broken box.
 */
export function EmptyState({
  title,
  body,
  glyph = '🛡',
  children,
}: {
  title: string;
  body: string;
  /** Stand-in shown until the drop-in artwork is supplied. */
  glyph?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const art = emptyStateArt();
  return (
    <View style={s.empty}>
      {art ? (
        <Image source={art} style={s.emptyArt} resizeMode="contain" />
      ) : (
        <View style={s.emptyGlyphBox}>
          <Text style={s.emptyGlyph}>{glyph}</Text>
        </View>
      )}
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
      {children}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    chipHighlight: { borderColor: t.cocHighlight, backgroundColor: `${t.cocHighlight}22` },
    chipIcon: { width: 16, height: 16 },
    chipGlyph: { fontSize: 12 },
    chipText: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    chipTextHighlight: { color: t.cocHighlight },

    statStrip: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: t.muted,
      borderRadius: 8,
      paddingVertical: 10,
    },
    statCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 },
    statTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statIcon: { width: 18, height: 18 },
    statGlyph: { fontSize: 13 },
    statValue: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 15, color: t.foreground },
    statLabel: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    levelPip: {
      position: 'absolute',
      top: 0,
      left: '50%',
      paddingHorizontal: 4,
      paddingVertical: 1,
      alignItems: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    levelText: { fontFamily: t.fonts.display, color: t.foreground },

    // flex + centring so a short message sits in the middle of the sheet
    // rather than clinging to the top of an otherwise empty panel.
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
    },
    emptyArt: { width: 140, height: 140, marginBottom: 18, opacity: 0.9 },
    emptyGlyphBox: {
      width: 104,
      height: 104,
      marginBottom: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    emptyGlyph: { fontSize: 44, opacity: 0.55 },
    emptyTitle: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground, textAlign: 'center' },
    emptyBody: {
      marginTop: 10,
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 20,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
    },
  });
