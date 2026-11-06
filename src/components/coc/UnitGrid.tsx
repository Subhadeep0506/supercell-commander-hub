import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { itemArt } from '@/lib/clash-book';
import type { CollectionEntry } from '@/lib/player-collection';
import type { PlayerContext } from '@/lib/player-progress';
import { HGrid } from '@/components/ui/HGrid';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BookItemModal } from './BookItemModal';

/** A collection entry, optionally carrying how many levels are left to go. */
type GridEntry = CollectionEntry & { toGo?: number };

/**
 * Tile widths, in pixels.
 *
 * These match what the old percentage grid produced at the 560px content
 * width the shell caps at: 25% regular, 16.6% compact, less the gutters.
 * HGrid needs a definite width, so the figure is stated rather than derived.
 */
const TILE_REGULAR = 96;
const TILE_COMPACT = 62;

/**
 * `.coc-units` -- the troop/hero/spell/building grid.
 *
 * Driven by `playerCollection`, not by the API response, so it shows the whole
 * Clash Book for the village and marks each entry against the player: what
 * they own, what this Town Hall could unlock today, and what is still out of
 * reach. The service only ever returns what you own, which is why the Pets
 * section used to be missing rather than locked.
 *
 * Artwork is drawn at the entry's own level -- a level-3 and a level-14
 * Inferno Tower are different buildings to look at.
 *
 * Laid out by HGrid: one row for a short group, three rows that scroll
 * sideways for a long one.
 */
