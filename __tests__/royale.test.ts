import type { ApiRecord } from '@/api/game-api';
import { COPY_TABLE, copyProgress, gameLevel } from '@/lib/royale-upgrades';
import {
  averageElixir,
  averageLevel,
  canEvolve,
  cardLevel,
  isEvolved,
  rarityCounts,
  sortCards,
  splitCollection,
} from '@/lib/royale-cards';
import {
  battleModes,
  battleSide,
  battleSummary,
  modeLabel,
  modeRecords,
  normalizeBattle,
  outcomeOf,
  parseApiDate,
  relativeTime,
  sideOf,
} from '@/lib/royale-battles';
import { deckKey, deckLink, deckStats, generateDeck, myDecks, observedDecks } from '@/lib/royale-decks';
import {
  decksRemaining,
  isWarDay,
  logCursor,
  logSeasons,
  periodDays,
  periodLabel,
  raceStandings,
  sortParticipants,
} from '@/lib/river-race';

import { playerBadgeArt, rarityTokenArt } from '@/assets/royale';
import calibrationPlayer from '../scripts/fixtures/cr-player.json';

const TAG = '#L8YV8P2CL';

describe('rarity-relative levels', () => {
  it('converts API levels to in-game levels', () => {
    expect(gameLevel(6, 'epic')).toBe(11);
    expect(gameLevel(3, 'legendary')).toBe(11);
    // The trap in one line: the same API number means two different levels.
    expect(gameLevel(9, 'common')).toBe(9);
    expect(gameLevel(9, 'legendary')).toBe(17);
  });

  it('treats an unknown rarity as common rather than throwing', () => {
    expect(gameLevel(4, 'mythic')).toBe(4);
  });

  it('indexes the copy table by the raw API level, not the game level', () => {
    expect(copyProgress(10, 16, 1282)).toEqual({
      kind: 'progress',
      owned: 1282,
      needed: 1000,
      ready: true,
    });
    expect(copyProgress(11, 16, 1313)).toEqual({
      kind: 'progress',
      owned: 1313,
      needed: 2000,
      ready: false,
    });
    expect(COPY_TABLE[9]).toBe(1000);
  });

  it('reports max and refuses to invent a denominator', () => {
    expect(copyProgress(16, 16, 50).kind).toBe('max');
    expect(copyProgress(undefined, 16, 50).kind).toBe('unknown');
    // Past the end of the table.
    expect(copyProgress(13, 16, 50).kind).toBe('unknown');
  });
});

describe('the collection split', () => {
  const catalog = {
    items: [
      { id: 1, name: 'Knight', rarity: 'common', elixirCost: 3, maxLevel: 16, maxEvolutionLevel: 3 },
      { id: 2, name: 'Princess', rarity: 'legendary', elixirCost: 3, maxLevel: 8 },
      { id: 3, name: 'Vines', rarity: 'epic', elixirCost: 3, maxLevel: 11 },
    ],
    supportItems: [
      { id: 10, name: 'Tower Princess', rarity: 'common', maxLevel: 16 },
      { id: 11, name: 'Cannoneer', rarity: 'common', maxLevel: 16 },
    ],
  };
  const player = {
    cards: [
      { id: 1, name: 'Knight', rarity: 'common', level: 11, count: 500, elixirCost: 3, maxLevel: 16 },
      { id: 2, name: 'Princess', rarity: 'legendary', level: 3, count: 4, elixirCost: 3, maxLevel: 8, evolutionLevel: 1 },
    ],
    supportCards: [{ id: 10, name: 'Tower Princess', rarity: 'common', level: 16, maxLevel: 16 }],
  };

  it('splits cards and tower troops separately', () => {
    const split = splitCollection(catalog, player);
    expect(split.cards.unlocked.map((c) => c['name'])).toEqual(['Knight', 'Princess']);
    expect(split.cards.locked.map((c) => c['name'])).toEqual(['Vines']);
    expect(split.support.unlocked).toHaveLength(1);
    expect(split.support.locked.map((c) => c['name'])).toEqual(['Cannoneer']);
  });

  it('keeps catalog fields the player object omits', () => {
    // The player's Knight has no maxEvolutionLevel; the catalog's does. Losing
    // it would hide the evolution on a card the player owns.
    const knight = splitCollection(catalog, player).cards.unlocked[0]!;
    expect(knight['maxEvolutionLevel']).toBe(3);
    expect(knight['count']).toBe(500);
    expect(canEvolve(knight)).toBe(true);
  });

  it('reads an owned evolution', () => {
    const princess = splitCollection(catalog, player).cards.unlocked[1]!;
    expect(isEvolved(princess)).toBe(true);
    expect(isEvolved(splitCollection(catalog, player).cards.unlocked[0]!)).toBe(false);
  });

  it('shows game levels, not API levels', () => {
    const [knight, princess] = splitCollection(catalog, player).cards.unlocked;
    expect(cardLevel(knight!)).toBe(11);
    // API level 3 Legendary is game level 11, not 3.
    expect(cardLevel(princess!)).toBe(11);
  });

  it('has no level for a locked card', () => {
    expect(cardLevel(splitCollection(catalog, player).cards.locked[0]!)).toBeNull();
  });

  it('handles an empty player, which is what a failed lookup leaves behind', () => {
    const split = splitCollection(catalog, {});
    expect(split.cards.unlocked).toHaveLength(0);
    expect(split.cards.locked).toHaveLength(3);
  });
});

