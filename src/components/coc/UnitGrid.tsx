import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { COC_ART } from '@/assets/art';
import { itemArt, playerBookItem, type BookItem } from '@/lib/clash-book';
import { text, type ApiRecord } from '@/api/game-api';
import { HGrid } from '@/components/ui/HGrid';
import { Sheet } from '@/components/ui/Sheet';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BookItemModal } from './BookItemModal';

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
 * `.coc-units` -- the troop/hero/spell grid, each tile carrying the current
 * level and a progress bar towards maxLevel.
 *
 * Laid out by HGrid: one row for a short group, three rows that scroll
 * sideways for a long one. Hero equipment is 30+ items, and as a wrapping
 * grid it buried everything below it.
 *
 * Tapping a tile opens the Clash Book entry for that item at the player's
 * level. Items the community reference does not cover fall back to a plain
 * level readout, as in the reference app.
 */
export function UnitGrid({
  items,
  compact = false,
  label,
}: {
  items: ApiRecord[];
  compact?: boolean;
  /** Names the scroller for screen readers, e.g. "Spells". */
  label?: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [selected, setSelected] = useState<ApiRecord>();

  const book: BookItem | undefined = selected
    ? playerBookItem(selected['name'], selected['village'])
    : undefined;

  return (
    <>
      <HGrid
        items={items}
        tileWidth={compact ? TILE_COMPACT : TILE_REGULAR}
        gap={compact ? 6 : 8}
        accessibilityLabel={label}
        keyExtractor={(unit, i) => `${text(unit['name'])}-${i}`}
        renderItem={(unit) => {
          const entry = playerBookItem(unit['name'], unit['village']);
          const art = (entry && itemArt(entry)) ?? undefined;
          const source = art?.source ?? COC_ART[text(unit['name'])];
          const level = Number(unit['level']);
          const max = Number(unit['maxLevel']);
          const pct = max > 0 ? Math.min(100, (level / max) * 100) : 0;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${text(unit['name'])} level ${text(unit['level'])}`}
              onPress={() => setSelected(unit)}
              style={s.unit}
            >
              <View style={s.tile}>
                {source ? (
                  <Image
                    source={source}
                    resizeMode="contain"
                    style={s.portrait}
                  />
                ) : (
                  <Text style={s.fallback} numberOfLines={3}>
                    {text(unit['name'])}
                  </Text>
                )}
                <View style={s.levelBadge}>
                  <Text style={s.levelText}>{text(unit['level'])}</Text>
                </View>
                <View style={s.meter}>
                  <View style={[s.meterFill, { width: `${pct}%` }]} />
                </View>
              </View>
              {compact ? null : (
                <Text style={s.name} numberOfLines={2}>
                  {text(unit['name'])}
                </Text>
              )}
            </Pressable>
          );
        }}
      />

      {selected && book ? (
        <BookItemModal
          key={book.id}
          item={book}
          initialLevel={Number(selected['level'])}
          open
          onClose={() => setSelected(undefined)}
        />
      ) : null}

      {selected && !book ? (
        <Sheet open onClose={() => setSelected(undefined)} title={text(selected['name'])}>
          <View style={s.plain}>
            <Text style={s.plainCaption}>Live player collection</Text>
            <Text style={s.plainHeading}>
              Level {text(selected['level'])} / {text(selected['maxLevel'])}
            </Text>
            <Text style={s.plainBody}>
              Detailed stats for this item are not available in the reference snapshot.
            </Text>
          </View>
        </Sheet>
      ) : null}
    </>
  );
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
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: 2,
      overflow: 'hidden',
    },
    portrait: { width: '100%', height: '100%' },
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
    meter: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: t.border },
    meterFill: { height: '100%', backgroundColor: t.primary },
    name: {
      marginTop: 6,
      fontFamily: t.fonts.display,
      fontSize: 10,
      lineHeight: 14,
      minHeight: 28,
      color: t.foreground,
    },

    plain: { padding: 14 },
    plainCaption: { fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },
    plainHeading: { marginVertical: 16, fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    plainBody: { fontSize: 13, lineHeight: 19, color: t.foreground, fontFamily: t.fonts.sans },
  });
