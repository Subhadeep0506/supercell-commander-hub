import {
  WIN_BONUS_STARS,
  allWarTags,
  attacksPerMember,
  averageTh,
  buildRounds,
  currentRound,
  leagueRule,
  memberTh,
  positionIndex,
  realWarTags,
  standings,
  thHistogram,
  thRange,
  warOutcome,
  warSides,
} from '@/lib/cwl';
import type { ApiRecord } from '@/api/game-api';

const side = (tag: string, stars: number, destruction: number, extra: ApiRecord = {}) => ({
  tag,
  name: tag.replace('#', 'Clan '),
  stars,
  destructionPercentage: destruction,
  attacks: 15,
  ...extra,
});

const war = (a: ApiRecord, b: ApiRecord, state: string): ApiRecord => ({
  state,
  teamSize: 15,
  attacksPerMember: 1,
  clan: a,
  opponent: b,
});

/** Four clans, two rounds drawn, one round still a placeholder. */
const group: ApiRecord = {
  state: 'inWar',
  season: '2026-11',
  clans: [
    { tag: '#AA', name: 'Clan AA', members: [{ townHallLevel: 16 }, { townHallLevel: 14 }] },
    { tag: '#BB', name: 'Clan BB', members: [{ townHallLevel: 12 }, { townHallLevel: 12 }] },
    { tag: '#CC', name: 'Clan CC', members: [{ townHallLevel: 9 }, { townHallLevel: 3 }] },
    { tag: '#DD', name: 'Clan DD', members: [{ townHallLevel: 10 }, { townHallLevel: 10 }] },
  ],
  rounds: [
    { warTags: ['#W1', '#W2'] },
    { warTags: ['#W3', '#W4'] },
    { warTags: ['#0', '#0'] },
  ],
};

const wars = new Map<string, ApiRecord>([
  // Round 1, finished. AA beats BB on stars; CC beats DD on destruction alone.
  ['#W1', war(side('#AA', 30, 90), side('#BB', 25, 95), 'warEnded')],
  ['#W2', war(side('#CC', 20, 80), side('#DD', 20, 70), 'warEnded')],
  // Round 2, live. No bonus is owed yet.
  ['#W3', war(side('#AA', 5, 20), side('#CC', 7, 25), 'inWar')],
  ['#W4', war(side('#BB', 3, 10), side('#DD', 2, 8), 'inWar')],
]);

describe('cwl rounds', () => {
  it('drops the #0 placeholders of an undrawn round', () => {
    expect(realWarTags({ warTags: ['#W1', '#0'] })).toEqual(['#W1']);
    expect(realWarTags({ warTags: ['#0', '#0'] })).toEqual([]);
    expect(realWarTags({})).toEqual([]);
    expect(allWarTags(group)).toEqual(['#W1', '#W2', '#W3', '#W4']);
  });

  it('reads each round status from its wars, not from the season', () => {
    const rounds = buildRounds(group, wars);
    expect(rounds.map((r) => r.status)).toEqual(['ended', 'inWar', 'upcoming']);
    // Round 2 is being fought even though round 3's tags exist as placeholders.
    expect(currentRound(rounds)).toBe(1);
  });

  it('falls back to the season state before any war has loaded', () => {
    const rounds = buildRounds(group, new Map());
    expect(rounds.map((r) => r.status)).toEqual(['preparation', 'preparation', 'upcoming']);
    expect(rounds[2]!.warTags).toEqual([]);
  });

  it('headlines the round in preparation when none is being fought', () => {
    const prep = new Map<string, ApiRecord>([
      ['#W1', war(side('#AA', 30, 90), side('#BB', 25, 95), 'warEnded')],
      ['#W2', war(side('#CC', 20, 80), side('#DD', 20, 70), 'warEnded')],
      ['#W3', war(side('#AA', 0, 0), side('#CC', 0, 0), 'preparation')],
      ['#W4', war(side('#BB', 0, 0), side('#DD', 0, 0), 'preparation')],
    ]);
    expect(currentRound(buildRounds(group, prep))).toBe(1);
  });
});

