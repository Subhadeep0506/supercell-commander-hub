import { endpoint, gameRequestSchema, type GameRequest } from '@/api/game-api';
import { SIZES, countActive, sizeId, type ClanFilterValues } from '@/components/ui/ClanFilters';



const req = (input: Partial<GameRequest> & Pick<GameRequest, 'game' | 'resource'>) =>
  input as GameRequest;

describe('clan size options', () => {
  it('maps an upper-bound option to maxMembers, not minMembers', () => {
    const room = SIZES.find((o) => o.id === 'room')!;
    expect(room.max).toBe(44);
    expect(room.min).toBeUndefined();

    const small = SIZES.find((o) => o.id === 'quiet')!;
    expect(small.max).toBe(19);
    expect(small.min).toBeUndefined();
  });

  it('maps a lower-bound option to minMembers', () => {
    const busy = SIZES.find((o) => o.id === 'busy')!;
    expect(busy.min).toBe(40);
    expect(busy.max).toBeUndefined();
  });

  it('never sets a bound that contradicts its own label', () => {
    for (const option of SIZES) {
      if (option.id === 'any') continue;
      // 'under N' must bound above; 'N or more' must bound below.
      if (/under/i.test(option.label)) {
        expect(option.max).toBeDefined();
        expect(option.min).toBeUndefined();
      }
      if (/or more/i.test(option.label)) {
        expect(option.min).toBeDefined();
        expect(option.max).toBeUndefined();
      }
    }
  });

  it('round-trips every option through sizeId', () => {
    for (const option of SIZES) {
      const value: ClanFilterValues = { minMembers: option.min, maxMembers: option.max };
      expect(sizeId(value)).toBe(option.id);
    }
  });

  it('produces a request the schema accepts', () => {
    for (const option of SIZES) {
      const value = {
        game: 'coc',
        resource: 'clanSearch',
        name: 'wolves',
        minMembers: option.min,
        maxMembers: option.max,
      } as const;
      expect(gameRequestSchema.safeParse(value).success).toBe(true);
    }
  });

  it('reaches the query string as the bound it claims', () => {
    const room = SIZES.find((o) => o.id === 'room')!;
    expect(
      endpoint(
        req({
          game: 'cr',
          resource: 'clanSearch',
          name: 'wolves',
          minMembers: room.min,
          maxMembers: room.max,
        }),
      ),
    ).toBe('/v1/clans?name=wolves&maxMembers=44&limit=25');
  });
});

describe('countActive', () => {
  it('counts a size choice once, not once per bound', () => {
    expect(countActive({ minMembers: 25 })).toBe(1);
    expect(countActive({ minMembers: 10, maxMembers: 40 })).toBe(1);
  });

  it('counts each other control separately', () => {
    expect(countActive({ minMembers: 25, minClanPoints: 20000, locationId: '32000006' })).toBe(3);
  });

  it('is zero when nothing is set', () => {
    expect(countActive({})).toBe(0);
  });
});
