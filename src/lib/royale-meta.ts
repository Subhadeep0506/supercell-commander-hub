import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { averageElixir } from './royale-cards';

/**
 * The meta, computed rather than looked up.
 *
 * There is no `/meta-decks` endpoint and there never was. What there is, is a
 * battle log that returns **both** players' complete eight-card decks and the
 * result -- so sampling enough logs and counting is the whole method, and it
 * is the same method the big sites use.
 *
 * Everything here is pure. The fetching half is `royale-meta-sample.ts`.
 */

/**
 * Battle types worth counting. **Probed live, and the obvious guess is wrong.**
 *
 * A ranked battle is `type: "pathOfLegend"`, *not* `"PvP"` -- filtering on
 * `PvP`, which is what every write-up of this technique says to do, discards
 * every ranked battle there is. `PvP` is the Trophy Road ladder and is worth
 * counting too, but it is the lower half of the game, not the competitive one.
 *
 * Everything else in a real log is noise: `friendly`, `clanMate`, `quickplay`
 * and `trail` are unranked, and in one sampled top player's log 30 of 30
 * battles were friendlies.
 */
const COMPETITIVE = ['pathOfLegend', 'PvP'];

/**
 * Which tier a battle was fought at.
 *
 * **Two different systems, and each one's field is junk in the other.** Probed
 * live: every ranked battle reports `arena: "Legendary Arena"` whatever league
 * it was played in, so arena cannot bucket ranked play. Trophy Road battles
 * are the mirror image -- they report a `leagueNumber` of `1` regardless,
 * because Path of Legends has not started for that account, so reading it
 * there invents a league the player has never been in.
 *
 * Reading one field for both is the bug this function exists to prevent.
 */
export type Bracket =
  | { kind: 'league'; id: string; label: string; order: number }
  | { kind: 'arena'; id: string; label: string; order: number };

/** Path of Legends league names, 1-10. `leagueNumber` indexes this directly. */
const LEAGUE_NAMES = [
  'Challenger I',
  'Challenger II',
  'Challenger III',
  'Master I',
  'Master II',
  'Master III',
  'Champion',
  'Grand Champion',
  'Royal Champion',
  'Ultimate Champion',
];

export function bracketOf(battle: ApiRecord): Bracket | undefined {
  const type = text(battle['type']);
  if (!COMPETITIVE.includes(type)) return undefined;

  if (type === 'pathOfLegend') {
    const n = Number(battle['leagueNumber']);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return {
      kind: 'league',
      id: `league:${n}`,
      label: LEAGUE_NAMES[n - 1] ?? `League ${n}`,
      // Ranked sorts above every Trophy Road arena.
      order: 1000 + n,
    };
  }

  const arena = record(battle['arena']);
  const id = text(arena['id']);
  if (id === '—') return undefined;
  return {
    kind: 'arena',
    id: `arena:${id}`,
    label: text(arena['name']),
    order: Number(id) || 0,
  };
}

/**
 * Order-independent identity for a meta deck, **including evolutions**.
 *
 * Two decks holding the same eight cards but evolving different ones play
 * differently and are not the same deck, so the evolved ids are part of the
 * key rather than a detail hanging off it.
 *
 * Deliberately *not* `deckKey` from royale-decks.ts, which `myDecks` and
 * `deckStats` depend on the exact behaviour of. The tower troop is left out,
 * matching `deckLink` -- the game's own copy-deck URL carries only the eight.
 */
export function metaDeckKey(cards: ApiRecord[]): string {
  const ids = cards.map((c) => text(c['id'])).sort();
  const evolved = cards
    .filter((c) => Number(c['evolutionLevel']) > 0)
    .map((c) => text(c['id']))
    .sort();
  return `${ids.join(',')}|evo:${evolved.join(',')}`;
}

export type MetaDeck = {
  key: string;
  cards: ApiRecord[];
  /** The tower troop seen most often with this deck, where one was reported. */
  towerCard?: ApiRecord;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  /** Plain win rate, 0-100. Honest, and not what the list is sorted by. */
  winRate: number;
  /** Lower bound of the 95% Wilson interval, 0-1. Small samples sink. */
  confidence: number;
  /** Share of this bracket's deck observations, 0-1. */
  usage: number;
  score: number;
  averageElixir: number | null;
  /** Record against decks containing each of the bracket's most-used cards. */
  counters: Record<string, { wins: number; matches: number }>;
};