describe('cwl town halls', () => {
  it('reads both spellings of the Town Hall field', () => {
    // War rosters say townhallLevel; clan rosters say townHallLevel.
    expect(memberTh({ townhallLevel: 15 })).toBe(15);
    expect(memberTh({ townHallLevel: 15 })).toBe(15);
    expect(memberTh({})).toBe(0);
  });

  it('counts a roster high to low and skips unknown levels', () => {
    const members = [
      { townhallLevel: 14 },
      { townHallLevel: 16 },
      { townhallLevel: 14 },
      { name: 'no hall' },
    ];
    expect(thHistogram(members)).toEqual([
      { th: 16, count: 1 },
      { th: 14, count: 2 },
    ]);
    // The member with no level must not drag the mean down to 11.
    expect(averageTh(members)).toBeCloseTo(14.666, 2);
    expect(averageTh([])).toBe(0);
  });

  it('spans the legend across every clan in the group', () => {
    expect(thRange(group)).toEqual({ high: 16, low: 3 });
  });
});

describe('cwl wars', () => {
  it('breaks a star tie on destruction', () => {
    expect(warOutcome(side('#A', 20, 80), side('#B', 20, 70))).toBe('win');
    expect(warOutcome(side('#A', 20, 70), side('#B', 20, 80))).toBe('lose');
    expect(warOutcome(side('#A', 20, 80), side('#B', 20, 80))).toBe('tie');
    expect(warOutcome(side('#A', 21, 10), side('#B', 20, 99))).toBe('win');
  });

  it('orients a war onto the clan being asked about', () => {
    const w = wars.get('#W3')!;
    expect(warSides(w, '#CC').us['tag']).toBe('#CC');
    expect(warSides(w, '#cc').us['tag']).toBe('#CC');
    expect(warSides(w, '#AA').us['tag']).toBe('#AA');
    // No tag given falls back to the response's own `clan`.
    expect(warSides(w).us['tag']).toBe('#AA');
  });

  it('turns a defender tag into a map position', () => {
    const index = positionIndex({
      members: [
        { tag: '#P1', mapPosition: 1 },
        { tag: '#P2', mapPosition: 2 },
      ],
    });
    expect(index.get('#P1')).toBe('1');
    expect(index.get('#P9')).toBeUndefined();
  });

  it('derives attacks per member when the field is missing', () => {
    expect(attacksPerMember({ attacksPerMember: 2 })).toBe(2);
    const derived = {
      clan: { members: [{ attacks: [{}, {}] }, { attacks: [{}] }] },
    };
    expect(attacksPerMember(derived)).toBe(2);
    // Nothing to go on still yields a usable denominator rather than 0.
    expect(attacksPerMember({})).toBe(1);
  });
});

describe('cwl standings', () => {
  const table = standings(group, wars);
  const by = (tag: string) => table.find((s) => s.tag === tag)!;

  it('awards the win bonus only on a finished war', () => {
    // AA: 30 won (+10) in round 1, plus 5 live in round 2 with no bonus.
    expect(by('#AA').stars).toBe(30 + WIN_BONUS_STARS + 5);
    expect(by('#AA').wins).toBe(1);
    // BB lost round 1 on stars despite the higher destruction.
    expect(by('#BB').stars).toBe(25 + 3);
    expect(by('#BB').wins).toBe(0);
  });

  it('gives the bonus to a win earned on destruction alone', () => {
    expect(by('#CC').stars).toBe(20 + WIN_BONUS_STARS + 7);
    expect(by('#DD').stars).toBe(20 + 2);
  });

  it('ranks on stars, then destruction', () => {
    expect(table.map((s) => s.tag)).toEqual(['#AA', '#CC', '#BB', '#DD']);
    expect(table[0]!.destruction).toBeCloseTo(110, 5);
  });

  it('lists a clan that has not played a counted war', () => {
    const untouched = standings(group, new Map());
    expect(untouched).toHaveLength(4);
    expect(untouched.every((s) => s.stars === 0 && s.warsCounted === 0)).toBe(true);
  });

  it('ignores wars in preparation', () => {
    const prep = new Map<string, ApiRecord>([
      ['#W1', war(side('#AA', 0, 0), side('#BB', 0, 0), 'preparation')],
    ]);
    expect(standings(group, prep).every((s) => s.warsCounted === 0)).toBe(true);
  });
});

describe('cwl promotion', () => {
  it('knows the two leagues that are not symmetrical', () => {
    expect(leagueRule('Champion League I')).toEqual({ promote: 0, demote: 2 });
    expect(leagueRule('Bronze League III')).toEqual({ promote: 2, demote: 0 });
  });

  it('defaults to two up and two down', () => {
    expect(leagueRule('Gold League II')).toEqual({ promote: 2, demote: 2 });
    expect(leagueRule(undefined)).toEqual({ promote: 2, demote: 2 });
  });
});
