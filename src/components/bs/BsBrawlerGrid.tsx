import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChipRow } from '@/components/ui/ChipRow';
import { Select } from '@/components/ui/Select';
import { BS_STAT, brawlerArt, prestigeArt } from '@/assets/brawl';
import {
  CLASS_LABEL,
  CLASS_ORDER,
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_ORDER,
  collectionSummary,
  type CollectionEntry,
} from '@/lib/bs-brawlers';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Metric, MetricGrid, Section, num } from './BsBits';

type Sort = 'trophies' | 'power' | 'rarity' | 'name';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'trophies', label: 'Trophies' },
  { id: 'power', label: 'Power' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'name', label: 'Name' },
];

/**
 * The whole roster, owned and not.
 *
 * **Every brawler in the game is a tile**, including the ones you have not
 * unlocked -- those render greyed with "Locked". Hiding them would turn "15
 * still to unlock" into something you can only work out by counting, and the
 * catalog call that makes it possible is already being made for the kit
 * completion figures.
 *
 * Rarity and class come from `src/data/bs/brawler-meta.json`, because
 * `/v1/brawlers` carries neither -- see scripts/fetch-bs-data.mjs.
 */
export function BsBrawlerGrid({
  entries,
  onOpen,
}: {
  entries: CollectionEntry[];
  /**
   * Both callers pass one now -- the Home tab and the player layer of the
   * detail sheet -- and both push a `brawler` entry onto the sheet stack.
   *
   * It stays optional because the fallback is the honest one: without a
   * handler the tiles render as plain views rather than as buttons that do
   * nothing, which is what the sheet used to be stuck with.
   */
  onOpen?: (entry: CollectionEntry) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [sort, setSort] = useState<Sort>('trophies');
  const [rarity, setRarity] = useState<string>('');
  const [className, setClassName] = useState<string>('');
  const [lockedToo, setLockedToo] = useState(true);

  const summary = useMemo(() => collectionSummary(entries), [entries]);

  const shown = useMemo(() => {
    const filtered = entries.filter(
      (e) =>
        (!rarity || e.rarity === rarity) &&
        (!className || e.className === className) &&
        (lockedToo || e.owned),
    );
    const rank = (e: CollectionEntry) => RARITY_ORDER.indexOf(e.rarity as never);
    return [...filtered].sort((a, b) => {
      // Locked brawlers sink to the bottom whatever the sort: they have no
      // trophies, no power and no rank, so interleaving them by those keys
      // would scatter blanks through the grid.
      if (Boolean(a.owned) !== Boolean(b.owned)) return a.owned ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'rarity') return rank(b) - rank(a) || a.name.localeCompare(b.name);
      if (sort === 'power') {
        return (b.owned?.power ?? 0) - (a.owned?.power ?? 0) || (b.owned?.trophies ?? 0) - (a.owned?.trophies ?? 0);
      }
      return (b.owned?.trophies ?? 0) - (a.owned?.trophies ?? 0);
    });
  }, [entries, sort, rarity, className, lockedToo]);

  return (
    <Section
      title="Brawlers"
      right={
        <Select
          value={sort}
          options={SORTS.map((o) => ({ id: o.id, label: o.label }))}
          onChange={(id) => setSort(id as Sort)}
          accessibilityLabel="Sort brawlers"
        />
      }
    >
      <MetricGrid>
        <Metric
          label="Unlocked"
          value={`${summary.owned}/${summary.total}`}
          icon={BS_STAT.brawler}
        />
        {/* Power points: the currency a power level is bought with. See BS_STAT. */}
        <Metric label="Power 11" value={num(summary.maxed)} icon={BS_STAT.power} />
        <Metric label="Prestiged" value={num(summary.prestiged)} icon={BS_STAT.prestige} />
        <Metric
          label="Trophies"
          value={num(summary.trophies)}
          hint="sum of all brawlers"
          icon={BS_STAT.trophy}
        />
      </MetricGrid>

      {/*
        The three filter rows in their own tight stack.
        `dense` drops ChipRow's 38px of vertical padding, which is sized for
        the Clash Book's single standing row; three of them unpadded here was
        114px of whitespace between the stats and the first tile.
      */}
      <View style={s.filters}>
        <ChipRow
          dense
          accessibilityLabel="Filter by rarity"
          chips={[
            { id: '', label: 'All rarities' },
            ...RARITY_ORDER.map((r) => ({ id: r, label: RARITY_LABEL[r]! })),
          ]}
          value={rarity}
          onChange={setRarity}
        />
        <ChipRow
          dense
          accessibilityLabel="Filter by class"
          chips={[
            { id: '', label: 'All classes' },
            ...CLASS_ORDER.map((c) => ({ id: c, label: CLASS_LABEL[c]! })),
          ]}
          value={className}
          onChange={setClassName}
        />
        <ChipRow
          dense
          accessibilityLabel="Show locked brawlers"
          chips={[
            { id: 'all', label: `All ${summary.total}` },
            { id: 'owned', label: `Unlocked ${summary.owned}` },
          ]}
          value={lockedToo ? 'all' : 'owned'}
          onChange={(id) => setLockedToo(id === 'all')}
        />
      </View>

      <View style={s.grid}>
        {shown.map((entry) => (
          <BrawlerTile
            key={entry.id}
            entry={entry}
            onPress={onOpen ? () => onOpen(entry) : undefined}
          />
        ))}
      </View>
      {shown.length === 0 ? <Text style={s.none}>No brawlers match those filters.</Text> : null}
    </Section>
  );
}

