import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { gameLevel } from './royale-upgrades';




export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'champion'] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

export function rarityOf(card: ApiRecord): Rarity {
  const value = text(card['rarity']).toLowerCase();
  return (RARITY_ORDER as readonly string[]).includes(value) ? (value as Rarity) : 'common';
}

export function rarityRank(card: ApiRecord): number {
  return RARITY_ORDER.indexOf(rarityOf(card));
}

/**
 * The level shown in game, or null for a card the player has not found.
 *
 * Never read `card.level` directly -- see royale-upgrades.
 */
export function cardLevel(card: ApiRecord): number | null {
  const level = card['level'];
  return typeof level === 'number' ? gameLevel(level, rarityOf(card)) : null;
}


export function canEvolve(card: ApiRecord): boolean {
  return typeof card['maxEvolutionLevel'] === 'number' && card['maxEvolutionLevel'] > 0;
}


export function isEvolved(card: ApiRecord): boolean {
  return typeof card['evolutionLevel'] === 'number' && card['evolutionLevel'] > 0;
}

export function starLevel(card: ApiRecord): number {
  const value = card['starLevel'];
  return typeof value === 'number' ? value : 0;
}

export type Collection = {
  unlocked: ApiRecord[];
  locked: ApiRecord[];
};

export type Split = {
  cards: Collection;
  support: Collection;
};

function splitOne(catalog: ApiRecord[], owned: ApiRecord[]): Collection {
  const byId = new Map(owned.map((c) => [c['id'], c]));
  const unlocked: ApiRecord[] = [];
  const locked: ApiRecord[] = [];
  for (const entry of catalog) {
    const match = byId.get(entry['id']);
    if (match) {
      // The player's copy is richer -- it carries level, count, starLevel and
      // evolutionLevel, none of which the catalog has. Keep the catalog's
      // fields underneath so maxEvolutionLevel survives for cards the player
      // owns but has never evolved.
      unlocked.push({ ...entry, ...match });
    } else {
      locked.push(entry);
    }
  }
  // A card the player holds that the catalog does not list would otherwise
  // vanish. That should not happen, but silently dropping an owned card is a
  // worse failure than showing one twice.
  for (const held of owned) {
    if (!catalog.some((entry) => entry['id'] === held['id'])) unlocked.push(held);
  }
  return { unlocked, locked };
}

/**
 * Split both the card list and the tower-troop list against a player.
 *
 * `catalog` is the parsed `/v1/cards` body; `player` the parsed
 * `/v1/players/{tag}` body.
 */
export function splitCollection(catalog: unknown, player: unknown): Split {
  const cat = record(catalog);
  const p = record(player);
  return {
    cards: splitOne(rows(cat['items']), rows(p['cards'])),
    support: splitOne(rows(cat['supportItems']), rows(p['supportCards'])),
  };
}

export type CardSort = 'name' | 'level' | 'elixir' | 'rarity';

/**
 * Sorted copy. Locked cards have no level, so they sort last under `level`
 * rather than ahead of everything as a zero would.
 */
export function sortCards(cards: ApiRecord[], by: CardSort): ApiRecord[] {
  const name = (c: ApiRecord) => text(c['name']);
  return [...cards].sort((a, b) => {
    switch (by) {
      case 'level': {
        const x = cardLevel(a);
        const y = cardLevel(b);
        if (x === null && y === null) return name(a).localeCompare(name(b));
        if (x === null) return 1;
        if (y === null) return -1;
        return y - x || name(a).localeCompare(name(b));
      }
      case 'elixir': {
        const x = typeof a['elixirCost'] === 'number' ? a['elixirCost'] : Infinity;
        const y = typeof b['elixirCost'] === 'number' ? b['elixirCost'] : Infinity;
        return x - y || name(a).localeCompare(name(b));
      }
      case 'rarity':
        return rarityRank(b) - rarityRank(a) || name(a).localeCompare(name(b));
      default:
        return name(a).localeCompare(name(b));
    }
  });
}


export function rarityCounts(cards: ApiRecord[]): Record<Rarity, number> {
  const counts = { common: 0, rare: 0, epic: 0, legendary: 0, champion: 0 };
  for (const card of cards) counts[rarityOf(card)] += 1;
  return counts;
}

/**
 * Average of a deck's elixir costs, or null unless every card has one.
 *
 * A partial average reads as a real figure and is not one.
 */
export function averageElixir(cards: ApiRecord[]): number | null {
  const costs = cards
    .map((c) => c['elixirCost'])
    .filter((v): v is number => typeof v === 'number');
  if (!cards.length || costs.length !== cards.length) return null;
  return costs.reduce((a, b) => a + b, 0) / costs.length;
}

/**
 * Average *game* level of a deck, or null unless every card has one.
 *
 * The frontend reported the raw API average, which mixes five different scales
 * and is not a number that means anything.
 */
export function averageLevel(cards: ApiRecord[]): number | null {
  const levels = cards.map(cardLevel).filter((v): v is number => v !== null);
  if (!cards.length || levels.length !== cards.length) return null;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}