export type BracketStats = {
  bracket: Bracket;
  /** Deck observations -- two per battle, one for each side. */
  observations: number;
  decks: MetaDeck[];
  /** Most-used cards, commonest first. Far more reliable than any deck row. */
  popularCards: { card: ApiRecord; uses: number; share: number }[];
};

export type MetaSnapshot = {
  brackets: BracketStats[];
  /** Competitive battles that went into it, after filtering. */
  battles: number;
  /** Battles rejected as friendlies, 2v2, or otherwise uncountable. */
  skipped: number;
};

/**
 * Minimum matches before a deck is listed.
 *
 * The arithmetic, not a round number: ~100 battle logs is ~3,000 battles, of
 * which ~75% are competitive, each contributing two deck observations -- call
 * it 4,500, spread over many hundreds of distinct decks. The 30-match floor
 * the textbook method uses would empty the list at this sample size. Eight is
 * low enough to show something and high enough that `confidence` can do its
 * job, and every row prints its own match count so a thin one reads as thin.
 */
export const MIN_MATCHES = 8;

/** How many of a bracket's top cards the counter table is built against. */
export const COUNTER_CARDS = 6;

/**
 * Lower bound of the Wilson score interval at 95%.
 *
 * A raw win rate is useless here -- a deck seen three times and won three
 * times would top the table at 100%. Wilson folds the sample size into the
 * number itself, so 3/3 scores below 60/80, and it needs no prior to tune.
 */
export function wilsonLower(wins: number, n: number): number {
  if (n <= 0) return 0;
  const z = 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (centre - margin) / d);
}

type Side = { cards: ApiRecord[]; support: ApiRecord[]; crowns: number };

/** The two sides of a countable 1v1, or undefined if it is not one. */
function sidesOf(battle: ApiRecord): [Side, Side] | undefined {
  const team = rows(battle['team']);
  const opponent = rows(battle['opponent']);
  // 2v2 and party modes carry two players a side and cannot establish which
  // deck won.
  if (team.length !== 1 || opponent.length !== 1) return undefined;
  const a = team[0]!;
  const b = opponent[0]!;
  const aCards = rows(a['cards']);
  const bCards = rows(b['cards']);
  if (aCards.length !== 8 || bCards.length !== 8) return undefined;
  const aCrowns = a['crowns'];
  const bCrowns = b['crowns'];
  if (typeof aCrowns !== 'number' || typeof bCrowns !== 'number') return undefined;
  return [
    { cards: aCards, support: rows(a['supportCards']), crowns: aCrowns },
    { cards: bCards, support: rows(b['supportCards']), crowns: bCrowns },
  ];
}

type Building = {
  key: string;
  cards: ApiRecord[];
  towers: Map<string, { card: ApiRecord; n: number }>;
  wins: number;
  losses: number;
  draws: number;
  /** Opponent card id -> record against decks containing it. */
  versus: Map<string, { wins: number; matches: number }>;
};

/**
 * Count every competitive battle in the sample into its bracket.
 *
 * **Both sides count.** One battle is two deck observations -- a win for one
 * deck and a loss for the other -- which doubles the sample for free and, more
 * importantly, removes the bias of only ever counting the decks of the players
 * we happened to sample. Their opponents are a broader population than they
 * are.
 */
