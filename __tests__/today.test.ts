import { buildToday, tournamentItems, type TodayInput } from '@/lib/today';
import { sampleWarTags, allWarTags, buildRounds, currentRound } from '@/lib/cwl';
import type { ApiRecord } from '@/api/game-api';

/**
 * The Today board's rules, tested without a browser.
 *
 * `now` is injected throughout: the ordering, the grace window and the "is it
 * past" checks are all relative to it, and a test that waited for real time to
 * pass would be both slow and flaky.
 *
 * The screen's one invariant is **real timestamps only**, so the cases that
 * matter most are the ones where a field looks like a time but is not: the
 * 1969 epoch sentinel, a `notInWar` state, and a river race that publishes no
 * end time at all.
 */

const NOW = new Date('2026-11-06T12:00:00.000Z');

/** Supercell's compact stamp, offset from NOW. */
const at = (ms: number): string => {
  const d = new Date(NOW.getTime() + ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000Z`
  );
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const war = (state: string, startIn: number, endIn: number): ApiRecord =>
  ({ state, startTime: at(startIn), endTime: at(endIn) }) as ApiRecord;

const build = (input: TodayInput) => buildToday({ hasCoc: true, hasCr: true, ...input }, NOW);

describe('clan war', () => {
  it('counts battle day down to endTime', () => {
    const { events } = build({ war: war('inWar', -2 * HOUR, 6 * HOUR) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'war', phase: 'Battle day', ending: true });
    expect(events[0]!.target.toISOString()).toBe(new Date(NOW.getTime() + 6 * HOUR).toISOString());
  });

  it('counts preparation down to startTime, not endTime', () => {
    const { events } = build({ war: war('preparation', 3 * HOUR, 27 * HOUR) });
    expect(events[0]).toMatchObject({ phase: 'Preparation', ending: false });
    expect(events[0]!.target.getTime()).toBe(NOW.getTime() + 3 * HOUR);
  });

  it('produces nothing for a finished or absent war', () => {
    expect(build({ war: war('warEnded', -2 * DAY, -DAY) }).events).toHaveLength(0);
    expect(build({ war: war('notInWar', 0, 0) }).events).toHaveLength(0);
    expect(build({}).events).toHaveLength(0);
  });

  it('keeps a war whose end just passed, because the API state lags the clock', () => {
    // Still reporting inWar a minute after endTime is the normal changeover.
    const { events } = build({ war: war('inWar', -DAY, -60_000) });
    expect(events).toHaveLength(1);
  });

  it('drops a war whose end passed long ago', () => {
    expect(build({ war: war('inWar', -2 * DAY, -DAY) }).events).toHaveLength(0);
  });
});

describe('raid weekend', () => {
  const ongoing = [{ state: 'ongoing', startTime: at(-DAY), endTime: at(2 * DAY) }] as ApiRecord[];

  it('counts an ongoing weekend down to its end', () => {
    const { events } = build({ raidSeasons: ongoing });
    expect(events[0]).toMatchObject({ kind: 'raid', phase: 'Underway', ending: true });
  });

  it('counts to the next opening when none is running', () => {
    const ended = [{ state: 'ended', startTime: at(-9 * DAY), endTime: at(-6 * DAY) }] as ApiRecord[];
    const { events } = build({ raidSeasons: ended });
    expect(events[0]).toMatchObject({ phase: 'Opens', ending: false });
    // Friday 07:00 UTC; NOW is a Friday at 12:00, so the next is a week out.
    expect(events[0]!.target.getUTCDay()).toBe(5);
    expect(events[0]!.target.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('produces nothing when no seasons are known', () => {
    expect(build({ raidSeasons: [] }).events).toHaveLength(0);
  });
});

describe('clan war league', () => {
  /** Two drawn rounds: the first ended, the second being fought. */
  const group = {
    state: 'inWar',
    rounds: [
      { warTags: ['#R1A', '#R1B', '#R1C', '#R1D'] },
      { warTags: ['#R2A', '#R2B', '#R2C', '#R2D'] },
      { warTags: ['#0', '#0', '#0', '#0'] },
    ],
  } as ApiRecord;

  const wars = new Map<string, ApiRecord>([
    ['#R1A', war('warEnded', -2 * DAY, -DAY)],
    ['#R2A', war('inWar', -3 * HOUR, 21 * HOUR)],
  ]);

  it('headlines the round being fought and numbers it', () => {
    const { events } = build({ leagueGroup: group, leagueWars: wars });
    const cwl = events.find((e) => e.kind === 'cwl');
    expect(cwl).toMatchObject({ phase: 'Battle day', detail: 'Round 2 of 3', ending: true });
  });

  it('reads the round from a one-war sample', () => {
    // Exactly the point of sampleWarTags: one war per round is enough,
    // because a round's four wars share a state and a pair of timestamps.
    expect(sampleWarTags(group)).toEqual(['#R1A', '#R2A']);
    expect(allWarTags(group)).toHaveLength(8);

    const sampled = buildRounds(group, wars);
    const full = buildRounds(
      group,
      new Map([
        ...wars,
        ['#R1B', war('warEnded', -2 * DAY, -DAY)],
        ['#R2B', war('inWar', -3 * HOUR, 21 * HOUR)],
      ]),
    );
    expect(currentRound(sampled)).toBe(currentRound(full));
    expect(sampled.map((r) => r.status)).toEqual(full.map((r) => r.status));
  });

  it('skips the placeholder round rather than fetching #0', () => {
    expect(sampleWarTags(group)).not.toContain('#0');
  });

  it('produces nothing outside a league season', () => {
    expect(build({ leagueGroup: { state: 'notInWar', rounds: [] } as ApiRecord }).events).toHaveLength(0);
  });

  it('produces nothing when the sampled war has not arrived yet', () => {
    const { events } = build({ leagueGroup: group, leagueWars: new Map() });
    expect(events.find((e) => e.kind === 'cwl')).toBeUndefined();
  });
});

describe('clash royale', () => {
  it('counts a running global tournament down to its end', () => {
    const { events, notes } = build({
      tournaments: [{ title: 'Event_MegaDraft', startTime: at(-DAY), endTime: at(2 * DAY) }] as ApiRecord[],
    });
    expect(events[0]).toMatchObject({ game: 'cr', kind: 'tournament', phase: 'Running' });
    expect(events[0]!.title).toBe('Mega Draft');
    // A live clock replaces the sentence rather than sitting beside it.
    expect(notes).toHaveLength(0);
  });

  it('counts an upcoming tournament down to its start', () => {
    const { events } = build({
      tournaments: [{ title: 'Soon', startTime: at(2 * HOUR), endTime: at(3 * DAY) }] as ApiRecord[],
    });
    expect(events[0]).toMatchObject({ phase: 'Starts', ending: false });
    expect(events[0]!.target.getTime()).toBe(NOW.getTime() + 2 * HOUR);
  });

  it('states the position when no tournament is running, which is the normal case', () => {
    const { events, notes } = build({ tournaments: [] });
    expect(events).toHaveLength(0);
    expect(notes[0]!.body).toMatch(/No global tournament is running/i);
  });

  it('names the river race period but never counts it down', () => {
    const { events, notes } = build({
      tournaments: [],
      riverRace: { state: 'full', periodType: 'warDay', periodIndex: 3 } as ApiRecord,
    });
    expect(events).toHaveLength(0);
    expect(notes[0]!.body).toMatch(/War Day/);
    // The whole point: the service publishes no end time, and we say so.
    expect(notes[0]!.body).toMatch(/without an end time/i);
  });

  it('says nothing about Royale when no Royale account is saved', () => {
    expect(buildToday({ hasCoc: true, hasCr: false, tournaments: [] }, NOW).notes).toHaveLength(0);
  });

  it('ignores a tournament that already finished', () => {
    const { events } = build({
      tournaments: [{ title: 'Old', startTime: at(-5 * DAY), endTime: at(-2 * DAY) }] as ApiRecord[],
    });
    expect(events).toHaveLength(0);
  });

  it('rejects the 1969 epoch sentinel rather than showing a 57-year countdown', () => {
    const { events } = build({
      tournaments: [
        { title: 'Broken', startTime: '19691231T235959.000Z', endTime: '19691231T235959.000Z' },
      ] as ApiRecord[],
    });
    expect(events).toHaveLength(0);
  });

  it('accepts both documented shapes of the tournaments response', () => {
    expect(tournamentItems({ items: [{ tag: '#A' }] })).toHaveLength(1);
    expect(tournamentItems([{ tag: '#A' }, { tag: '#B' }])).toHaveLength(2);
    expect(tournamentItems(undefined)).toHaveLength(0);
  });
});

/**
 * `/v1/events` is the one source with no timestamp of any kind -- probed live
 * 2026-11-06: a bare array of `{eventTag, title, description}`, six entries,
 * `description` null on several. They are real and worth listing, so they get
 * their own channel rather than being dropped for having no clock.
 */
describe('untimed Clash Royale events', () => {
  const sample = [
    { eventTag: '#A', title: 'Classic Challenge', description: 'Win 12, lose 3.' },
    { eventTag: '#B', title: 'Merge Tactics', description: null },
  ] as ApiRecord[];

  it('lists events that carry no time at all', () => {
    const { live } = build({ crEvents: sample });
    expect(live).toHaveLength(2);
    expect(live[0]).toMatchObject({ game: 'cr', title: 'Classic Challenge' });
  });

  it('keeps an event whose description is null', () => {
    const { live } = build({ crEvents: sample });
    expect(live[1]).toMatchObject({ title: 'Merge Tactics' });
    expect(live[1]!.body).toBeUndefined();
  });

  it('never puts an untimed event in the countdown list', () => {
    const { events, live } = build({ crEvents: sample });
    expect(live).toHaveLength(2);
    expect(events).toHaveLength(0);
  });

  it('drops an event with no usable title rather than rendering a blank card', () => {
    const { live } = build({ crEvents: [{ eventTag: '#C', description: 'x' }] as ApiRecord[] });
    expect(live).toHaveLength(0);
  });

  it('reads a localized title object as well as a plain string', () => {
    const { live } = build({
      crEvents: [{ eventTag: '#D', title: { en: 'Draft Day' } }] as ApiRecord[],
    });
    expect(live[0]!.title).toBe('Draft Day');
  });

  it('gives every event a distinct id, even without an eventTag', () => {
    const { live } = build({
      crEvents: [{ title: 'One' }, { title: 'Two' }] as ApiRecord[],
    });
    expect(new Set(live.map((e) => e.id)).size).toBe(2);
  });

  it('reframes the quiet note so it does not contradict the list', () => {
    const quiet = build({ crEvents: [], tournaments: [] }).notes[0]!.body;
    const withEvents = build({ crEvents: sample, tournaments: [] }).notes[0]!.body;
    expect(quiet).toMatch(/No global tournament is running right now/i);
    // With events listed, the note explains the *missing countdown* instead of
    // claiming nothing is happening.
    expect(withEvents).toMatch(/without a published end time/i);
  });
});

describe('ordering', () => {
  it('lists events soonest first, whichever game they came from', () => {
    const { events } = build({
      war: war('inWar', -HOUR, 6 * HOUR),
      raidSeasons: [{ state: 'ongoing', startTime: at(-DAY), endTime: at(2 * DAY) }] as ApiRecord[],
      tournaments: [{ title: 'T', startTime: at(-DAY), endTime: at(30 * 60_000) }] as ApiRecord[],
    });
    expect(events.map((e) => e.kind)).toEqual(['tournament', 'war', 'raid']);

    const times = events.map((e) => e.target.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('gives every event a distinct id so the list can key on it', () => {
    const { events } = build({
      war: war('inWar', -HOUR, 6 * HOUR),
      raidSeasons: [{ state: 'ongoing', startTime: at(-DAY), endTime: at(2 * DAY) }] as ApiRecord[],
    });
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
});
