import { text, type ApiRecord } from '@/api/game-api';
import { cardLevel, rarityOf } from './royale-cards';
import { gameLevel } from './royale-upgrades';
import type { MetaDeck } from './royale-meta';

/**
 * How well a player can actually field a meta deck.
 *
 * A top-ladder deck is not advice if three of its cards are locked, and it is
 * barely advice if the win condition is four levels under the bracket's.
 *
 * **Card levels are rarity-relative** and must go through `gameLevel` --
 * confirmed again in the live probe, where a level-16 Common and a level-11
 * Epic sat in the same deck and are both game level 16. Comparing the raw
 * numbers would call that deck wildly uneven.
 */

export type CardFit = {
  card: ApiRecord;
  owned: boolean;
  /** Game level the player has, or null if they do not own the card. */
  yours: number | null;
  /** Game level the sampled players ran it at. */
  theirs: number | null;
};

export type DeckFit = {
  cards: CardFit[];
  missing: number;
  /** Mean game levels behind the sampled players, over the cards you own. */
  levelGap: number | null;
  /** Nothing locked. */
  playable: boolean;
};

/** Game level of a card as it appeared in a battle log. */
function levelInBattle(card: ApiRecord): number | null {
  const level = card['level'];
  if (typeof level !== 'number') return null;
  return gameLevel(level, rarityOf(card));
}

/**
 * Match a meta deck against a player's collection.
 *
 * `owned` is the unlocked half of `splitCollection(...).cards`.
 */
export function deckFit(deck: MetaDeck, owned: ApiRecord[]): DeckFit {
  const mine = new Map(owned.map((c) => [text(c['id']), c]));
  const cards: CardFit[] = deck.cards.map((card) => {
    const held = mine.get(text(card['id']));
    return {
      card,
      owned: Boolean(held),
      yours: held ? cardLevel(held) : null,
      theirs: levelInBattle(card),
    };
  });

  const gaps = cards
    .filter((c) => c.owned && c.yours !== null && c.theirs !== null)
    .map((c) => c.theirs! - c.yours!);

  return {
    cards,
    missing: cards.filter((c) => !c.owned).length,
    levelGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    playable: cards.every((c) => c.owned),
  };
}

/**
 * Meta score adjusted for what this player can field.
 *
 * A locked card is a hard stop rather than a penalty -- the deck simply cannot
 * be played -- so unplayable decks keep their meta score and are flagged, and
 * only the level gap scales it. Four game levels down is roughly a lost
 * matchup, so the penalty reaches zero there rather than going negative.
 */
export function fitScore(deck: MetaDeck, fit: DeckFit): number {
  if (!fit.playable) return deck.score * 0.25;
  if (fit.levelGap === null) return deck.score;
  const penalty = Math.max(0, 1 - Math.max(0, fit.levelGap) / 4);
  return deck.score * (0.4 + 0.6 * penalty);
}