export function aggregate(battles: ApiRecord[]): MetaSnapshot {
  const buckets = new Map<string, { bracket: Bracket; decks: Map<string, Building>; obs: number }>();
  const cardUse = new Map<string, Map<string, { card: ApiRecord; n: number }>>();
  let counted = 0;
  let skipped = 0;

  for (const battle of battles) {
    const bracket = bracketOf(battle);
    const sides = bracket ? sidesOf(battle) : undefined;
    if (!bracket || !sides) {
      skipped += 1;
      continue;
    }
    counted += 1;

    let bucket = buckets.get(bracket.id);
    if (!bucket) {
      bucket = { bracket, decks: new Map(), obs: 0 };
      buckets.set(bracket.id, bucket);
    }
    let uses = cardUse.get(bracket.id);
    if (!uses) {
      uses = new Map();
      cardUse.set(bracket.id, uses);
    }

    for (const [self, foe] of [
      [sides[0], sides[1]],
      [sides[1], sides[0]],
    ] as [Side, Side][]) {
      bucket.obs += 1;
      const key = metaDeckKey(self.cards);
      let entry = bucket.decks.get(key);
      if (!entry) {
        entry = { key, cards: self.cards, towers: new Map(), wins: 0, losses: 0, draws: 0, versus: new Map() };
        bucket.decks.set(key, entry);
      }
      if (self.crowns > foe.crowns) entry.wins += 1;
      else if (self.crowns < foe.crowns) entry.losses += 1;
      else entry.draws += 1;

      for (const tower of self.support) {
        const id = text(tower['id']);
        const seen = entry.towers.get(id);
        if (seen) seen.n += 1;
        else entry.towers.set(id, { card: tower, n: 1 });
      }

      for (const card of self.cards) {
        const id = text(card['id']);
        const seen = uses.get(id);
        if (seen) seen.n += 1;
        else uses.set(id, { card, n: 1 });
      }

      // Recorded per opponent card, so any card can later be asked "how does
      // this deck do into it" without a second pass over the battles.
      const won = self.crowns > foe.crowns ? 1 : 0;
      for (const id of new Set(foe.cards.map((c) => text(c['id'])))) {
        const seen = entry.versus.get(id) ?? { wins: 0, matches: 0 };
        seen.wins += won;
        seen.matches += 1;
        entry.versus.set(id, seen);
      }
    }
  }

  const brackets: BracketStats[] = [];
  for (const [id, bucket] of buckets) {
    const uses = cardUse.get(id) ?? new Map();
    const popularCards = [...uses.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, COUNTER_CARDS)
      .map((u) => ({ card: u.card, uses: u.n, share: bucket.obs > 0 ? u.n / bucket.obs : 0 }));
    const counterIds = popularCards.map((p) => text(p.card['id']));

    const decks: MetaDeck[] = [];
    let peak = 0;
    for (const entry of bucket.decks.values()) {
      const matches = entry.wins + entry.losses + entry.draws;
      if (matches < MIN_MATCHES) continue;
      peak = Math.max(peak, matches);
    }
    for (const entry of bucket.decks.values()) {
      const matches = entry.wins + entry.losses + entry.draws;
      if (matches < MIN_MATCHES) continue;
      const confidence = wilsonLower(entry.wins, matches);
      // Usage is normalised against the most-played deck in the bracket, not
      // against the whole bracket: deck shares are tiny fractions, and halving
      // a tiny fraction leaves the score entirely determined by win rate.
      const usage = peak > 0 ? matches / peak : 0;
      const tower = [...entry.towers.values()].sort((a, b) => b.n - a.n)[0];
      const counters: MetaDeck['counters'] = {};
      for (const cardId of counterIds) {
        const seen = entry.versus.get(cardId);
        if (seen && seen.matches > 0) counters[cardId] = seen;
      }
      decks.push({
        key: entry.key,
        cards: entry.cards,
        towerCard: tower?.card,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws,
        matches,
        winRate: (entry.wins / matches) * 100,
        confidence,
        usage: bucket.obs > 0 ? matches / bucket.obs : 0,
        score: 0.5 * usage + 0.5 * confidence,
        averageElixir: averageElixir(entry.cards),
        counters,
      });
    }
    decks.sort((a, b) => b.score - a.score || b.matches - a.matches);
    brackets.push({ bracket: bucket.bracket, observations: bucket.obs, decks, popularCards });
  }

  // Hardest bracket first -- ranked above Trophy Road, top league above the rest.
  brackets.sort((a, b) => b.bracket.order - a.bracket.order);
  return { brackets, battles: counted, skipped };
}

/**
 * The bracket this player is actually in.
 *
 * Path of Legends if they have reached it -- `currentPathOfLegendSeasonResult`
 * is `null` below Legend arena, which is the common case -- otherwise their
 * Trophy Road arena. Same two-system split as `bracketOf`, read from the other
 * end.
 */
export function playerBracketId(player: ApiRecord): string | undefined {
  const pol = record(player['currentPathOfLegendSeasonResult']);
  const league = Number(pol['leagueNumber']);
  if (Number.isFinite(league) && league >= 1) return `league:${league}`;
  const arenaId = text(record(player['arena'])['id']);
  return arenaId === '—' ? undefined : `arena:${arenaId}`;
}