describe('card sorting', () => {
  const cards: ApiRecord[] = [
    { name: 'Zap', rarity: 'common', level: 10, elixirCost: 2 },
    { name: 'Apple', rarity: 'legendary', elixirCost: 5 },
    { name: 'Mid', rarity: 'epic', level: 2, elixirCost: 4 },
  ];

  it('sorts locked cards last by level rather than treating them as zero', () => {
    expect(sortCards(cards, 'level').map((c) => c['name'])).toEqual(['Zap', 'Mid', 'Apple']);
  });

  it('sorts by elixir, name and rarity', () => {
    expect(sortCards(cards, 'elixir').map((c) => c['name'])).toEqual(['Zap', 'Mid', 'Apple']);
    expect(sortCards(cards, 'name').map((c) => c['name'])).toEqual(['Apple', 'Mid', 'Zap']);
    expect(sortCards(cards, 'rarity').map((c) => c['name'])).toEqual(['Apple', 'Mid', 'Zap']);
  });

  it('counts every rarity, including the empty ones', () => {
    expect(rarityCounts(cards)).toEqual({ common: 1, rare: 0, epic: 1, legendary: 1, champion: 0 });
  });

  it('refuses a partial average', () => {
    expect(averageElixir(cards)).toBeCloseTo(11 / 3);
    expect(averageLevel(cards)).toBeNull();
    expect(averageElixir([])).toBeNull();
  });
});

