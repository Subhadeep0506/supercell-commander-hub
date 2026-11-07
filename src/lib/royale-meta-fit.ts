import { text, type ApiRecord } from '@/api/game-api';
import { cardLevel, rarityOf } from './royale-cards';
import { gameLevel } from './royale-upgrades';
import type { MetaDeck } from './royale-meta';



export type CardFit = {
  card: ApiRecord;
  owned: boolean;

  yours: number | null;

  theirs: number | null;
};

export type DeckFit = {
  cards: CardFit[];
  missing: number;

  levelGap: number | null;

  playable: boolean;
};


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


export function fitScore(deck: MetaDeck, fit: DeckFit): number {
  if (!fit.playable) return deck.score * 0.25;
  if (fit.levelGap === null) return deck.score;
  const penalty = Math.max(0, 1 - Math.max(0, fit.levelGap) / 4);
  return deck.score * (0.4 + 0.6 * penalty);
}
