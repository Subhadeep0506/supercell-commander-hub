import {
  LEAGUE_FAMILIES,
  LEAGUE_TIER_BASE,
  TIERS_PER_FAMILY,
  leagueTierInfo,
  playerLeague,
} from '@/lib/league-tier';

/** The shape the API sends: id and the same number repeated in the name. */
const tier = (n: number) => ({
  id: LEAGUE_TIER_BASE + n,
  name: `${NAMES[Math.ceil(n / TIERS_PER_FAMILY) - 1]} League ${n}`,
});

/** Display spellings, which differ from the artwork slugs for P.E.K.K.A. */
const NAMES = [
  'Skeleton', 'Barbarian', 'Archer', 'Wizard', 'Valkyrie', 'Witch',
  'Golem', 'P.E.K.K.A', 'Titan', 'Dragon', 'Electro', 'Legend',
];

describe('leagueTierInfo', () => {
  it('maps all 36 tiers onto 12 families of 3', () => {
    for (let n = 1; n <= 36; n += 1) {
      const info = leagueTierInfo(tier(n), 'ranked');
      expect(info).toBeDefined();
      expect(info!.family).toBe(LEAGUE_FAMILIES[Math.ceil(n / 3) - 1]);
      expect(info!.tier).toBe(((n - 1) % 3) + 1);
      expect(info!.number).toBe(n);
      expect(info!.unranked).toBe(false);
    }
  });

  it('covers every family and every tier exactly once across 1-36', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 36; n += 1) {
      const info = leagueTierInfo(tier(n), 'ranked')!;
      seen.add(`${info.family}-${info.tier}`);
    }
    expect(seen.size).toBe(36);
    expect(LEAGUE_FAMILIES).toHaveLength(12);
  });

  /**
   * The eleven tiers a live capture actually contained. These are the reason
   * the arithmetic above is believed rather than assumed -- every one of them
   * lands on the family the ordering predicts.
   */
  it.each([
    [7, 'archer', 1, 'Archer League I'],
    [8, 'archer', 2, 'Archer League II'],
    [9, 'archer', 3, 'Archer League III'],
    [10, 'wizard', 1, 'Wizard League I'],
    [11, 'wizard', 2, 'Wizard League II'],
    [12, 'wizard', 3, 'Wizard League III'],
    [14, 'valkyrie', 2, 'Valkyrie League II'],
    [15, 'valkyrie', 3, 'Valkyrie League III'],
    [20, 'golem', 2, 'Golem League II'],
    [24, 'pekka', 3, 'P.E.K.K.A League III'],
    [29, 'dragon', 2, 'Dragon League II'],
  ])('tier %i is %s %i', (n, family, within, label) => {
    const info = leagueTierInfo(tier(n as number), 'ranked')!;
    expect(info.family).toBe(family);
    expect(info.tier).toBe(within);
    expect(info.label).toBe(label);
  });

  it('slugs P.E.K.K.A onto the artwork key, dots and all', () => {
    const info = leagueTierInfo({ id: 105000024, name: 'P.E.K.K.A League 24' }, 'ranked')!;
    // The badge is filed as `pekka`, not `p-e-k-k-a`...
    expect(info.family).toBe('pekka');
    // ...but the label keeps the spelling the game uses.
    expect(info.label).toBe('P.E.K.K.A League III');
  });

  it('reads the tier from the name when the id is missing or odd', () => {
    expect(leagueTierInfo({ name: 'Wizard League 11' }, 'ranked')!.tier).toBe(2);
    expect(leagueTierInfo({ id: 7, name: 'Wizard League 11' }, 'ranked')!.number).toBe(11);
  });

  it('treats Unranked as a league with no tier', () => {
    for (const value of [
      { id: LEAGUE_TIER_BASE, name: 'Unranked' },
      { name: 'Unranked' },
    ]) {
      const info = leagueTierInfo(value, 'ranked')!;
      expect(info.unranked).toBe(true);
      expect(info.family).toBe('unranked');
      expect(info.tier).toBeUndefined();
      expect(info.label).toBe('Unranked');
    }
  });

  it('returns nothing for an absent or nameless league', () => {
    expect(leagueTierInfo(undefined, 'ranked')).toBeUndefined();
    expect(leagueTierInfo({}, 'ranked')).toBeUndefined();
    expect(leagueTierInfo({ name: '  ' }, 'ranked')).toBeUndefined();
  });

  it('keeps the tier in the key for Builder Base, which is drawn per tier', () => {
    const info = leagueTierInfo({ id: 44000023, name: 'Iron League III' }, 'builder')!;
    expect(info.family).toBe('iron-iii');
    expect(info.label).toBe('Iron League III');
    expect(info.tier).toBeUndefined();
  });

  it('drops the tier for the retired trophy leagues, which are drawn per family', () => {
    const info = leagueTierInfo({ id: 29000011, name: 'Crystal League II' }, 'trophy')!;
    expect(info.family).toBe('crystal');
    expect(info.label).toBe('Crystal League II');
  });
});

describe('playerLeague', () => {
  /**
   * The whole point of the change. A live clan member carries both fields,
   * and the legacy one now reads Unranked for everyone -- so preferring it
   * is what made the entire roster show one grey badge.
   */
  it('prefers leagueTier over the dead league field', () => {
    const member = {
      leagueTier: { id: 105000029, name: 'Dragon League 29' },
      league: { id: 29000000, name: 'Unranked' },
    };
    const info = playerLeague(member, 'home')!;
    expect(info.family).toBe('dragon');
    expect(info.label).toBe('Dragon League II');
    expect(info.system).toBe('ranked');
  });

  it('falls back to the old league on a payload that predates the change', () => {
    const info = playerLeague({ league: { name: 'Crystal League II' } }, 'home')!;
    expect(info.system).toBe('trophy');
    expect(info.family).toBe('crystal');
  });

  it('reads Builder Base from its own field', () => {
    const member = {
      leagueTier: { id: 105000029, name: 'Dragon League 29' },
      builderBaseLeague: { id: 44000033, name: 'Platinum League II' },
    };
    expect(playerLeague(member, 'builder')!.family).toBe('platinum-ii');
  });

  it('returns nothing when the row names no league at all', () => {
    expect(playerLeague({ name: 'Nobody' }, 'home')).toBeUndefined();
    expect(playerLeague({ name: 'Nobody' }, 'builder')).toBeUndefined();
  });
});
