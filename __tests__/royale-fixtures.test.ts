import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { cardLevel, splitCollection } from '@/lib/royale-cards';
import { modeRecords, normalizeBattle, parseApiDate } from '@/lib/royale-battles';
import { myDecks } from '@/lib/royale-decks';
import { logCursor, logSeasons, periodDays, periodLabel, raceStandings } from '@/lib/river-race';
import { copyProgress } from '@/lib/royale-upgrades';
import { arenaArt, arenaEvolutionArt } from '@/assets/arena';
import { groupLadders, seasonIds } from '@/lib/royale-ladders';

/**
 * The same modules, run over REAL captured responses.
 *
 * royale.test.ts uses hand-built records to pin behaviour; this pins the
 * behaviour against shapes Supercell actually returned. Regenerate with
 * `bun run build:cr-fixtures` -- if an assertion here starts failing after a
 * recapture, the API changed, not us.
 *
 * Captured 2026-11-04 from #L8YV8P2CL / #QC8LCPUU.
 */

import playerJson from '../scripts/fixtures/cr-player.json';
import catalogJson from '../scripts/fixtures/cr-cards.json';
import battlelogJson from '../scripts/fixtures/cr-battlelog.json';
import chestsJson from '../scripts/fixtures/cr-chests.json';
import clanJson from '../scripts/fixtures/cr-clan.json';
import raceJson from '../scripts/fixtures/cr-river-race.json';
import raceLogJson from '../scripts/fixtures/cr-river-race-log.json';
import leaderboardsJson from '../scripts/fixtures/cr-leaderboards.json';
import seasonsJson from '../scripts/fixtures/cr-seasons.json';

// Cast to the loose record type the whole app reads API data through, rather
// than letting TypeScript infer a literal type per fixture: the point of these
// tests is that the *runtime* shape is handled, and a literal type would make
// a missing field a compile error instead of the thing under test.
const player = playerJson as ApiRecord;
const catalog = catalogJson as ApiRecord;
const battlelog = battlelogJson as ApiRecord[];
const chests = chestsJson as ApiRecord;
const clan = clanJson as ApiRecord;
const race = raceJson as ApiRecord;
const raceLog = raceLogJson as ApiRecord;
const leaderboards = leaderboardsJson as ApiRecord;
const seasonsFixture = seasonsJson as ApiRecord;
const TAG = text(player['tag']);

describe('real player response', () => {
  it('is the calibration account', () => {
    expect(TAG).toBe('#L8YV8P2CL');
    expect(player['name']).toBe('DenCT');
  });

  it('has no leagueStatistics and no Path of Legend history', () => {
    // The two richest profile sections are absent on this account, so the
    // screens must treat absent as the default rather than the exception.
    expect(player['leagueStatistics']).toBeUndefined();
    expect(player['currentPathOfLegendSeasonResult']).toBeNull();
    expect(player['lastPathOfLegendSeasonResult']).toBeNull();
    expect(player['bestPathOfLegendSeasonResult']).toBeNull();
  });

  it('carries a progress map covering the other game modes', () => {
    const progress = record(player['progress']);
    // An empty-string key is real: it is the legacy Merge Tactics ladder.
    expect(Object.keys(progress)).toContain('');
    expect(Object.keys(progress).some((k) => k.startsWith('AutoChess'))).toBe(true);
    for (const value of Object.values(progress)) {
      expect(record(record(value)['arena'])['name']).toBeTruthy();
    }
  });

  it('has achievements whose value can exceed their target', () => {
    const achievements = rows(player['achievements']);
    expect(achievements).toHaveLength(12);
    // "Road to Glory 11/6" -- a progress bar must clamp rather than overflow.
    expect(achievements.some((a) => Number(a['value']) > Number(a['target']))).toBe(true);
  });
});

