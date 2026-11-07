import { rows, text, type ApiRecord } from '@/api/game-api';
import { averageElixir, averageLevel } from './royale-cards';
import { outcomeOf, parseApiDate, sideOf } from './royale-battles';

/**
 * Ported from frontend/src/lib/royale-decks.ts, plus `myDecks`.
 *
 * One deliberate change: the frontend reported an "average API level", which
 * averages five different rarity scales together and is not a number that
 * means anything. This reports the average *game* level instead.
 */

export const ARCHETYPES = [
  {
    name: 'Hog cycle',
    style: 'cycle',
    cards: ['Hog Rider', 'Musketeer', 'Cannon', 'Fireball', 'The Log', 'Ice Golem', 'Ice Spirit', 'Skeletons'],
  },
  {
    name: 'Log bait',
    style: 'bait',
    cards: ['Goblin Barrel', 'Princess', 'Knight', 'Goblin Gang', 'Inferno Tower', 'Rocket', 'The Log', 'Ice Spirit'],
  },
  {
    name: 'Golem beatdown',
    style: 'beatdown',
    cards: ['Golem', 'Night Witch', 'Baby Dragon', 'Mega Minion', 'Lumberjack', 'Lightning', 'Tornado', 'Barbarian Barrel'],
  },
  {
    name: 'Legendary bridge spam',
    style: 'bridge',
    cards: ['P.E.K.K.A', 'Battle Ram', 'Bandit', 'Royal Ghost', 'Electro Wizard', 'Magic Archer', 'Poison', 'Zap'],
  },
] as const;


export const deckKey = (cards: ApiRecord[]) =>
  cards
    .map((c) => text(c['id']))
    .sort()
    .join(',');

export type DeckStats = {
  average: number | null;
  averageLevel: number | null;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  winRate: number | null;
};

/**
 * Record for this exact eight-card deck across the returned log.
 *
 * Multiplayer, incomplete and non-eight-card records cannot establish an
 * exact-deck result, so they are skipped rather than counted as unknowns.
 */
export function deckStats(cards: ApiRecord[], battles: ApiRecord[]): DeckStats {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const battle of battles) {
    const team = rows(battle['team']);
    const rivals = rows(battle['opponent']);
    if (
      team.length !== 1 ||
      rivals.length !== 1 ||
      cards.length !== 8 ||
      deckKey(rows(team[0]?.['cards'])) !== deckKey(cards)
    ) {
      continue;
    }
    const a = team[0]?.['crowns'];
    const z = rivals[0]?.['crowns'];
    if (typeof a !== 'number' || typeof z !== 'number') continue;
    if (a > z) wins += 1;
    else if (a < z) losses += 1;
    else draws += 1;
  }
  const matches = wins + losses + draws;
  return {
    average: averageElixir(cards),
    averageLevel: averageLevel(cards),
    wins,
    losses,
    draws,
    matches,
    winRate: matches ? (wins / matches) * 100 : null,
  };
}

export function referenceDeck(names: readonly string[], owned: ApiRecord[]) {
  return names
    .map((name) => owned.find((c) => text(c['name']).toLowerCase() === name.toLowerCase()))
    .filter((c): c is ApiRecord => Boolean(c));
}

export function generateDeck(owned: ApiRecord[], coreId: string, style: string, variation = 0) {
  const pool = owned.filter((c) => typeof c['level'] === 'number' && Number(c['level']) > 0);
  const candidates = ARCHETYPES.filter((a) => a.style === style || style === 'balanced');
  const template = candidates[variation % Math.max(candidates.length, 1)] ?? ARCHETYPES[0];
  const core = pool.find((c) => text(c['id']) === coreId);
  const selected: ApiRecord[] = core ? [core] : [];
  const ordered = [
    ...(template ? referenceDeck(template.cards, pool) : []),
    ...pool.slice(variation % Math.max(pool.length, 1)),
    ...pool,
  ];
  for (const card of ordered) {
    if (selected.length === 8) break;
    if (!selected.some((c) => c['id'] === card['id'])) selected.push(card);
  }
  return selected;
}


export function observedDecks(battles: ApiRecord[]) {
  const found = new Map<string, { name: string; cards: ApiRecord[]; tag: string }>();
  for (const battle of battles) {
    for (const player of [...rows(battle['team']), ...rows(battle['opponent'])]) {
      const cards = rows(player['cards']);
      if (cards.length !== 8) continue;
      const key = deckKey(cards);
      if (!found.has(key)) {
        found.set(key, { name: text(player['name']), tag: text(player['tag']), cards });
      }
    }
  }
  return [...found.values()];
}

export type PlayedDeck = {
  key: string;
  cards: ApiRecord[];
  supportCards: ApiRecord[];
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  averageElixir: number | null;
  averageLevel: number | null;
  lastPlayed: Date | null;
  isCurrent: boolean;
};


export function myDecks(
  battles: ApiRecord[],
  tag: string,
  currentDeck: ApiRecord[] = [],
  currentSupport: ApiRecord[] = [],
): PlayedDeck[] {
  const found = new Map<string, PlayedDeck>();

  const blank = (cards: ApiRecord[], supportCards: ApiRecord[], isCurrent: boolean): PlayedDeck => ({
    key: deckKey(cards),
    cards,
    supportCards,
    plays: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: null,
    averageElixir: averageElixir(cards),
    averageLevel: averageLevel(cards),
    lastPlayed: null,
    isCurrent,
  });

  if (currentDeck.length) {
    const entry = blank(currentDeck, currentSupport, true);
    found.set(entry.key, entry);
  }

  for (const battle of battles) {
    const side = sideOf(battle, tag);
    const me = rows(battle[side])[0];
    if (!me) continue;
    const cards = rows(me['cards']);
    if (cards.length !== 8) continue;
    const key = deckKey(cards);
    let entry = found.get(key);
    if (!entry) {
      entry = blank(cards, rows(me['supportCards']), false);
      found.set(key, entry);
    }
    entry.plays += 1;
    const when = parseApiDate(battle['battleTime']);
    if (when && (!entry.lastPlayed || when > entry.lastPlayed)) entry.lastPlayed = when;
    const outcome = outcomeOf(battle, tag);
    if (outcome === 'victory') entry.wins += 1;
    else if (outcome === 'defeat') entry.losses += 1;
    else if (outcome === 'draw') entry.draws += 1;
  }

  return [...found.values()]
    .map((deck) => {
      const decided = deck.wins + deck.losses + deck.draws;
      return { ...deck, winRate: decided ? (deck.wins / decided) * 100 : null };
    })
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.plays !== b.plays) return b.plays - a.plays;
      return (b.lastPlayed?.getTime() ?? 0) - (a.lastPlayed?.getTime() ?? 0);
    });
}

/**
 * Copy-to-game deep link.
 *
 * This is the format the reference app uses and it works. Note it carries the
 * eight cards only -- the tower troop is not part of this link, so a copied
 * deck arrives with whatever tower troop the player last used.
 */
export function deckLink(cards: ApiRecord[]): string | null {
  if (cards.length !== 8) return null;
  return `https://link.clashroyale.com/en?action=copyDeck&deck=${cards
    .map((c) => text(c['id']))
    .join(';')}`;
}
