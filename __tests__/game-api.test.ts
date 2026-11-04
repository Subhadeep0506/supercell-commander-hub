import { endpoint, gameRequestSchema, normalizeTag, type GameRequest } from '@/api/game-api';

/**
 * The endpoint builder and its guards.
 *
 * Every path asserted here was probed live against proxy.royaleapi.dev on
 * 2026-11-04, so a failure means we drifted from the API rather than from an
 * opinion about it.
 */

const req = (input: Partial<GameRequest> & Pick<GameRequest, 'game' | 'resource'>) =>
  input as GameRequest;

const ok = (input: Partial<GameRequest> & Pick<GameRequest, 'game' | 'resource'>) =>
  gameRequestSchema.safeParse(input).success;

const TAG = '#L8YV8P2CL';
const CLAN = '#QC8LCPUU';

describe('normalizeTag', () => {
  it('adds the hash and upcases', () => {
    expect(normalizeTag('l8yv8p2cl')).toBe('#L8YV8P2CL');
    expect(normalizeTag(' #l8yv8p2cl ')).toBe('#L8YV8P2CL');
  });
});

describe('Clash Royale endpoints', () => {
  it('builds the player resources', () => {
    expect(endpoint(req({ game: 'cr', resource: 'player', tag: TAG }))).toBe(
      '/v1/players/%23L8YV8P2CL',
    );
    expect(endpoint(req({ game: 'cr', resource: 'battles', tag: TAG }))).toBe(
      '/v1/players/%23L8YV8P2CL/battlelog',
    );
    expect(endpoint(req({ game: 'cr', resource: 'upcomingChests', tag: TAG }))).toBe(
      '/v1/players/%23L8YV8P2CL/upcomingchests',
    );
  });

  it('builds the clan resources, including both river race forms', () => {
    expect(endpoint(req({ game: 'cr', resource: 'clan', tag: CLAN }))).toBe(
      '/v1/clans/%23QC8LCPUU',
    );
    expect(endpoint(req({ game: 'cr', resource: 'riverRace', tag: CLAN }))).toBe(
      '/v1/clans/%23QC8LCPUU/currentriverrace',
    );
    expect(endpoint(req({ game: 'cr', resource: 'riverRaceLog', tag: CLAN }))).toBe(
      '/v1/clans/%23QC8LCPUU/riverracelog?limit=10',
    );
  });

  it('passes the river race log cursor through unencoded', () => {
    // Supercell's cursor is already base64; re-encoding it returns page one
    // forever, which reads as "no more history".
    expect(
      endpoint(req({ game: 'cr', resource: 'riverRaceLog', tag: CLAN, limit: 3, after: 'eyJwb3MiOjJ9' })),
    ).toBe('/v1/clans/%23QC8LCPUU/riverracelog?limit=3&after=eyJwb3MiOjJ9');
  });

  it('builds the catalog, which carries tower troops alongside cards', () => {
    expect(endpoint(req({ game: 'cr', resource: 'catalog' }))).toBe('/v1/cards');
  });

  it('builds the ladder resources', () => {
    expect(
      endpoint(req({ game: 'cr', resource: 'pathOfLegend', season: '2026-10', limit: 3 })),
    ).toBe('/v1/locations/global/pathoflegend/2026-10/rankings/players?limit=3');
    expect(endpoint(req({ game: 'cr', resource: 'seasons' }))).toBe('/v1/locations/global/seasons');
    expect(endpoint(req({ game: 'cr', resource: 'leaderboards' }))).toBe('/v1/leaderboards');
    // Singular segment. The plural 404s.
    expect(
      endpoint(req({ game: 'cr', resource: 'leaderboardRankings', leaderboardId: 170000019 })),
    ).toBe('/v1/leaderboard/170000019?limit=25');
  });

  it('builds the two surviving clan ladders, global and per country', () => {
    expect(
      endpoint(req({ game: 'cr', resource: 'leaderboard', board: 'clans', mode: 'home' })),
    ).toBe('/v1/locations/global/rankings/clans?limit=25');
    expect(
      endpoint(
        req({ game: 'cr', resource: 'leaderboard', board: 'clans', mode: 'war', locationId: 57000006 }),
      ),
    ).toBe('/v1/locations/57000006/rankings/clanwars?limit=25');
  });

  it('builds the tournament resources', () => {
    expect(endpoint(req({ game: 'cr', resource: 'globalTournaments' }))).toBe(
      '/v1/globaltournaments',
    );
    expect(endpoint(req({ game: 'cr', resource: 'tournament', tag: '#2GG8R8G0' }))).toBe(
      '/v1/tournaments/%232GG8R8G0',
    );
    expect(endpoint(req({ game: 'cr', resource: 'tournamentSearch', name: 'royale' }))).toBe(
      '/v1/tournaments?name=royale&limit=25',
    );
  });
});