describe('real collection split', () => {
  const split = splitCollection(catalog, player);

  it('splits 78 unlocked from 45 locked cards', () => {
    expect(split.cards.unlocked).toHaveLength(78);
    expect(split.cards.locked).toHaveLength(45);
    expect(split.cards.unlocked.length + split.cards.locked.length).toBe(
      rows(record(catalog)['items']).length,
    );
  });

  it('splits the tower troops separately, 1 of 4', () => {
    expect(split.support.unlocked).toHaveLength(1);
    expect(split.support.locked).toHaveLength(3);
  });

  it('shows game levels, which differ from API levels for four of five rarities', () => {
    const nonCommon = split.cards.unlocked.filter(
      (c) => text(c['rarity']).toLowerCase() !== 'common' && typeof c['level'] === 'number',
    );
    expect(nonCommon.length).toBeGreaterThan(0);
    // Every non-common card's displayed level must exceed its raw API level.
    for (const card of nonCommon) {
      expect(cardLevel(card)).toBeGreaterThan(card['level'] as number);
    }
  });

  it('keeps maxEvolutionLevel from the catalog for owned cards', () => {
    const evolving = split.cards.unlocked.filter(
      (c) => typeof c['maxEvolutionLevel'] === 'number' && (c['maxEvolutionLevel'] as number) > 0,
    );
    expect(evolving.length).toBeGreaterThan(0);
  });

  it('computes copy progress on a real card', () => {
    const owned = split.cards.unlocked.find(
      (c) => typeof c['count'] === 'number' && typeof c['level'] === 'number',
    )!;
    expect(['max', 'progress', 'unknown']).toContain(
      copyProgress(owned['level'], owned['maxLevel'], owned['count']).kind,
    );
  });
});

describe('bundled artwork', () => {
  // The reason the aliases in src/assets/arena.ts exist. If the fan kit or the
  // card list changes, this is what catches a card rendering as a blank tile.
  it('covers every card the API returns', () => {
    const missing = rows(record(catalog)['items'])
      .filter((c) => !arenaArt(c['name']))
      .map((c) => text(c['name']));
    expect(missing).toEqual([]);
  });

  it('covers every tower troop', () => {
    const missing = rows(record(catalog)['supportItems'])
      .filter((c) => !arenaArt(c['name']))
      .map((c) => text(c['name']));
    expect(missing).toEqual([]);
  });

  it('has evolution art for only some of the cards that evolve', () => {
    const evolve = rows(record(catalog)['items']).filter(
      (c) => typeof c['maxEvolutionLevel'] === 'number' && (c['maxEvolutionLevel'] as number) > 0,
    );
    const bundled = evolve.filter((c) => arenaEvolutionArt(c['name']));
    // Documents the gap rather than asserting a number that will drift: the
    // shortfall is why evolution tiles fall back to iconUrls.evolutionMedium.
    expect(evolve.length).toBeGreaterThan(bundled.length);
    expect(bundled.length).toBeGreaterThan(0);
  });

  it('returns nothing rather than base art for an unevolved card', () => {
    // Handing back the base image here would make every card look evolved.
    expect(arenaEvolutionArt('Knight')).toBeUndefined();
    expect(arenaArt('Knight')).toBeDefined();
  });
});

describe('real battle log', () => {
  it('returns a short, unpaged window', () => {
    expect(battlelog).toHaveLength(26);
  });

  it('parses every timestamp', () => {
    for (const battle of battlelog) {
      expect(parseApiDate(battle['battleTime'])).toBeInstanceOf(Date);
    }
  });

  it('resolves an outcome for every battle', () => {
    for (const battle of battlelog) {
      const n = normalizeBattle(battle, TAG);
      expect(['victory', 'defeat', 'draw']).toContain(n.outcome);
      expect(n.myCrowns).not.toBeNull();
    }
  });

  it('derives a per-mode record that sums back to the log', () => {
    const records = modeRecords(battlelog, TAG);
    expect(records.length).toBeGreaterThan(0);
    const counted = records.reduce((sum, r) => sum + r.battles, 0);
    expect(counted).toBe(battlelog.length);
  });

  it('mines four distinct decks the player played', () => {
    const decks = myDecks(battlelog, TAG, rows(player['currentDeck']), rows(player['currentDeckSupportCards']));
    expect(decks).toHaveLength(4);
    expect(decks[0]!.isCurrent).toBe(true);
    expect(decks.every((d) => d.cards.length === 8)).toBe(true);
    // Plays across all mined decks cannot exceed the log.
    expect(decks.reduce((sum, d) => sum + d.plays, 0)).toBe(battlelog.length);
  });

  it('gives every mined deck an elixir average, since all eight cards carry a cost', () => {
    const decks = myDecks(battlelog, TAG, rows(player['currentDeck']));
    for (const deck of decks) expect(deck.averageElixir).not.toBeNull();
  });
});