describe('battle log', () => {
  it('parses Supercell timestamps', () => {
    expect(parseApiDate('20261104T045754.000Z')?.toISOString()).toBe('2026-11-04T04:57:54.000Z');
    expect(parseApiDate('nonsense')).toBeNull();
    expect(parseApiDate(undefined)).toBeNull();
  });

  it('humanises the three casing styles Supercell mixes', () => {
    expect(modeLabel('Event_GlobalLightning_EventDeck')).toBe('Global Lightning Event Deck');
    expect(modeLabel('riverRaceDuelColosseum')).toBe('river Race Duel Colosseum');
    expect(modeLabel('CW_Duel_1v1')).toBe('CW Duel 1v1');
    // The camel-case split would otherwise cut the commonest battle type of
    // all to "Pv P", which reads as a typo.
    expect(modeLabel('PvP')).toBe('PvP');
    expect(modeLabel('riverRacePvP')).toBe('river Race PvP');
  });

  const battle = (mine: number, theirs: number, mode = 'Ladder'): ApiRecord => ({
    type: 'PvP',
    battleTime: '20261104T045754.000Z',
    gameMode: { name: mode },
    arena: { name: 'Electro Valley' },
    team: [{ tag: TAG, crowns: mine, elixirLeaked: 2.5, trophyChange: 30, cards: [] }],
    opponent: [{ tag: '#OTHER', crowns: theirs, elixirLeaked: 4, cards: [] }],
  });

  it('finds the player regardless of which side they are on', () => {
    expect(sideOf(battle(1, 0), TAG)).toBe('team');
    const flipped: ApiRecord = { team: [{ tag: '#OTHER' }], opponent: [{ tag: TAG }] };
    expect(sideOf(flipped, TAG)).toBe('opponent');
  });

  it('reads the result from the player’s own side', () => {
    expect(outcomeOf(battle(3, 1), TAG)).toBe('victory');
    expect(outcomeOf(battle(0, 2), TAG)).toBe('defeat');
    expect(outcomeOf(battle(1, 1), TAG)).toBe('draw');
    // Flipped: 3 crowns belong to the opponent slot, which is where we are.
    const flipped: ApiRecord = {
      team: [{ tag: '#OTHER', crowns: 1 }],
      opponent: [{ tag: TAG, crowns: 3 }],
    };
    expect(outcomeOf(flipped, TAG)).toBe('victory');
  });

  it('returns no result rather than a guess when crowns are missing', () => {
    expect(outcomeOf({ team: [{ tag: TAG }], opponent: [{ tag: '#O' }] }, TAG)).toBeNull();
  });

  it('normalises a battle for the UI', () => {
    const n = normalizeBattle(battle(3, 1), TAG);
    expect(n.outcome).toBe('victory');
    expect(n.myCrowns).toBe(3);
    expect(n.theirCrowns).toBe(1);
    expect(n.trophyChange).toBe(30);
    expect(n.elixirLeaked).toEqual({ mine: 2.5, theirs: 4 });
    expect(n.modeLabel).toBe('Ladder');
    expect(n.teamSize).toBe(1);
  });

  it('derives a per-mode record, most played first', () => {
    const records = modeRecords(
      [battle(3, 1), battle(0, 2), battle(1, 1), battle(2, 0, 'Draft')],
      TAG,
    );
    expect(records.map((r) => r.mode)).toEqual(['Ladder', 'Draft']);
    expect(records[0]).toMatchObject({ wins: 1, losses: 1, draws: 1, battles: 3, crownsFor: 4 });
    expect(records[0]!.winRate).toBeCloseTo(100 / 3);
    expect(records[1]).toMatchObject({ wins: 1, battles: 1 });
  });

  it('lists the modes present for the filter chips', () => {
    expect(battleModes([battle(1, 0), battle(1, 0, 'Draft')])).toEqual(['Ladder', 'Draft']);
  });

  it('summarises the whole window, counting unresolved battles separately', () => {
    const noCrowns: ApiRecord = { team: [{ tag: TAG }], opponent: [{ tag: '#O' }] };
    const summary = battleSummary([battle(3, 1), battle(0, 2), battle(1, 1), noCrowns], TAG);
    expect(summary).toMatchObject({
      battles: 4,
      wins: 1,
      losses: 1,
      draws: 1,
      undecided: 1,
      crownsFor: 4,
      crownsAgainst: 4,
    });
    // Three battles carry a +30 change; the fourth carries none.
    expect(summary.trophyChange).toBe(90);
    expect(summary.winRate).toBeCloseTo(100 / 3);
    expect(summary.elixirLeaked).toBeCloseTo(2.5);
  });

  it('reports no win rate rather than zero when nothing resolved', () => {
    const summary = battleSummary([{ team: [{ tag: TAG }], opponent: [{ tag: '#O' }] }], TAG);
    expect(summary.winRate).toBeNull();
    expect(summary.trophyChange).toBeNull();
    expect(summary.elixirLeaked).toBeNull();
  });
});

