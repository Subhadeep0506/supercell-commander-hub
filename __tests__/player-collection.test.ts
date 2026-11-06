import { playerCollection } from '@/lib/player-collection';
import { parseVillageExport } from '@/lib/village-export';
import { hallOnly, maxLevelAt } from '@/lib/village-plan';
import { BOOK_ITEMS, bookLevels, superchargeLevels } from '@/lib/clash-book';

import player from '../scripts/fixtures/coc-player.json';
import villageFixture from '../scripts/fixtures/coc-village-export.json';

const record = player as Record<string, unknown>;
const home = () => playerCollection(record, 'home');
const section = (id: string) => home().find((s) => s.id === id)!;

describe('hallOnly', () => {
  /*
   * These are the real in-game caps, and they only come out right because the
   * gating buildings are themselves Town-Hall-gated: a Town Hall 13 allows a
   * Hero Hall 7 and a Laboratory 11, not a Hero Hall 13.
   *
   * Mapping every gate straight onto the hall level -- which is what this did
   * before -- reported a Barbarian King cap of 110 for a Town Hall 13.
   */
  const item = (id: string) => BOOK_ITEMS.find((i) => i.id === id)!;

  it.each([
    ['home/barbarian-king', 13, 75],
    ['home/barbarian-king', 16, 95],
    ['home/barbarian-king', 18, 110],
    ['home/barbarian', 13, 9],
    ['home/barbarian', 18, 13],
    ['home/royal-champion', 13, 25],
  ])('caps %s at town hall %i to %i', (id, hall, expected) => {
    expect(maxLevelAt(item(id), hallOnly(hall))).toBe(expected);
  });

  it('locks pets below town hall 14, where the Pet House first appears', () => {
    const unicorn = item('home/unicorn');
    expect(maxLevelAt(unicorn, hallOnly(13))).toBe(0);
    expect(maxLevelAt(unicorn, hallOnly(14))).toBeGreaterThan(0);
  });

  it('gates Builder Base heroes on the Builder Hall', () => {
    // `builderHallLevelRequired` was absent from the requirement table, so
    // these two reported their game maximum as reachable at every hall.
    const machine = item('builder/battle-machine');
    expect(maxLevelAt(machine, hallOnly(4, 'builder'))).toBeLessThan(
      maxLevelAt(machine, hallOnly(10, 'builder')),
    );
  });
});

