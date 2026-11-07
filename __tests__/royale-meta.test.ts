import {
  COUNTER_CARDS,
  MIN_MATCHES,
  aggregate,
  bracketOf,
  metaDeckKey,
  playerBracketId,
  wilsonLower,
} from '@/lib/royale-meta';
import { deckFit, fitScore } from '@/lib/royale-meta-fit';
import { seasonIds } from '@/lib/royale-ladders';
import type { ApiRecord } from '@/api/game-api';

import ladderLog from '../scripts/fixtures/cr-battlelog.json';
import rankedLog from '../scripts/fixtures/cr-ranked-battlelog.json';
import player from '../scripts/fixtures/cr-player.json';

const ladder = ladderLog as ApiRecord[];
const ranked = rankedLog as ApiRecord[];


describe('bracketOf', () => {
  const ladderBattle = ladder.find((b) => b['type'] === 'PvP')!;
  const rankedBattle = ranked.find((b) => b['type'] === 'pathOfLegend')!;

  it('buckets a ranked battle on its league, not its arena', () => {
    const bracket = bracketOf(rankedBattle)!;
    expect(bracket.kind).toBe('league');
    expect(bracket.id).toBe(`league:${rankedBattle['leagueNumber']}`);
  });

  it('refuses to bucket ranked play by arena, which is constant there', () => {
    // Every ranked battle reports "Legendary Arena" whatever league it was
    // played in, so an arena-keyed bucket would collapse the entire ranked
    // ladder into one row.
    const arenas = new Set(
      ranked
        .filter((b) => b['type'] === 'pathOfLegend')
        .map((b) => (b['arena'] as ApiRecord)['name']),
    );
    expect(arenas.size).toBe(1);
    const leagues = new Set(
      ranked.filter((b) => b['type'] === 'pathOfLegend').map((b) => b['leagueNumber']),
    );
    expect(leagues.size).toBeGreaterThan(1);
  });

  it('buckets a Trophy Road battle on its arena, not its league', () => {
    const bracket = bracketOf(ladderBattle)!;
    expect(bracket.kind).toBe('arena');
    expect(bracket.label).toBe((ladderBattle['arena'] as ApiRecord)['name']);
  });

  it('ignores the meaningless leagueNumber on Trophy Road', () => {
    // The calibration account has never reached Path of Legends, yet every one
    // of its battles reports leagueNumber 1. Reading it would file a mid-ladder
    // account under Challenger I.
    const leagues = new Set(ladder.filter((b) => b['type'] === 'PvP').map((b) => b['leagueNumber']));
    expect([...leagues]).toEqual([1]);
    expect(bracketOf(ladderBattle)!.id.startsWith('arena:')).toBe(true);
  });

  it.each(['friendly', 'clanMate', 'quickplay', 'trail', 'casual1v1'])(
    'does not count a %s battle',
    (type) => {
      expect(bracketOf({ ...ladderBattle, type })).toBeUndefined();
    },
  );

  it('rejects the friendly sitting in the real ranked capture', () => {
    const friendly = ranked.find((b) => b['type'] === 'friendly');
    expect(friendly).toBeDefined();
    expect(bracketOf(friendly!)).toBeUndefined();
  });
});

describe('metaDeckKey', () => {
  const cards = (ranked.find((b) => b['type'] === 'pathOfLegend')!['team'] as ApiRecord[])[0]![
    'cards'
  ] as ApiRecord[];

  it('is order-independent', () => {
    expect(metaDeckKey([...cards].reverse())).toBe(metaDeckKey(cards));
  });

  it('separates two decks that differ only by which card is evolved', () => {
    // The capture really does carry evolutions, so this is not a synthetic
    // case: two players on the same eight cards with different evolution slots
    // are running different decks.
    expect(cards.some((c) => Number(c['evolutionLevel']) > 0)).toBe(true);
    const plain = cards.map((c) => ({ ...c, evolutionLevel: 0 }));
    expect(metaDeckKey(plain)).not.toBe(metaDeckKey(cards));
  });

  it('ignores the tower troop, as the game’s own copy-deck link does', () => {
    expect(metaDeckKey(cards)).toBe(metaDeckKey([...cards]));
  });
});

