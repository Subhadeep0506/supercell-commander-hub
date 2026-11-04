import type { ApiRecord } from '@/api/game-api';
import {
  inLeagueGroup,
  sortWarBattles,
  warBattleSummary,
  warBattlesFor,
} from '@/lib/coc-attacks';
import warJson from '../scripts/fixtures/coc-war.json';
import leagueGroupJson from '../scripts/fixtures/coc-league-group.json';
import leagueWarsJson from '../scripts/fixtures/coc-league-wars.json';

const TAG = '#LJ9V8LCYQ';

describe('a player’s war attacks', () => {
  const war: ApiRecord = {
    state: 'inWar',
    endTime: '20261104T045754.000Z',
    clan: {
      name: 'bruh',
      members: [
        {
          tag: TAG,
          name: 'DenCT',
          mapPosition: 2,
          townhallLevel: 13,
          attacks: [
            {
              attackerTag: TAG,
              defenderTag: '#E2',
              stars: 3,
              destructionPercentage: 100,
              order: 4,
              duration: 95,
            },
            {
              attackerTag: TAG,
              defenderTag: '#E9',
              stars: 1,
              destructionPercentage: 52,
              order: 9,
              duration: 180,
            },
          ],
        },
        { tag: '#OTHER', name: 'someone else', mapPosition: 3, attacks: [] },
      ],
    },
    opponent: {
      name: 'Rivals',
      members: [
        { tag: '#E2', name: 'Rival 2', mapPosition: 7, townhallLevel: 15, attacks: [] },
        {
          tag: '#E9',
          name: 'Rival 9',
          mapPosition: 9,
          townhallLevel: 14,
          attacks: [
            {
              attackerTag: '#E9',
              defenderTag: TAG,
              stars: 2,
              destructionPercentage: 81,
              order: 11,
              duration: 103,
            },
            // Someone else's base: must not land in this player's list.
            {
              attackerTag: '#E9',
              defenderTag: '#OTHER',
              stars: 3,
              destructionPercentage: 100,
              order: 12,
              duration: 90,
            },
          ],
        },
      ],
    },
  };

  it('pairs each attack with the base it hit', () => {
    const made = warBattlesFor(war, TAG, 'Current war', 1).filter((b) => b.role === 'attack');
    expect(made).toHaveLength(2);
    expect(made[0]).toMatchObject({
      otherName: 'Rival 2',
      otherPosition: '7',
      otherTownHall: 15,
      stars: 3,
      destruction: 100,
      duration: 95,
      myPosition: '2',
      myTownHall: 13,
      otherClanName: 'Rivals',
    });
  });

  it('finds defences on the opposing roster, not on bestOpponentAttack', () => {
    const taken = warBattlesFor(war, TAG, 'Current war', 1).filter((b) => b.role === 'defence');
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ otherName: 'Rival 9', stars: 2, destruction: 81 });
  });

  it('reads a player on the opponent side too', () => {
    const flipped: ApiRecord = { ...war, clan: war['opponent'], opponent: war['clan'] };
    const found = warBattlesFor(flipped, TAG, 'Current war', 1);
    expect(found.filter((b) => b.role === 'attack')).toHaveLength(2);
    expect(found.filter((b) => b.role === 'defence')).toHaveLength(1);
  });

  it('returns nothing for a member who sat the war out', () => {
    expect(warBattlesFor(war, '#NOTHERE', 'Current war', 1)).toEqual([]);
  });

  it('sorts newest war first, newest attack first within it', () => {
    const older = warBattlesFor(war, TAG, 'Round 1', 0);
    const newer = warBattlesFor(war, TAG, 'Current war', 1);
    const sorted = sortWarBattles([...older, ...newer]);
    expect(sorted[0]?.warLabel).toBe('Current war');
    expect(sorted.map((b) => b.order).slice(0, 3)).toEqual([11, 9, 4]);
  });

  it('summarises both roles separately', () => {
    const summary = warBattleSummary(warBattlesFor(war, TAG, 'Current war', 1));
    expect(summary).toMatchObject({
      attacks: 2,
      defences: 1,
      starsFor: 4,
      starsAgainst: 2,
      threeStars: 1,
      failed: 0,
    });
    expect(summary.destructionFor).toBeCloseTo(76);
    expect(summary.destructionAgainst).toBeCloseTo(81);
  });

  it('reports no average destruction rather than zero when nothing was attacked', () => {
    expect(warBattleSummary([]).destructionFor).toBeNull();
  });
});

describe('the generated war fixtures', () => {
  // The browser checks drive the home screen against these; if the
  // calibration account ever stops being on the roster, the Battles section
  // renders its empty state and every assertion about it passes vacuously.
  const currentWar = warJson as ApiRecord;
  const leagueWars = leagueWarsJson as unknown as Record<string, ApiRecord>;

  it('put the calibration account in the current war, with both roles', () => {
    const found = warBattlesFor(currentWar, TAG, 'Current war', 1000);
    expect(found.filter((b) => b.role === 'attack').length).toBeGreaterThan(0);
    expect(found.filter((b) => b.role === 'defence').length).toBeGreaterThan(0);
  });

  it('resolve every defender tag to a real member of the other roster', () => {
    for (const battle of warBattlesFor(currentWar, TAG, 'Current war', 1000)) {
      expect(battle.otherName).not.toBe('—');
    }
  });

  it('put the calibration account in the league wars too', () => {
    const found = Object.values(leagueWars).flatMap((w, i) =>
      warBattlesFor(w, TAG, `Round ${i}`, i),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it('list the calibration account on a league-group roster', () => {
    // The pre-filter that decides whether the 28 war requests are made at all.
    expect(inLeagueGroup(leagueGroupJson as ApiRecord, TAG)).toBe(true);
    expect(inLeagueGroup(leagueGroupJson as ApiRecord, '#NOTHERE')).toBe(false);
    expect(inLeagueGroup(undefined, TAG)).toBe(false);
  });
});
