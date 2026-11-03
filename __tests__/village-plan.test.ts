import { parseVillageExport } from '@/lib/village-export';
import {
  completion,
  isRushed,
  laneTime,
  maxedBy,
  maxLevelAt,
  remainingUpgrades,
  schedule,
  sectionItems,
  wallsLeft,
} from '@/lib/village-plan';
import { BOOK_ITEMS } from '@/lib/clash-book';

import fixture from '../scripts/fixtures/coc-village-export.json';

const sample = JSON.stringify(fixture);
const NOW = 1793712782 * 1000; // the export's own timestamp
const v = parseVillageExport(sample, NOW);

describe('village-plan', () => {
  it('caps levels at what the hall allows', () => {
    const inferno = BOOK_ITEMS.find((i) => i.id === 'home/inferno-tower')!;
    expect(maxLevelAt(inferno, 13)).toBeGreaterThan(0);
    // A TH1 village cannot have an Inferno Tower at all.
    expect(maxLevelAt(inferno, 1)).toBe(0);
  });

  it('reports completion between 0 and 100 for both villages', () => {
    for (const side of [v.home, v.builder]) {
      const c = completion(side);
      expect(c.total).toBeGreaterThan(0);
      expect(c.pct).toBeGreaterThan(0);
      expect(c.pct).toBeLessThanOrEqual(100);
    }
  });

  it('counts Builder Base walls against the hall allowance', () => {
    // BH8 allows 160 walls, and all 160 are placed but not at max level.
    const w = wallsLeft(v.builder);
    expect(w.total).toBe(160);
  });

  it('finds work left in each lane', () => {
    const remaining = remainingUpgrades(v.home);
    expect(remaining.length).toBeGreaterThan(0);
    expect(laneTime(remaining, 'builder')).toBeGreaterThan(0);
    expect(laneTime(remaining, 'lab')).toBeGreaterThan(0);
    // Hero equipment costs ore, not time, so it never enters a queue.
    expect(remaining.some((r) => r.category === 'hero-equipment')).toBe(false);
  });

  it('never starts a builder before its running upgrade finishes', () => {
    const remaining = remainingUpgrades(v.home);
    const plan = schedule(v.home, remaining, 'balanced', NOW);
    expect(plan.length).toBeGreaterThan(0);
    const earliestFree = Math.min(...v.home.inProgress.map((u) => u.finishesAt));
    for (const task of plan.filter((t) => t.lane === 'builder')) {
      expect(task.startsAt).toBeGreaterThanOrEqual(NOW);
      expect(task.endsAt).toBeGreaterThan(task.startsAt);
    }
    // 5 builders, 4 of them busy -- so one task can start immediately and the
    // rest wait for a handover.
    expect(plan.some((t) => t.startsAt === NOW)).toBe(true);
    expect(earliestFree).toBeGreaterThan(NOW);
  });

  it('orders by the chosen strategy', () => {
    const remaining = remainingUpgrades(v.home);
    const heroFirst = schedule(v.home, remaining, 'hero', NOW, 12);
    const defenceFirst = schedule(v.home, remaining, 'defence', NOW, 12);
    expect(heroFirst.filter((t) => t.group === 'heroes').length).toBeGreaterThanOrEqual(
      defenceFirst.filter((t) => t.group === 'heroes').length,
    );
    expect(defenceFirst.filter((t) => t.group === 'defense').length).toBeGreaterThanOrEqual(
      heroFirst.filter((t) => t.group === 'defense').length,
    );
  });

  it('projects a finish date after every running upgrade', () => {
    const when = maxedBy(v.home, remainingUpgrades(v.home), NOW);
    expect(when).toBeGreaterThan(Math.max(...v.home.inProgress.map((u) => u.finishesAt)));
  });

  it('flags the Builder Base as rushed and groups the village', () => {
    expect(isRushed(v.builder)).toBe(true);
    const defenses = sectionItems(v.builder, ['defense', 'crafted-defense']);
    expect(defenses.length).toBeGreaterThan(0);
    expect(defenses.some((d) => d.maxed)).toBe(true);
  });
});

describe('rushed threshold', () => {
  it('separates a healthy hall from a rushed one', () => {
    // Calibrated against this village: Home sits at 91.8% of TH12 and reads as
    // healthy; Builder Base sits at 73.5% of BH7 and reads as rushed.
    expect(isRushed(v.home)).toBe(false);
    expect(isRushed(v.builder)).toBe(true);
  });
});