describe('playerCollection', () => {
  it('lists every pet, not only the ones the service returned', () => {
    // The bug this whole module exists for. The service returns only what you
    // own, so a Pets section driven by the response is short -- or, on an
    // account below Town Hall 14, absent entirely.
    const pets = section('pets');
    expect(pets.entries).toHaveLength(12);
    expect(pets.owned).toBeLessThan(pets.total);
    expect(pets.entries.filter((e) => e.state !== 'owned').length).toBeGreaterThan(0);
  });

  it('lists all twelve pets as locked below town hall 14', () => {
    const young = playerCollection({ ...record, townHallLevel: 13, troops: [] }, 'home');
    const pets = young.find((s) => s.id === 'pets')!;
    expect(pets.entries).toHaveLength(12);
    expect(pets.entries.every((e) => e.state === 'locked')).toBe(true);
  });

  it('marks what the hall can unlock today as ready', () => {
    const ready = home().flatMap((s) => s.entries.filter((e) => e.state === 'ready'));
    expect(ready.length).toBeGreaterThan(0);
    for (const entry of ready) {
      expect(entry.level).toBeUndefined();
      expect(entry.hallMax).toBeGreaterThan(0);
    }
  });

  it('reads levels off the service for what the account owns', () => {
    const king = section('heroes').entries.find((e) => e.item.id === 'home/barbarian-king')!;
    expect(king.state).toBe('owned');
    expect(king.level).toBe(41);
  });

  it('separates maxed-for-this-hall from maxed-for-the-game', () => {
    const entries = home().flatMap((s) => s.entries);
    const hallMaxed = entries.filter((e) => e.maxedForHall);
    expect(hallMaxed.length).toBeGreaterThan(0);
    // Nothing can be maxed for the game without also being maxed for the hall,
    // which is what lets the tile pick one border and show gold over green.
    for (const entry of entries.filter((e) => e.maxedForGame)) {
      expect(entry.maxedForHall).toBe(true);
    }
    // ...and neither flag is ever claimed for something you do not own.
    for (const entry of entries.filter((e) => e.state !== 'owned')) {
      expect(entry.maxedForHall).toBe(false);
      expect(entry.maxedForGame).toBe(false);
    }
  });

  /*
   * Buildings are no longer listed here at all.
   *
   * The player endpoint carries no level for any of them, so the four
   * sections rendered as a wall of grey "?" tiles above a prompt to paste a
   * village export -- which exists only for your own account, never for the
   * clan member whose profile this same data draws. The Builder screen keeps
   * the village grid that genuinely has the levels.
   */
  it('lists the army only, never buildings or defenses', () => {
    const categories = new Set(home().flatMap((s) => s.entries.map((e) => e.item.category)));
    for (const absent of ['defense', 'crafted-defense', 'trap', 'wall', 'resource', 'town-hall']) {
      expect(categories.has(absent)).toBe(false);
    }
    expect(categories.has('troop')).toBe(true);
    expect(playerCollection(record, 'builderBase').map((s) => s.id)).toEqual(['heroes', 'troops']);
  });

  /*
   * The import is still passed in, and still does something: it knows the real
   * Laboratory and Hero Hall levels rather than the ones a Town Hall merely
   * implies, so it can only ever lower a cap, never raise one.
   */
  it('lets an imported village sharpen the army caps', () => {
    const village = parseVillageExport(JSON.stringify(villageFixture), 1793712782 * 1000);
    const withImport = playerCollection(record, 'home', village);
    const capOf = (sections: ReturnType<typeof playerCollection>, id: string) =>
      sections.flatMap((s) => s.entries).find((e) => e.item.id === id)!.hallMax;
    expect(capOf(withImport, 'home/barbarian')).toBeLessThanOrEqual(
      capOf(home(), 'home/barbarian'),
    );
  });

  it('covers the Builder Base from the same player record', () => {
    const builder = playerCollection(record, 'builderBase');
    const heroes = builder.find((s) => s.id === 'heroes')!;
    expect(heroes.entries.map((e) => e.name).sort()).toEqual(['Battle Copter', 'Battle Machine']);
    expect(heroes.owned).toBe(2);
  });

  it('puts what you own first and what you cannot reach last', () => {
    for (const s of home()) {
      const states = s.entries.map((e) => e.state);
      const firstLocked = states.indexOf('locked');
      const lastOwned = states.lastIndexOf('owned');
      if (firstLocked >= 0 && lastOwned >= 0) expect(lastOwned).toBeLessThan(firstLocked);
    }
  });
});

describe('bookLevels', () => {
  const item = (id: string) => BOOK_ITEMS.find((i) => i.id === id)!;

  /*
   * Eighteen buildings carry a Supercharge track, numbered from 1 again on top
   * of the maxed building and gated at Town Hall 18. It used to be mixed into
   * the main level list, so the Inferno Tower card read "14 levels" under
   * "Game max 12" and the last two stops of the slider jumped back to a level
   * 1 tower priced at 13,000,000.
   */
  it('keeps the supercharge track out of the level list', () => {
    const inferno = item('home/inferno-tower');
    const levels = bookLevels(inferno);
    expect(levels).toHaveLength(12);
    expect(levels.map((r) => r['level'])).toEqual([...Array(12)].map((_, i) => i + 1));
    expect(levels.every((r) => r['supercharge'] !== true)).toBe(true);
  });

  it('hands the supercharge track back rather than dropping it', () => {
    const supercharge = superchargeLevels(item('home/inferno-tower'));
    expect(supercharge).toHaveLength(2);
    expect(supercharge.every((r) => r['townHallRequired'] === 18)).toBe(true);
  });

  it('leaves an item without a supercharge track alone', () => {
    expect(superchargeLevels(item('home/barbarian'))).toHaveLength(0);
    expect(bookLevels(item('home/barbarian')).length).toBeGreaterThan(0);
  });
});