export function UnitGrid({
  entries,
  compact = false,
  label,
  remaining = false,
  context,
}: {
  entries: GridEntry[];
  compact?: boolean;
  /** Names the scroller for screen readers, e.g. "Spells". */
  label?: string;
  /**
   * Label each tile with the levels still to go rather than its state.
   *
   * Set by the "Left to upgrade" grids inside the progress card, where every
   * tile is by definition unfinished and "how much is left" is the whole
   * reason the grid is open.
   */
  remaining?: boolean;
  /**
   * What the player has, for the item sheet.
   *
   * Optional, and the sheet's player-facing sections are skipped without it --
   * which is what keeps the Clash Book screen, where there is no player,
   * rendering the same card it always did.
   */
  context?: PlayerContext;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [selected, setSelected] = useState<GridEntry>();

  return (
    <>
      <HGrid
        items={entries}
        tileWidth={compact ? TILE_COMPACT : TILE_REGULAR}
        gap={compact ? 6 : 8}
        accessibilityLabel={label}
        keyExtractor={(entry) => entry.item.id}
        renderItem={(entry) => {
          const owned = entry.state === 'owned';
          const art = itemArt(entry.item, entry.level)?.source;
          // Progress towards what this hall allows, not towards the game
          // maximum -- so a full bar and the green border mean the same thing.
          const ceiling = entry.hallMax > 0 ? entry.hallMax : entry.gameMax;
          const pct = owned && ceiling > 0 ? Math.min(100, ((entry.level ?? 0) / ceiling) * 100) : 0;
          const badge = owned ? String(entry.level) : '';
          // `> 0`, never a bare `entry.toGo &&`: a zero would render as a text
          // node inside a View, which the browser warns about and Android
          // crashes on.
          const toGo = remaining && owned && (entry.toGo ?? 0) > 0 ? `+${entry.toGo} to go` : '';

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={describe(entry)}
              onPress={() => setSelected(entry)}
              style={s.unit}
            >
              <View
                style={[
                  s.tile,
                  !owned && s.tileDim,
                  entry.maxedForHall && s.tileHallMaxed,
                  entry.maxedForGame && s.tileGameMaxed,
                ]}
              >
                {art ? (
                  <Image source={art} resizeMode="contain" style={[s.portrait, !owned && s.faded]} />
                ) : (
                  <Text style={s.fallback} numberOfLines={3}>
                    {entry.name}
                  </Text>
                )}
                {badge ? (
                  <View style={s.levelBadge}>
                    <Text
                      style={[
                        s.levelText,
                        entry.maxedForHall && s.levelMaxed,
                        entry.maxedForGame && s.levelGameMaxed,
                      ]}
                    >
                      {badge}
                    </Text>
                  </View>
                ) : null}
                {owned ? (
                  <View style={s.meter}>
                    <View
                      style={[
                        s.meterFill,
                        { width: `${pct}%` },
                        entry.maxedForHall && s.meterMaxed,
                        entry.maxedForGame && s.meterGameMaxed,
                      ]}
                    />
                  </View>
                ) : null}
              </View>
              {/*
                No padlock exists in either fan kit, so the state is a word.
                The CR card grid already prints "Locked" for the same reason.

                Always rendered, empty for an owned entry: the line has a fixed
                height, so every name in the row sits on the same baseline
                whether or not the tile above it is locked.
              */}
              {compact ? null : (
                <Text
                  style={[
                    s.state,
                    entry.state === 'ready' && s.stateReady,
                    toGo !== '' && s.stateToGo,
                  ]}
                  numberOfLines={1}
                >
                  {toGo !== '' ? toGo : STATE_LABEL[entry.state]}
                </Text>
              )}
              {compact ? null : (
                <Text style={s.name} numberOfLines={2}>
                  {entry.name}
                </Text>
              )}
            </Pressable>
          );
        }}
      />

      {selected ? (
        <BookItemModal
          key={selected.item.id}
          item={selected.item}
          context={context}
          // `initialLevel` is what claims ownership in the modal -- the "Your
          // player level" line and the "Next upgrade" section hang off it. A
          // locked entry opens at level 1 through `startLevel` instead, which
          // shows what unlocking it costs without asserting you have one.
          initialLevel={selected.state === 'owned' ? selected.level : undefined}
          startLevel={selected.state === 'owned' ? undefined : 1}
          open
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </>
  );
}

const STATE_LABEL: Record<CollectionEntry['state'], string> = {
  owned: '',
  ready: 'Ready',
  locked: 'Locked',
};

function describe(entry: GridEntry): string {
  if (entry.state === 'owned') return `View ${entry.name} level ${entry.level}`;
  if (entry.state === 'ready') return `View ${entry.name}, ready to unlock`;
  return `View ${entry.name}, locked`;
}

const build = (t: Theme) =>
  StyleSheet.create({
    // Width and gutters are HGrid's job now; the tile only fills what it is
    // given.
    unit: { width: '100%' },
    tile: {
      width: '100%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: 8,
      padding: 2,
      overflow: 'hidden',
    },
    // Two maxed states, deliberately different colours: green is "nothing more
    // this Town Hall can do", gold is "finished for good". Gold is declared
    // second so it wins when both hold.
    tileHallMaxed: { borderColor: t.success },
    tileGameMaxed: { borderColor: t.gold },
    tileDim: { backgroundColor: t.background, borderStyle: 'dashed' },
    portrait: { width: '100%', height: '100%' },
    // React Native has no grayscale filter, so an unowned tile is the same art
    // at low opacity -- the same line Stars takes for unearned slots.
    faded: { opacity: 0.3 },
    fallback: {
      fontFamily: t.fonts.display,
      fontSize: 10,
      lineHeight: 14,
      textAlign: 'center',
      color: t.mutedForeground,
    },
    levelBadge: {
      position: 'absolute',
      bottom: 3,
      right: 5,
      backgroundColor: t.card,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    levelText: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    levelMaxed: { color: t.success },
    levelGameMaxed: { color: t.gold },
    meter: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: t.border },
    meterFill: { height: '100%', backgroundColor: t.primary },
    meterMaxed: { backgroundColor: t.success },
    meterGameMaxed: { backgroundColor: t.gold },
    state: {
      marginTop: 4,
      height: 12,
      lineHeight: 12,
      textAlign: 'center',
      fontFamily: t.fonts.display,
      fontSize: 9,
      color: t.mutedForeground,
    },
    stateReady: { color: t.primary },
    stateToGo: { color: t.cocHighlight },
    name: {
      marginTop: 2,
      fontFamily: t.fonts.display,
      fontSize: 10,
      lineHeight: 14,
      minHeight: 28,
      color: t.foreground,
    },
  });