describe('battle participants', () => {
  it('counts crowns conceded from the towers still standing', () => {
    // One princess tower left, king alive: one crown conceded.
    expect(
      battleSide({ kingTowerHitPoints: 4824, princessTowersHitPoints: [3052] }),
    ).toMatchObject({ towersLost: 1, kingDown: false });
    // Both princess towers down and the king with them: a three-crown loss.
    // `princessTowersHitPoints` is absent, not an empty array, at that point.
    expect(battleSide({ kingTowerHitPoints: 0, princessTowersHitPoints: null })).toMatchObject({
      towersLost: 3,
      kingDown: true,
    });
    // Untouched.
    expect(
      battleSide({ kingTowerHitPoints: 4824, princessTowersHitPoints: [3052, 2780] }),
    ).toMatchObject({ towersLost: 0, kingDown: false });
  });

  it('keeps a destroyed king distinct from a missing field', () => {
    expect(battleSide({ kingTowerHitPoints: 0 }).kingTowerHitPoints).toBe(0);
    expect(battleSide({}).kingTowerHitPoints).toBeNull();
    expect(battleSide({}).kingDown).toBe(false);
  });

  it('reads the deck and its averages off the participant', () => {
    const side = battleSide({
      tag: TAG,
      name: 'DenCT',
      clan: { tag: '#QC8LCPUU', name: 'KING SLAYERS', badgeId: 16000177 },
      cards: [
        { name: 'Arrows', level: 10, maxLevel: 16, rarity: 'common', elixirCost: 3 },
        { name: 'Miner', level: 5, maxLevel: 8, rarity: 'legendary', elixirCost: 3 },
      ],
      supportCards: [{ name: 'Tower Princess' }],
    });
    expect(side.clanName).toBe('KING SLAYERS');
    expect(side.cards).toHaveLength(2);
    expect(side.supportCards).toHaveLength(1);
    expect(side.averageElixir).toBe(3);
    // Rarity-relative: a Legendary's "5" is game level 13, a Common's "10" is 10.
    expect(side.averageLevel).toBeCloseTo(11.5);
  });

  it('carries both rosters through normalizeBattle', () => {
    const n = normalizeBattle(
      {
        type: 'PvP',
        deckSelection: 'collection',
        leagueNumber: 1,
        team: [{ tag: TAG, crowns: 3, cards: [] }],
        opponent: [{ tag: '#O', crowns: 1, cards: [] }],
      },
      TAG,
    );
    expect(n.myRoster[0]?.tag).toBe(TAG);
    expect(n.theirRoster[0]?.tag).toBe('#O');
    expect(n.deckSelection).toBe('collection');
    expect(n.leagueNumber).toBe(1);
    expect(n.eventTag).toBeNull();
  });

  it('reads a battle time as an age', () => {
    const now = Date.UTC(2026, 10, 4, 12, 0, 0);
    expect(relativeTime(new Date(now - 90_000), now)).toBe('2m ago');
    expect(relativeTime(new Date(now - 3 * 3600_000), now)).toBe('3h ago');
    expect(relativeTime(new Date(now - 4 * 86400_000), now)).toBe('4d ago');
    // A clock skew must not produce "-3m ago".
    expect(relativeTime(new Date(now + 60_000), now)).toBe('0m ago');
  });
});

describe('decks', () => {
  const cards = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    name: `Card ${i}`,
    level: 10,
    rarity: 'common',
    elixirCost: 3,
  }));

  it('generates eight distinct owned cards and keeps the chosen core first', () => {
    const deck = generateDeck(cards, '9', 'cycle');
    expect(deck).toHaveLength(8);
    expect(new Set(deck.map((c) => c['id'])).size).toBe(8);
    expect(deck[0]?.['id']).toBe(9);
  });

  it('counts exact-deck performance only, and keeps draws', () => {
    const deck = cards.slice(0, 8);
    const b = (used: ApiRecord[], a: number, z: number) => ({
      team: [{ cards: used, crowns: a }],
      opponent: [{ crowns: z }],
    });
    const result = deckStats(deck, [
      b([...deck].reverse(), 3, 1),
      b(deck, 0, 2),
      b(deck, 1, 1),
      b(cards.slice(1, 9), 3, 0),
    ]);
    expect(result).toMatchObject({ average: 3, wins: 1, losses: 1, draws: 1, matches: 3 });
    expect(result.winRate).toBeCloseTo(100 / 3);
    expect(result.averageLevel).toBe(10);
  });

  it('does not fabricate a rate for an unplayed deck', () => {
    expect(deckStats(cards.slice(0, 8), []).winRate).toBeNull();
    expect(deckStats([{ id: 1 }], []).average).toBeNull();
  });

  it('identifies a deck by its cards, not their order', () => {
    const deck = cards.slice(0, 8);
    expect(deckKey(deck)).toBe(deckKey([...deck].reverse()));
    expect(
      observedDecks([{ team: [{ name: 'A', cards: deck }], opponent: [{ name: 'B', cards: [...deck].reverse() }] }]),
    ).toHaveLength(1);
  });

  describe('myDecks', () => {
    const deckA = cards.slice(0, 8);
    const deckB = cards.slice(2, 10);
    const played = (deck: ApiRecord[], mine: number, theirs: number, time: string): ApiRecord => ({
      battleTime: time,
      team: [{ tag: TAG, cards: deck, crowns: mine, supportCards: [] }],
      opponent: [{ tag: '#OTHER', cards: cards.slice(0, 8), crowns: theirs }],
    });

    it('mines the distinct decks the player actually played', () => {
      const decks = myDecks(
        [
          played(deckA, 3, 0, '20261104T040000.000Z'),
          played(deckA, 0, 1, '20261104T050000.000Z'),
          played(deckB, 1, 1, '20261104T060000.000Z'),
        ],
        TAG,
      );
      expect(decks).toHaveLength(2);
      expect(decks[0]).toMatchObject({ plays: 2, wins: 1, losses: 1, draws: 0 });
      expect(decks[1]).toMatchObject({ plays: 1, draws: 1 });
    });

    it('pins currentDeck first and merges its record', () => {
      const decks = myDecks(
        [played(deckB, 1, 0, '20261104T040000.000Z'), played(deckB, 1, 0, '20261104T050000.000Z'), played(deckA, 1, 0, '20261104T060000.000Z')],
        TAG,
        deckA,
      );
      // deckB was played twice and deckA once, but deckA is current.
      expect(decks[0]!.isCurrent).toBe(true);
      expect(decks[0]!.plays).toBe(1);
      expect(decks[1]!.plays).toBe(2);
    });

    it('tracks when each deck was last played', () => {
      const decks = myDecks([played(deckA, 1, 0, '20261104T040000.000Z')], TAG);
      expect(decks[0]!.lastPlayed?.toISOString()).toBe('2026-11-04T04:00:00.000Z');
    });

    it('reads the player off whichever side holds their tag', () => {
      const flipped: ApiRecord = {
        battleTime: '20261104T040000.000Z',
        team: [{ tag: '#OTHER', cards: cards.slice(0, 8), crowns: 0 }],
        opponent: [{ tag: TAG, cards: deckB, crowns: 3 }],
      };
      const decks = myDecks([flipped], TAG);
      expect(decks).toHaveLength(1);
      expect(decks[0]).toMatchObject({ plays: 1, wins: 1 });
    });

    it('builds a copy-to-game link only for a complete deck', () => {
      expect(deckLink(cards.slice(0, 8))).toContain('action=copyDeck&deck=0;1;2;3;4;5;6;7');
      expect(deckLink(cards.slice(0, 7))).toBeNull();
    });
  });
});

