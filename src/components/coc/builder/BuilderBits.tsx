import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { bookArtAt, townHallArt } from '@/assets/art';
import { formatDuration } from '@/lib/clan';
import { GROUP_LABEL, type Group } from '@/lib/village-plan';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Shared pieces of the Builder Plan screen.
 *
 * The screen is driven entirely by an imported village export, so everything
 * here takes plain values rather than reaching for a query.
 */

/** Legend colours, reused by the plan bars and the group dots. */
export function groupColour(group: Group, t: Theme): string {
  switch (group) {
    case 'heroes':
      return t.cocHighlight;
    case 'offense':
      return t.primary;
    case 'defense':
      return t.destructive;
    case 'economy':
      return t.success;
    default:
      return t.mutedForeground;
  }
}

/** A countdown that re-renders itself once a minute. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * "2d 8h" -- the two largest units only.
 *
 * formatDuration keeps every unit down to seconds, which is right for a raid
 * countdown but reads as noise on an upgrade measured in days: "3d 10h 22m 8s"
 * where the game itself shows "3d 10h".
 */
export function briefDuration(ms: number): string {
  return formatDuration(ms).split(' ').slice(0, 2).join(' ');
}

/** "2d 8h", or "Done" once the finish time has passed. */
export function remainingLabel(finishesAt: number, now: number): string {
  return finishesAt <= now ? 'Done' : briefDuration(finishesAt - now);
}

/** "Nov 6, 03:48" -- the absolute finish, shown beside the countdown. */
export function clockLabel(at: number): string {
  const d = new Date(at);
  const month = d.toLocaleString('en', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${d.getDate()}, ${hh}:${mm}`;
}

/**
 * Catalog artwork at a level, falling back to the Town Hall render for the
 * hall itself.
 *
 * The Town Hall case stays ahead of `bookArtAt` because `coc/main` carries the
 * official fan-kit halls for 9-18, and those are the renders every roster row
 * and ladder entry already shows -- the dataset's own set would give the same
 * building two looks depending on which screen you were on.
 */
export function itemImage(catalogId: string, level?: number) {
  if (catalogId === 'home/town-hall' && level) {
    return townHallArt(level) ?? bookArtAt(catalogId, level)?.source;
  }
  return bookArtAt(catalogId, level)?.source;
}

/**
 * Square artwork tile with a level badge, used by every list on this screen.
 *
 * `onPress` opens the Clash Book entry -- the same sheet the book and the
 * player army grids use, so tapping a card costs no new UI.
 */
export function ItemTile({
  catalogId,
  level,
  count,
  size = 44,
  maxed = false,
  gameMaxed = false,
  progress,
  onPress,
  accessibilityLabel,
}: {
  catalogId: string;
  level?: number;
  count?: number;
  size?: number;
  /** Maxed for this hall: green. */
  maxed?: boolean;
  /** Maxed for the game: gold, and it wins over green. */
  gameMaxed?: boolean;
  /** 0-1, drawn as a bar under the art. */
  progress?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const art = itemImage(catalogId, level);

  const body = (
    <View
      style={[
        s.tile,
        { width: size, height: size },
        maxed && s.tileMaxed,
        gameMaxed && s.tileGameMaxed,
      ]}
    >
      {art ? <Image source={art} style={s.tileArt} resizeMode="contain" /> : null}
      {count !== undefined && count > 1 ? (
        <Text style={s.tileCount} numberOfLines={1}>
          x{count}
        </Text>
      ) : null}
      {level !== undefined ? (
        <Text
          style={[s.tileLevel, maxed && s.tileLevelMaxed, gameMaxed && s.tileLevelGameMaxed]}
          numberOfLines={1}
        >
          {level}
        </Text>
      ) : null}
      {progress !== undefined ? (
        <View style={s.tileBar}>
          <View
            style={[
              s.tileBarFill,
              { width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
              maxed && s.tileBarFillMaxed,
              gameMaxed && s.tileBarFillGameMaxed,
            ]}
          />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {body}
    </Pressable>
  );
}

/** The colour key under the plan. */
export function GroupLegend({ groups }: { groups: Group[] }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.legend}>
      {groups.map((group) => (
        <View key={group} style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: groupColour(group, theme) }]} />
          <Text style={s.legendText}>{GROUP_LABEL[group]}</Text>
        </View>
      ))}
    </View>
  );
}

/** A labelled percentage bar, used for every "Your village" section. */
export function SectionBar({ pct }: { pct: number }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.sectionBar}>
      <View style={[s.sectionFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    tile: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    // Green is "this hall can do no more", gold is "finished for good".
    // Declared in that order so gold wins when both hold.
    tileMaxed: { borderColor: t.success },
    tileGameMaxed: { borderColor: t.gold },
    tileArt: { width: '100%', height: '100%' },
    tileCount: {
      position: 'absolute',
      top: 2,
      left: 3,
      paddingHorizontal: 3,
      borderRadius: 3,
      backgroundColor: t.card,
      color: t.foreground,
      fontFamily: t.fonts.display,
      fontSize: 9,
    },
    tileLevel: {
      position: 'absolute',
      bottom: 4,
      right: 3,
      paddingHorizontal: 3,
      borderRadius: 3,
      backgroundColor: t.card,
      color: t.destructive,
      fontFamily: t.fonts.display,
      fontSize: 10,
    },
    tileLevelMaxed: { color: t.success },
    tileLevelGameMaxed: { color: t.gold },
    tileBar: {
      position: 'absolute',
      left: 4,
      right: 4,
      bottom: 2,
      height: 2,
      borderRadius: 999,
      backgroundColor: t.border,
      overflow: 'hidden',
    },
    tileBarFill: { height: '100%', backgroundColor: t.primary },
    tileBarFillMaxed: { backgroundColor: t.success },
    tileBarFillGameMaxed: { backgroundColor: t.gold },

    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 999 },
    legendText: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    sectionBar: {
      height: 4,
      marginTop: 6,
      borderRadius: 999,
      backgroundColor: t.border,
      overflow: 'hidden',
    },
    sectionFill: { height: '100%', backgroundColor: t.primary },
  });
