import { playerCollection } from '@/lib/player-collection';
import {
  playerContext,
  playerProgress,
  remainingUpgradeCost,
} from '@/lib/player-progress';
import { BOOK_ITEMS } from '@/lib/clash-book';
import { hallOnly, maxLevelAt } from '@/lib/village-plan';

import player from '../scripts/fixtures/coc-player.json';

const record = player as Record<string, unknown>;
const hall = Number(record['townHallLevel']);
const sections = playerCollection(record, 'home');
const progress = playerProgress(sections, hall, 'home');
const row = (id: string) => progress.rows.find((r) => r.id === id);
const item = (id: string) => BOOK_ITEMS.find((i) => i.id === id)!;

describe('playerProgress', () => {
  it('names the hall it is measuring against', () => {
    expect(hall).toBe(13);
    expect(progress.hallName).toBe('Town Hall 13');
    expect(progress.hallLabel).toBe('TH13');
  });

  /*
   * Super Troops carry a level table copied from the troop they are a variant
   * of, so counting them adds a second copy of a third of the army: at Town
   * Hall 13 the denominator goes from ~548 to ~705 and the headline moves for
   * a reason no player could account for.
   */
  it('leaves Super Troops out of the figures entirely', () => {
    expect(sections.some((s) => s.id === 'super-troops')).toBe(true);
    expect(row('super-troops')).toBeUndefined();
    expect(progress.total).toBeLessThan(600);
  });

  /*
   * Hero equipment is bought with ore rather than levelled against a hall, so
   * it is reported but never counted -- the same call `completion()` makes for
   * the Builder Plan.
   */
  it('keeps hero equipment off the headline', () => {
    const equipment = row('equipment')!;
    expect(equipment.inHeadline).toBe(false);
    expect(equipment.behind).toBe(0);
    const headline = progress.rows.filter((r) => r.inHeadline);
    expect(headline.reduce((n, r) => n + r.total, 0)).toBe(progress.total);
    expect(equipment.total).toBeGreaterThan(0);
  });

  it('agrees with the sum of its own rows', () => {
    const headline = progress.rows.filter((r) => r.inHeadline);
    expect(headline.reduce((n, r) => n + r.have, 0)).toBe(progress.have);
    expect(progress.pct).toBeCloseTo((progress.have / progress.total) * 100, 6);
  });

  /*
   * A Pet House cannot be placed below Town Hall 14, so every pet is locked
   * and the row has nothing to measure. Dropping it is what keeps an empty bar
   * labelled "Pets 0%" off a perfectly healthy TH13 account.
   */
  it('drops a row this hall cannot reach at all', () => {
    expect(hallOnly(13).petHouse).toBe(0);
    expect(sections.some((s) => s.id === 'pets')).toBe(true);
    expect(row('pets')).toBeUndefined();
  });

  /*
   * The warning count is measured against the *previous* hall, which is what
   * separates "still working through this one" from "skipped the last one".
   * The Royal Champion does not exist below Town Hall 13, so she can never be
   * behind at 13 however low her level.
   */
  it('counts only what the previous hall should already have finished', () => {
    expect(maxLevelAt(item('home/royal-champion'), hallOnly(12))).toBe(0);
    const heroes = row('heroes')!;
    const champion = heroes.left.find((e) => e.item.id === 'home/royal-champion');
    expect(champion).toBeDefined();
    expect(heroes.behind).toBeLessThan(heroes.left.length);
    for (const r of progress.rows) {
      expect(r.behind).toBeLessThanOrEqual(r.left.length);
    }
  });

  it('reports how far short of the previous hall the army is', () => {
    expect(progress.rushedPct).toBeGreaterThan(0);
    expect(progress.rushedPct).toBeLessThanOrEqual(100);
    // The badge and the figure can never contradict each other.
    expect(progress.rushed).toBe(progress.rushedPct > 15);
  });

  it('never calls a brand new village rushed', () => {
    const fresh = playerProgress(playerCollection({ ...record, townHallLevel: 1 }, 'home'), 1, 'home');
    expect(fresh.rushedPct).toBe(0);
    expect(fresh.rushed).toBe(false);
  });

  it('carries how many levels each unfinished item has left', () => {
    for (const r of progress.rows) {
      for (const entry of r.left) {
        expect(entry.toGo).toBe(entry.hallMax - Math.min(entry.level ?? 0, entry.hallMax));
        expect(entry.toGo).toBeGreaterThan(0);
      }
    }
  });
});

describe('playerContext', () => {
  const context = playerContext(sections, hall, 'home');

  /*
   * The exact figures the item sheet prints. `maxLevel` from the service is
   * the *game* maximum -- 27 for a Giant Gauntlet -- while 18 is all a Town
   * Hall 13 Blacksmith can reach, and 18 is the number a player is asking for.
   */
  it('caps an item at what this hall allows, not at the game maximum', () => {
    expect(context.hallMaxOf('home/giant-gauntlet')).toBe(18);
    expect(item('home/giant-gauntlet').levels).toHaveLength(27);
  });

  it('reaches levels across sections, which is what "Worn by" needs', () => {
    expect(context.levelOf('home/barbarian-king')).toBe(41);
    expect(item('home/giant-gauntlet')['hero']).toBe('barbarian-king');
  });

  it('says nothing about an item the player does not own', () => {
    expect(context.levelOf('home/unicorn')).toBeUndefined();
  });
});

describe('remainingUpgradeCost', () => {
  /*
   * Hero equipment is bought with three ores and takes no time at all, which
   * is why the sheet shows resources and no clock for it.
   */
  it('adds up the ores for the rest of an equipment track', () => {
    const roll = remainingUpgradeCost(item('home/giant-gauntlet'), 14, 18);
    expect(roll.levels).toBe(4);
    expect(roll.seconds).toBe(0);
    expect(Number(roll.costs['upgradeShinyOre'])).toBeGreaterThan(0);
    expect(Number(roll.costs['upgradeStarryOre'])).toBeGreaterThan(0);
  });

  /*
   * Troops cost elixir *and* lab time, and the time lives in an object -- so
   * no amount of summing numeric fields would ever have found it. It is summed
   * through `levelTime`, the same reader the Builder Plan uses.
   */
  it('adds up research time as well as resources for a troop', () => {
    const roll = remainingUpgradeCost(item('home/barbarian'), 1, 9);
    expect(roll.levels).toBe(8);
    expect(roll.seconds).toBeGreaterThan(0);
    expect(Number(roll.costs['researchCost'])).toBeGreaterThan(0);
    // The currency string is carried through untouched so the sheet can fold
    // it back onto the amount and draw the right resource icon.
    expect(typeof roll.costs['researchCostResource']).toBe('string');
  });

  it('reports nothing when there is nothing left', () => {
    const roll = remainingUpgradeCost(item('home/barbarian'), 9, 9);
    expect(roll.levels).toBe(0);
    expect(roll.seconds).toBe(0);
    expect(Object.keys(roll.costs)).toHaveLength(0);
  });
});