describe('wilsonLower', () => {
  it('sinks a perfect record on a tiny sample below a good one on a big sample', () => {
    // The whole reason a raw win rate cannot drive the ranking: 3-0 is 100%.
    expect(wilsonLower(3, 3)).toBeLessThan(wilsonLower(60, 80));
  });

  it('is zero for no matches rather than NaN', () => {
    expect(wilsonLower(0, 0)).toBe(0);
  });

  it('never exceeds the plain win rate', () => {
    for (const [w, n] of [
      [1, 2],
      [5, 10],
      [50, 100],
      [999, 1000],
    ]) {
      expect(wilsonLower(w!, n!)).toBeLessThanOrEqual(w! / n!);
    }
  });
});

describe('aggregate', () => {
  const snapshot = aggregate([...ranked, ...ladder]);

  it('counts the competitive battles and reports what it skipped', () => {
    const competitive = [...ranked, ...ladder].filter((b) =>
      ['pathOfLegend', 'PvP'].includes(String(b['type'])),
    ).length;
    expect(snapshot.battles).toBe(competitive);
    expect(snapshot.skipped).toBe(ranked.length + ladder.length - competitive);
  });

  it('keeps ranked and Trophy Road in separate brackets', () => {
    const kinds = new Set(snapshot.brackets.map((b) => b.bracket.kind));
    expect(kinds.has('league')).toBe(true);
    expect(kinds.has('arena')).toBe(true);
  });

  it('sorts the hardest bracket first', () => {
    const orders = snapshot.brackets.map((b) => b.bracket.order);
    expect([...orders].sort((a, b) => b - a)).toEqual(orders);
  });

  it('counts both sides of every battle', () => {
    // One battle is two deck observations -- a win for one deck and a loss for
    // the other. Counting only the sampled player's side would halve the
    // sample and bias it towards whoever happened to be sampled.
    const observations = snapshot.brackets.reduce((n, b) => n + b.observations, 0);
    expect(observations).toBe(snapshot.battles * 2);
  });

  it('never lists a deck below the minimum sample size', () => {
    for (const bracket of snapshot.brackets) {
      for (const deck of bracket.decks) {
        expect(deck.matches).toBeGreaterThanOrEqual(MIN_MATCHES);
      }
    }
  });

  it('ranks by score, highest first', () => {
    for (const bracket of snapshot.brackets) {
      const scores = bracket.decks.map((d) => d.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('reports at most COUNTER_CARDS popular cards, commonest first', () => {
    for (const bracket of snapshot.brackets) {
      expect(bracket.popularCards.length).toBeLessThanOrEqual(COUNTER_CARDS);
      const uses = bracket.popularCards.map((p) => p.uses);
      expect([...uses].sort((a, b) => b - a)).toEqual(uses);
    }
  });

  it('keeps every deck record internally consistent', () => {
    for (const bracket of snapshot.brackets) {
      for (const deck of bracket.decks) {
        expect(deck.wins + deck.losses + deck.draws).toBe(deck.matches);
        expect(deck.winRate).toBeCloseTo((deck.wins / deck.matches) * 100, 6);
        expect(deck.confidence).toBeLessThanOrEqual(deck.winRate / 100 + 1e-9);
        expect(deck.cards).toHaveLength(8);
      }
    }
  });

  it('returns an empty snapshot rather than NaN for an empty sample', () => {
    const empty = aggregate([]);
    expect(empty.brackets).toEqual([]);
    expect(empty.battles).toBe(0);
    expect(empty.skipped).toBe(0);
  });

  it('skips a 2v2, which cannot say which deck won', () => {
    const duo = ranked.find((b) => b['type'] === 'pathOfLegend')!;
    const team = duo['team'] as ApiRecord[];
    const result = aggregate([{ ...duo, team: [team[0]!, team[0]!] }]);
    expect(result.battles).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe('playerBracketId', () => {
  it('falls back to the arena below Legend, where the PoL result is null', () => {
    // The calibration account's currentPathOfLegendSeasonResult is null -- the
    // common case, and the reason this cannot just read leagueNumber.
    const record = player as ApiRecord;
    expect(record['currentPathOfLegendSeasonResult']).toBeNull();
    expect(playerBracketId(record)).toBe(`arena:${(record['arena'] as ApiRecord)['id']}`);
  });

  it('prefers the league once the player has reached Path of Legends', () => {
    const promoted = {
      ...(player as ApiRecord),
      currentPathOfLegendSeasonResult: { leagueNumber: 7, trophies: 0, rank: null },
    };
    expect(playerBracketId(promoted)).toBe('league:7');
  });
});

describe('deckFit', () => {
  /*
   * Both logs, and `find` rather than `[0]`, because neither on its own is
   * enough.
   *
   * The ranked capture is a single player's 29 battles spread over five
   * leagues, so no league bracket reaches MIN_MATCHES and every ranked bracket
   * lists zero decks. Reading `brackets[0].decks[0]` -- the hardest bracket --
   * therefore yields undefined, and every assertion below it would pass
   * without executing. The combined sample does produce one ranked-enough deck
   * in a Trophy Road bracket, and `toBeDefined` is what keeps this suite
   * honest if that ever stops being true.
   */
  const snapshot = aggregate([...ranked, ...ladder]);
  const deck = snapshot.brackets.flatMap((b) => b.decks)[0];
  const owned = (player as ApiRecord)['cards'] as ApiRecord[];

  it('has a deck to measure at all', () => {
    expect(deck).toBeDefined();
    expect(deck!.matches).toBeGreaterThanOrEqual(MIN_MATCHES);
  });

  it('marks the cards the player does not own', () => {
    const fit = deckFit(deck!, owned);
    expect(fit.cards).toHaveLength(8);
    expect(fit.missing).toBe(fit.cards.filter((c) => !c.owned).length);
    expect(fit.playable).toBe(fit.missing === 0);
  });

  it('compares game levels, not the rarity-relative API numbers', () => {
    // A level-16 Common and a level-11 Epic are both game level 16. Comparing
    // the raw values would report a five-level gap that does not exist.
    const fit = deckFit(deck!, owned);
    const theirs = fit.cards.map((c) => c.theirs).filter((v): v is number => v !== null);
    expect(theirs.length).toBeGreaterThan(0);
    for (const level of theirs) {
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(16);
    }
  });

  it('penalises a deck the player cannot field', () => {
    const locked = deckFit(deck!, []);
    expect(locked.playable).toBe(false);
    expect(locked.missing).toBe(8);
    expect(fitScore(deck!, locked)).toBeLessThan(deck!.score);
  });

  it('leaves a deck the player matches on level at full score', () => {
    const perfect = { cards: [], missing: 0, levelGap: 0, playable: true };
    expect(fitScore(deck!, perfect)).toBeCloseTo(deck!.score, 6);
  });

  it('scores a deck the player is levels behind on below one they match', () => {
    const matched = { cards: [], missing: 0, levelGap: 0, playable: true };
    const behind = { cards: [], missing: 0, levelGap: 3, playable: true };
    expect(fitScore(deck!, behind)).toBeLessThan(fitScore(deck!, matched));
  });
});

describe('seasonIds', () => {
  it('reads real ids when the service sends them', () => {
    const ids = seasonIds({ items: [{ id: '2026-10' }, { id: '2026-09' }, { id: '2026-10' }] });
    expect(ids).toEqual(['2026-10', '2026-09']);
  });

  /*
   * The endpoint intermittently answers with all 145 ids null -- caught live
   * on 2026-11-07, recovered twenty minutes later. While it lasts the Path of
   * Legend picker has nothing to offer and the tab is dead, so the months are
   * reconstructed from the clock instead.
   */
  it('reconstructs the months when every id comes back null', () => {
    const nulls = { items: Array.from({ length: 145 }, () => ({ id: null })) };
    const ids = seasonIds(nulls, new Date('2026-11-07T00:00:00Z'));
    expect(ids[0]).toBe('2026-10');
    expect(ids[1]).toBe('2026-09');
    expect(ids).toHaveLength(24);
  });

  it('never offers the current month, which 404s until it closes', () => {
    const ids = seasonIds({ items: [] }, new Date('2026-11-07T00:00:00Z'));
    expect(ids).not.toContain('2026-11');
  });

  it('rolls the year over correctly in January', () => {
    const ids = seasonIds({ items: [] }, new Date('2027-01-09T00:00:00Z'));
    expect(ids[0]).toBe('2026-12');
  });
});