describe('river race', () => {
  const race = {
    state: 'full',
    periodType: 'training',
    periodIndex: 1,
    sectionIndex: 3,
    clan: { tag: '#MINE', name: 'Mine', fame: 300, clanScore: 10 },
    clans: [
      { tag: '#A', name: 'A', fame: 100, clanScore: 50, participants: [] },
      {
        tag: '#MINE',
        name: 'Mine',
        fame: 300,
        clanScore: 10,
        repairPoints: 20,
        participants: [
          { tag: '#P1', name: 'One', fame: 200, decksUsed: 4, decksUsedToday: 2, boatAttacks: 1, repairPoints: 10 },
          { tag: '#P2', name: 'Two', fame: 100, decksUsed: 0, decksUsedToday: 0, boatAttacks: 0, repairPoints: 10 },
        ],
      },
      { tag: '#B', name: 'B', fame: 300, clanScore: 99, participants: [] },
    ],
    periodLogs: [],
  };

  it('labels the period without guessing at unseen values', () => {
    expect(periodLabel(race)).toBe('Training');
    expect(isWarDay(race)).toBe(false);
    expect(periodLabel({ periodType: 'warDay' })).toBe('War Day');
    expect(isWarDay({ periodType: 'warDay' })).toBe(true);
    expect(periodLabel({ periodType: 'somethingNew' })).toBe('something New');
  });

  it('ranks by fame, breaking ties on clan score so the table is stable', () => {
    const standings = raceStandings(race, '#MINE');
    expect(standings.map((c) => c.tag)).toEqual(['#B', '#MINE', '#A']);
    expect(standings.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(standings.find((c) => c.isMine)?.tag).toBe('#MINE');
  });

  it('aggregates participants', () => {
    const mine = raceStandings(race, '#MINE').find((c) => c.isMine)!;
    expect(mine.participants).toHaveLength(2);
    expect(mine.active).toBe(1);
    expect(mine.decksUsed).toBe(4);
    expect(mine.decksUsedToday).toBe(2);
    expect(mine.boatAttacks).toBe(1);
    // 2 players x 4 decks - 2 used today.
    expect(decksRemaining(mine)).toBe(6);
  });

  it('sorts participants on each column', () => {
    const mine = raceStandings(race, '#MINE').find((c) => c.isMine)!;
    expect(sortParticipants(mine.participants, 'fame').map((p) => p.name)).toEqual(['One', 'Two']);
    expect(sortParticipants(mine.participants, 'name').map((p) => p.name)).toEqual(['One', 'Two']);
    expect(sortParticipants(mine.participants, 'decks')[0]!.name).toBe('One');
  });

  it('renders an empty period log rather than assuming war-day rows', () => {
    expect(periodDays(race)).toEqual([]);
  });

  it('normalises the river race log and finds our own row', () => {
    const log = {
      items: [
        {
          seasonId: 137,
          sectionIndex: 3,
          createdDate: '20261102T094304.000Z',
          standings: [
            { rank: 2, trophyChange: 50, clan: { tag: '#MINE', name: 'Mine', fame: 1000, participants: [] } },
            { rank: 1, trophyChange: 100, clan: { tag: '#B', name: 'B', fame: 2000, participants: [] } },
          ],
        },
      ],
      paging: { cursors: { after: 'eyJwb3MiOjJ9' } },
    };
    const [season] = logSeasons(log, '#MINE');
    expect(season!.seasonId).toBe(137);
    expect(season!.created?.toISOString()).toBe('2026-11-02T09:43:04.000Z');
    expect(season!.standings.map((s) => s.rank)).toEqual([1, 2]);
    expect(season!.mine?.trophyChange).toBe(50);
    expect(logCursor(log)).toBe('eyJwb3MiOjJ9');
  });

  it('reports no cursor on the last page', () => {
    expect(logCursor({ items: [], paging: { cursors: {} } })).toBeNull();
    expect(logCursor({})).toBeNull();
  });
});

describe('player badges', () => {
  it('joins a mastery badge to its fan-kit art', () => {
    // API `level` is 1-based, the files are 0-based: level 4 is `lv3`.
    expect(playerBadgeArt('MasteryMiniPekka', 4)).toBeDefined();
    expect(playerBadgeArt('MasteryMiniPekka', 4)).toBe(playerBadgeArt('MiniPekka', 4));
  });

  it('ignores punctuation in the fan-kit name', () => {
    // `badge_MiniP.E.K.K.A_lv*` and `badge_P.E.K.K.A_lv*` are distinct
    // families, and both have to survive being slugified.
    expect(playerBadgeArt('MasteryPekka', 1)).toBeDefined();
    expect(playerBadgeArt('MasteryPekka', 1)).not.toBe(playerBadgeArt('MasteryMiniPekka', 1));
  });

  it('clamps a level the fan kit does not have art for', () => {
    // YearsPlayed reports maxLevel 11 and the kit ships six pictures.
    const top = playerBadgeArt('YearsPlayed', 6);
    expect(top).toBeDefined();
    expect(playerBadgeArt('YearsPlayed', 11)).toBe(top);
  });

  it('treats a missing level as the first', () => {
    expect(playerBadgeArt('BattleWins', undefined)).toBe(playerBadgeArt('BattleWins', 1));
    expect(playerBadgeArt('BattleWins', 0)).toBe(playerBadgeArt('BattleWins', 1));
  });

  it('follows an alias', () => {
    // The API says BannerCollection; the fan kit says BannersCollected.
    expect(playerBadgeArt('BannerCollection', 1)).toBeDefined();
  });

  it('misses rather than guessing', () => {
    // Real API badges with no fan-kit art at all. The caller falls back to the
    // generic frame; returning a wrong badge would be worse.
    expect(playerBadgeArt('EmoteCollection', 1)).toBeUndefined();
    expect(playerBadgeArt('CollectionLevel', 4)).toBeUndefined();
    expect(playerBadgeArt('', 1)).toBeUndefined();
    expect(playerBadgeArt(null, 1)).toBeUndefined();
  });

  it('covers every badge the calibration account holds but the two known gaps', () => {
    const badges = (calibrationPlayer['badges'] as ApiRecord[]) ?? [];
    const missing = badges
      .filter((b) => playerBadgeArt(b['name'], b['level']) === undefined)
      .map((b) => b['name']);
    expect(missing).toEqual(['EmoteCollection', 'CollectionLevel']);
  });
});

describe('rarity tokens', () => {
  it('covers all five rarities', () => {
    for (const rarity of ['common', 'rare', 'epic', 'legendary', 'champion']) {
      expect(rarityTokenArt(rarity)).toBeDefined();
    }
  });
});
