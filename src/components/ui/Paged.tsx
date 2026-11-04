import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button } from './Button';

/**
 * Incremental paging for the long lists, shared by both games.
 *
 * Every list in the app renders whatever the API returned in one go -- 200 rows
 * on the Clash of Clans ladder, 123 cards in the Royale collection, 265 items in
 * the Clash Book. This caps the first render at ten and grows it a page at a
 * time.
 *
 * Client-side rather than against the API, because almost none of these
 * endpoints page: a ranking returns its whole board, a clan returns its whole
 * roster. The two that *do* carry a cursor -- capital raid seasons and the river
 * race log -- keep their own `after` paging and do not use this.
 *
 * Replaces the two hand-rolled "show the first five, then all" blocks that used
 * to live in CrBattles and CocBattles, so there is one paging behaviour rather
 * than three.
 */
export const PAGE_SIZE = 10;

export type Paged<T> = {
  shown: T[];
  hasMore: boolean;
  /** How many are still hidden -- the figure on the button. */
  remaining: number;
  loadMore: () => void;
};

/**
 * `resetKey` is what collapses the list back to one page.
 *
 * It has to be passed explicitly rather than derived from `items`: switching a
 * sort chip hands back the same rows in a new order, so a length check would
 * leave you four pages into a list that no longer means what it did. Pass
 * whatever the user can change -- the sort id, the search query, the active
 * filter -- joined into one value.
 *
 * The key is held *in state beside the count* rather than compared in an effect,
 * so the reset lands in the same render as the change. An effect would paint one
 * frame of page four first.
 */
export function usePaged<T>(items: T[], resetKey: unknown = '', size = PAGE_SIZE): Paged<T> {
  const [state, setState] = useState({ key: resetKey, count: size });
  const count = state.key === resetKey ? state.count : size;
  const shown = items.slice(0, count);
  return {
    shown,
    hasMore: items.length > count,
    remaining: Math.max(0, items.length - count),
    loadMore: () => setState({ key: resetKey, count: count + size }),
  };
}

/**
 * The button under a paged list.
 *
 * Renders nothing when there is nothing left, so call sites can place it
 * unconditionally.
 */
export function LoadMore({
  remaining,
  onPress,
  size = PAGE_SIZE,
  noun = 'more',
  style,
}: {
  remaining: number;
  onPress: () => void;
  size?: number;
  /** "more" by default; pass a plural noun where the row kind is not obvious. */
  noun?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (remaining <= 0) return null;
  const next = Math.min(size, remaining);
  return (
    <Button
      variant="outline"
      size="sm"
      style={style}
      accessibilityLabel="Load more"
      onPress={onPress}
    >
      {`Load ${next} ${noun} · ${remaining} left`}
    </Button>
  );
}