describe('the dead-ladder guard', () => {
  // CR's player trophy ladder answers 200 with an empty list rather than an
  // error, so nothing downstream can tell it apart from "no data yet".
  it('rejects a Clash Royale player ladder', () => {
    expect(ok({ game: 'cr', resource: 'leaderboard', board: 'players' })).toBe(false);
    expect(ok({ game: 'cr', resource: 'leaderboard' })).toBe(false);
  });

  it('names the replacement in the message', () => {
    const parsed = gameRequestSchema.safeParse({
      game: 'cr',
      resource: 'leaderboard',
      board: 'players',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/pathOfLegend/);
  });

  it('still allows the clan ladders', () => {
    expect(ok({ game: 'cr', resource: 'leaderboard', board: 'clans' })).toBe(true);
  });

  it('keeps the Clash of Clans player ladder working', () => {
    expect(ok({ game: 'coc', resource: 'leaderboard', board: 'players', mode: 'home' })).toBe(true);
    expect(endpoint(req({ game: 'coc', resource: 'leaderboard', board: 'players', mode: 'builder' }))).toBe(
      '/v1/locations/global/rankings/players-builder-base?limit=25',
    );
  });
});

describe('cross-game guards', () => {
  it('rejects Clash Royale resources for the other games', () => {
    expect(ok({ game: 'coc', resource: 'riverRace', tag: CLAN })).toBe(false);
    expect(ok({ game: 'bs', resource: 'leaderboards' })).toBe(false);
    expect(ok({ game: 'coc', resource: 'upcomingChests', tag: TAG })).toBe(false);
  });

  it('rejects Clash of Clans resources for Clash Royale', () => {
    // currentwar is 410 Gone on this API and warlog is 404 disabled.
    expect(ok({ game: 'cr', resource: 'war', tag: CLAN })).toBe(false);
    expect(ok({ game: 'cr', resource: 'warLog', tag: CLAN })).toBe(false);
    expect(ok({ game: 'cr', resource: 'capitalRaids', tag: CLAN })).toBe(false);
  });

  it('rejects the clan-wars ladder outside Clash Royale', () => {
    expect(ok({ game: 'coc', resource: 'leaderboard', board: 'clans', mode: 'war' })).toBe(false);
  });
});

describe('parameter guards', () => {
  it('requires a well-formed, finished season for Path of Legend', () => {
    expect(ok({ game: 'cr', resource: 'pathOfLegend', season: '2026-10' })).toBe(true);
    expect(ok({ game: 'cr', resource: 'pathOfLegend' })).toBe(false);
    expect(ok({ game: 'cr', resource: 'pathOfLegend', season: 'latest' })).toBe(false);
  });

  it('requires a leaderboard id', () => {
    expect(ok({ game: 'cr', resource: 'leaderboardRankings', leaderboardId: 170000019 })).toBe(true);
    expect(ok({ game: 'cr', resource: 'leaderboardRankings' })).toBe(false);
  });

  it('validates every tagged resource', () => {
    expect(ok({ game: 'cr', resource: 'riverRace', tag: 'not-a-tag' })).toBe(false);
    expect(ok({ game: 'cr', resource: 'upcomingChests', tag: '#' })).toBe(false);
    expect(ok({ game: 'cr', resource: 'riverRaceLog', tag: CLAN })).toBe(true);
  });

  it('bounds the tournament search the way clan search is bounded', () => {
    expect(ok({ game: 'cr', resource: 'tournamentSearch', name: 'ab' })).toBe(false);
    expect(ok({ game: 'cr', resource: 'tournamentSearch', name: 'royale' })).toBe(true);
  });
});
