import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

/**
 * A fixed-height, horizontally scrolling grid.
 *
 * Replaces the wrapping grids that used to run the full length of the page:
 * hero equipment alone is 30+ tiles, which pushed everything below it off
 * screen. Three rows cap the height whatever the group's size, and the rest
 * scrolls sideways.
 *
 * Items fill **column-major** -- 1,2,3 down the first column, 4,5,6 down the
 * next -- so reading order follows the direction of travel.
 *
 * Groups of eight or fewer stay on a single row. A 3-row block only earns its
 * height once there is enough in it to fill one; below that it reads as a
 * ragged square (six heroes becoming a 3x2) for no gain.
 */
const SINGLE_ROW_MAX = 8;
const MAX_ROWS = 3;

export function HGrid<T>({
  items,
  renderItem,
  tileWidth,
  gap = 8,
  fill = false,
  keyExtractor,
  accessibilityLabel,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * Fixed pixel width per tile. Deliberately not a percentage: children of a
   * horizontal ScrollView's content container have no definite width to
   * resolve one against, so a percentage collapses to zero.
   */
  tileWidth: number;
  gap?: number;
  /**
   * Stretch the columns to fill the width when they all fit without
   * scrolling.
   *
   * Off by default, because `tileWidth` is usually a deliberate art size -- a
   * four-tile hero row would balloon to 134px a tile. Worth turning on where
   * the block is meant to read as a filled grid rather than a scroller, like
   * the nine Clan Capital districts, which otherwise leave a dead strip down
   * the right of their panel.
   */
  fill?: boolean;
  keyExtractor?: (item: T, index: number) => string;
  accessibilityLabel?: string;
}) {
  const rows = items.length <= SINGLE_ROW_MAX ? 1 : MAX_ROWS;
  const [available, setAvailable] = useState(0);

  const columns = useMemo(() => {
    const count = Math.ceil(items.length / rows);
    return Array.from({ length: count }, (_, c) =>
      items.slice(c * rows, c * rows + rows).map((item, r) => ({ item, index: c * rows + r })),
    );
  }, [items, rows]);

  if (!items.length) return null;

  // Only widen, and only once the content is known to fit -- a grid that
  // genuinely overflows keeps its tile size and scrolls as before.
  const gutters = (columns.length - 1) * gap;
  const width =
    fill && available > 0 && columns.length * tileWidth + gutters <= available
      ? (available - gutters) / columns.length
      : tileWidth;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      style={s.scroll}
      contentContainerStyle={[s.track, { gap }]}
      onLayout={fill ? (e) => setAvailable(e.nativeEvent.layout.width) : undefined}
    >
      {columns.map((column, c) => (
        <View key={c} style={[s.column, { width, gap }]}>
          {column.map(({ item, index }) => (
            <View key={keyExtractor?.(item, index) ?? index}>{renderItem(item, index)}</View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  // flexGrow: 0 keeps the scroller from eating the remaining vertical space of
  // the page scroller it is nested in -- the same fix ChipRow needs.
  scroll: { flexGrow: 0 },
  track: { flexDirection: 'row' },
  // Top-aligned so a short final column does not centre itself against the
  // full-height ones beside it.
  column: { flexDirection: 'column', alignItems: 'stretch' },
});