describe('real upcoming chests', () => {
  it('returns a sparse index track, not a contiguous one', () => {
    const items = rows(record(chests)['items']);
    expect(items).toHaveLength(16);
    const indices = items.map((c) => c['index'] as number);
    expect(indices[0]).toBe(0);
    // The gap is the point: a list keyed by position would misplace every
    // chest after the eighth.
    expect(Math.max(...indices)).toBeGreaterThan(items.length);
  });
});

describe('real river race', () => {
  it('is a training week with five clans and no period logs', () => {
    expect(periodLabel(race)).toBe('Training');
    expect(rows(record(race)['clans'])).toHaveLength(5);
    // The war-day shape stays unverified until the clan reaches a war day.
    expect(periodDays(race)).toEqual([]);
  });

  it('ranks the five clans and finds our own', () => {
    const standings = raceStandings(race, text(record(clan)['tag']));
    expect(standings).toHaveLength(5);
    expect(standings.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(standings.filter((c) => c.isMine)).toHaveLength(1);
  });

  it('aggregates participants without exceeding the roster', () => {
    const mine = raceStandings(race, text(record(clan)['tag'])).find((c) => c.isMine)!;
    expect(mine.participants.length).toBeGreaterThan(0);
    expect(mine.active).toBeLessThanOrEqual(mine.participants.length);
    expect(mine.decksUsedToday).toBeLessThanOrEqual(mine.decksUsed);
  });

  it('normalises the log', () => {
    const seasons = logSeasons(raceLog, text(record(clan)['tag']));
    expect(seasons.length).toBeGreaterThan(0);
    for (const season of seasons) {
      expect(season.created).toBeInstanceOf(Date);
      expect(season.standings.map((s) => s.rank)).toEqual(
        [...season.standings.map((s) => s.rank)].sort((a, b) => a - b),
      );
    }
  });

  it('reports no cursor on the last page', () => {
    // This capture asked for 10 and the clan's whole history is 10, so the
    // API answers with `cursors: {}` rather than omitting `paging`. An empty
    // object has to read as "no more pages", not as a missing field -- get
    // this wrong and the Load more button never goes away.
    expect(record(raceLog['paging'])['cursors']).toEqual({});
    expect(logCursor(raceLog)).toBeNull();
  });
});

describe('real leaderboards registry', () => {
  it('collapses 34 entries into six named ladders plus the nameless ones', () => {
    const { named, unnamed } = groupLadders(leaderboards);
    expect(named.length + unnamed.length).toBeGreaterThan(0);
    // Six distinct names across fifteen entries; nineteen have name: null.
    expect(named).toHaveLength(6);
    expect(unnamed).toHaveLength(19);
    expect(named.map((l) => l.name)).toContain('Merge Tactics');
  });

  it('picks the newest season of a repeated ladder', () => {
    const { named } = groupLadders(leaderboards);
    const merge = named.find((l) => l.name === 'Merge Tactics')!;
    expect(merge.seasons.length).toBeGreaterThan(1);
    // The representative id must be the highest, i.e. the newest season.
    expect(Number(merge.id)).toBe(Math.max(...merge.seasons.map(Number)));
  });

  it('labels the nameless ladders by id rather than hiding them', () => {
    const { unnamed } = groupLadders(leaderboards);
    for (const ladder of unnamed) expect(ladder.name).toBe(`Ladder ${ladder.id}`);
  });

  it('de-duplicates the season list, newest first', () => {
    const ids = seasonIds(seasonsFixture);
    expect(ids.length).toBeLessThan(rows(record(seasonsFixture)['items']).length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe([...ids].sort((a, b) => b.localeCompare(a))[0]);
  });
});