function BrawlerTile({ entry, onPress }: { entry: CollectionEntry; onPress?: () => void }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const art = brawlerArt(entry.id);
  const owned = entry.owned;
  const Tile = onPress ? Pressable : View;

  return (
    <Tile
      {...(onPress
        ? {
            onPress,
            accessibilityRole: 'button' as const,
            accessibilityLabel: owned
              ? `${entry.name}, power ${owned.power}`
              : `${entry.name}, locked`,
          }
        : {})}
      style={[s.tile, !owned && s.tileLocked]}
    >
      <View style={s.tileArtBox}>
        {art ? (
          // Greyscale is not available in RN styling, so a locked tile is
          // dimmed with opacity and captioned instead. The caption is what
          // actually carries the meaning; the dimming only groups them.
          <Image source={art} style={[s.tileArt, !owned && s.tileArtLocked]} resizeMode="contain" />
        ) : (
          <Text style={s.tileFallback}>{entry.name.slice(0, 2)}</Text>
        )}
        {owned && owned.prestigeLevel > 0 && prestigeArt(owned.prestigeLevel) ? (
          <Image source={prestigeArt(owned.prestigeLevel)!} style={s.tilePrestige} resizeMode="contain" />
        ) : null}
      </View>

      <Text style={[s.tileName, !owned && s.tileDim]} numberOfLines={1}>
        {entry.name}
      </Text>

      {owned ? (
        <>
          <Text style={s.tileTrophies}>{num(owned.trophies)}</Text>
          <View style={s.tilePowerRow}>
            <Text style={s.tilePower}>P{owned.power}</Text>
            <Text style={s.tileRank}>R{owned.rank}</Text>
          </View>
        </>
      ) : (
        <Text style={s.tileLockedText}>Locked</Text>
      )}

      <View style={[s.tileRarity, { backgroundColor: RARITY_COLOR[entry.rarity] ?? theme.border }]} />
    </Tile>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    // Three across at 430pt, four on anything wider, via flexBasis rather
    // than a measured column count.
    filters: { gap: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
      flexGrow: 1,
      flexBasis: '28%',
      minWidth: 92,
      maxWidth: 140,
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 6,
      gap: 2,
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      overflow: 'hidden',
    },
    tileLocked: { opacity: 0.55 },
    tileArtBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    tileArt: { width: 64, height: 64 },
    tileArtLocked: { opacity: 0.4 },
    tilePrestige: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22 },
    tileFallback: { fontFamily: t.fonts.display, fontSize: 20, color: t.mutedForeground },
    tileName: { fontFamily: t.fonts.display, fontSize: 10, color: t.foreground },
    tileDim: { color: t.mutedForeground },
    tileTrophies: { fontFamily: t.fonts.display, fontSize: 13, color: t.brawl.highlight },
    tilePowerRow: { flexDirection: 'row', gap: 6 },
    tilePower: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    tileRank: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    tileLockedText: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    tileRarity: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
    none: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      textAlign: 'center',
      paddingVertical: 12,
      color: t.mutedForeground,
    },
  });
