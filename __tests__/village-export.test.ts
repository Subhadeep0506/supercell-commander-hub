import { parseVillageExport } from '@/lib/village-export';

import fixture from '../scripts/fixtures/coc-village-export.json';

const sample = JSON.stringify(fixture);

describe('parseVillageExport', () => {
  const v = parseVillageExport(sample, Date.UTC(2026, 10, 3, 14, 0, 0));

  it('reads the hall levels', () => {
    expect(v.tag).toBe('#LJ9V8LCYQ');
    expect(v.home.hallLevel).toBe(13);
    expect(v.builder.hallLevel).toBe(8);
  });

  it('counts builders from the placed huts', () => {
    expect(v.home.builders).toBe(5);
  });

  it('names the helpers', () => {
    expect(v.home.helpers).toEqual(["Builder's Apprentice", 'Lab Assistant']);
  });

  it('resolves every in-progress upgrade', () => {
    expect(v.home.inProgress.map((u) => `${u.name} ${u.fromLevel}->${u.toLevel}`).sort()).toEqual([
      'Dark Barracks 9->10',
      'Eagle Artillery 3->4',
      'Inferno Tower 6->7',
      'Royal Champion 1->2',
    ]);
    expect(v.builder.inProgress.map((u) => u.name)).toEqual(['Battle Machine']);
  });

  it('turns the relative timer into an absolute finish time', () => {
    const dark = v.home.inProgress.find((u) => u.name === 'Dark Barracks')!;
    expect(dark.finishesAt).toBe(1793712782 * 1000 + 204315 * 1000);
  });

  it('sums counts across level buckets and keeps the highest level', () => {
    // 242 at lv12 + 58 at lv13 is one set of 300 walls, not two.
    const walls = v.home.owned.find((o) => o.catalogId === 'home/wall')!;
    expect(walls.count).toBe(300);
    expect(walls.level).toBe(13);
    expect(walls.byLevel).toEqual([
      { level: 13, count: 58 },
      { level: 12, count: 242 },
    ]);
  });

  it('does not count an upgrading building as extra stock', () => {
    // Inferno Tower appears twice: once with a timer, once with cnt 2.
    const inferno = v.home.owned.find((o) => o.catalogId === 'home/inferno-tower')!;
    expect(inferno.count).toBe(2);
  });

  it('fills the Builder Base from the *2 arrays', () => {
    const bbWalls = v.builder.owned.find((o) => o.catalogId === 'builder/wall')!;
    expect(bbWalls.count).toBe(160);
    expect(v.builder.owned.some((o) => o.name === 'Raged Barbarian')).toBe(true);
  });

  it('rejects junk with a readable message', () => {
    expect(() => parseVillageExport('not json')).toThrow(/valid JSON/);
    expect(() => parseVillageExport('{"a":1}')).toThrow(/village export/);
    expect(() => parseVillageExport('   ')).toThrow(/Nothing to import/);
  });
});
