import { rows, text, type ApiRecord, type Game } from '@/api/game-api';
import { parseApiTime, raidCountdown } from '@/lib/clan';
import { buildRounds, currentRound, ROUND_LABELS } from '@/lib/cwl';
import { periodLabel } from '@/lib/river-race';
import type { RouteName } from '@/navigation/routes';

/**
 * What the Today screen shows, decided here rather than in the view.
 *
 * The screen's one rule is **real timestamps only**: every countdown on it
 * traces back to a field the game service published, never to an assumption
 * about when a period ends. That rule is why this file exists -- the two games
 * differ sharply in what they publish, and the difference has to be handled
 * somewhere that can be tested without a browser.
 *
 * - **Clash of Clans publishes three.** The current war, each Clan War League
 *   round, and the capital raid weekend all carry real start and end times.
 * - **Clash Royale publishes one, and only sometimes.** A live global
 *   tournament carries `startTime`/`endTime`, but the usual answer from that
 *   endpoint is an empty list. `currentriverrace` has no timestamp at all --
 *   only `state`, `periodType` and `periodIndex` -- so the river race can be
 *   described but never counted down.
 *
 * Anything real but unclocked becomes a `TodayNote`: a sentence, never a
 * timer. Saying "no end time is published" is the honest answer; inventing one
 * from the period index would not be.
 */

export type TodayKind = 'war' | 'cwl' | 'raid' | 'tournament';

export type TodayEvent = {
  id: string;
  game: Game;
  kind: TodayKind;
  /** "Clan War", "Clan War League". */
  title: string;
  /** The phase the clock belongs to: "Battle day", "Preparation", "Opens". */
  phase: string;
  /** Optional second line: "Round 3 of 7". */
  detail?: string;
  /** What the clock counts to. */
  target: Date;
  /** Whether `target` ends the thing or starts it. Changes the verb only. */
  ending: boolean;
  /** Where tapping the card goes. */
  route: RouteName;
};

/** Something real that has no timestamp, or a game with nothing scheduled. */
export type TodayNote = {
  id: string;
  game: Game;
  title: string;
  body: string;
  route?: RouteName;
};

export type TodayInput = {
  /** `clans/{tag}/currentwar`. */
  war?: ApiRecord;
  /** `clans/{tag}/currentwar/leaguegroup`. */
  leagueGroup?: ApiRecord;
  /**
   * League wars keyed by war tag. One war per round is enough -- all four
   * wars of a round share one state and one pair of timestamps.
   */
  leagueWars?: Map<string, ApiRecord>;
  /** `items` from `clans/{tag}/capitalraidseasons`. */
  raidSeasons?: ApiRecord[];
  /** `items` from `/v1/globaltournaments`, or the bare array. */
  tournaments?: ApiRecord[];
  /** `clans/{tag}/currentriverrace`. */
  riverRace?: ApiRecord;
  /** Whether a Clash of Clans account is saved and resolved. */
  hasCoc?: boolean;
  /** Whether a Clash Royale account is saved and resolved. */
  hasCr?: boolean;
};

/**
 * How far past a target may be and still count as live.
 *
 * The services' `state` lags the clock by a minute or two at every changeover,
 * so a war that is seconds from ending still reports `inWar` with an `endTime`
 * in the past. Dropping those would blink the card out early and put it back;
 * the view renders them as "any moment now". `WarClock` takes the same line.
 */
const GRACE_MS = 5 * 60_000;

/**
 * Rejects the epoch sentinel.
 *
 * Clash Royale reports `19691231T235959.000Z` -- epoch minus one second -- for
 * a clan that never finished, and `parseApiTime` turns that into a valid 1969
 * Date rather than undefined. Any real target is in this decade.
 */
const EARLIEST = Date.UTC(2020, 0, 1);

function usable(target: Date | undefined, now: Date): target is Date {
  if (!target) return false;
  const at = target.getTime();
  if (!Number.isFinite(at) || at < EARLIEST) return false;
  return at > now.getTime() - GRACE_MS;
}

/**
 * The Today board: every live countdown sorted soonest first, plus whatever
 * has to be stated rather than clocked.
 *
 * `now` is injected so the ordering and the grace window can be tested without
 * waiting for real time to pass.
 */
export function buildToday(
  input: TodayInput,
  now: Date = new Date(),
): { events: TodayEvent[]; notes: TodayNote[] } {
  const events: TodayEvent[] = [];
  const notes: TodayNote[] = [];

  cocWar(input, now, events);
  cocLeague(input, now, events);
  cocRaid(input, now, events);
  royale(input, now, events, notes);

  events.sort((a, b) => a.target.getTime() - b.target.getTime());
  return { events, notes };
}

/**
 * The regular clan war.
 *
 * Preparation counts to `startTime`, battle day to `endTime`. A finished or
 * absent war contributes nothing: a countdown to a past time is noise, and
 * `notInWar` is the normal state for most of the week.
 */
function cocWar(input: TodayInput, now: Date, out: TodayEvent[]): void {
  const war = input.war;
  const state = text(war?.['state']);
  if (!war || state === 'warEnded' || state === 'notInWar' || state === '—') return;

  const preparing = state === 'preparation';
  const target = parseApiTime(preparing ? war['startTime'] : war['endTime']);
  if (!usable(target, now)) return;

  out.push({
    id: 'coc-war',
    game: 'coc',
    kind: 'war',
    title: 'Clan War',
    phase: preparing ? 'Preparation' : 'Battle day',
    target,
    ending: !preparing,
    route: 'CocWar',
  });
}

/**
 * The Clan War League round being fought, or the one in preparation.
 *
 * `buildRounds` works on a sparse war map, which is the point: the caller
 * fetches one war per round rather than all 28, and a round's four wars agree
 * on state and timing by construction.
 */
function cocLeague(input: TodayInput, now: Date, out: TodayEvent[]): void {
  const group = input.leagueGroup;
  if (!group || text(group['state']) === 'notInWar') return;

  const rounds = buildRounds(group, input.leagueWars ?? new Map());
  if (!rounds.length) return;

  const index = currentRound(rounds);
  const round = rounds[index];
  if (!round || round.status === 'ended' || round.status === 'upcoming') return;

  // Any of the round's loaded wars will do -- they share their timestamps.
  const war = round.wars[0];
  if (!war) return;

  const preparing = round.status === 'preparation';
  const target = parseApiTime(preparing ? war['startTime'] : war['endTime']);
  if (!usable(target, now)) return;

  out.push({
    id: 'coc-cwl',
    game: 'coc',
    kind: 'cwl',
    title: 'Clan War League',
    phase: ROUND_LABELS[round.status],
    detail: `Round ${index + 1} of ${rounds.length}`,
    target,
    ending: !preparing,
    route: 'CocWar',
  });
}

/**
 * The capital raid weekend.
 *
 * `raidCountdown` already decides between "this one ends" and "the next one
 * opens", and it is the only place in the app allowed to compute a time the
 * API does not give: there is no "next start" field anywhere, so the weekly
 * Friday 07:00 UTC opening is derived. That is a published, fixed schedule
 * rather than a guess, which is why it survives the real-timestamps rule.
 */
function cocRaid(input: TodayInput, now: Date, out: TodayEvent[]): void {
  const seasons = input.raidSeasons ?? [];
  if (!seasons.length) return;

  const next = raidCountdown(seasons, now);
  if (!usable(next?.target, now)) return;

  const ending = next!.label.includes('ends');
  out.push({
    id: 'coc-raid',
    game: 'coc',
    kind: 'raid',
    title: 'Raid Weekend',
    phase: ending ? 'Underway' : 'Opens',
    target: next!.target,
    ending,
    route: 'CocClan',
  });
}

/**
 * Clash Royale: a tournament clock when one is running, a sentence otherwise.
 *
 * Both halves matter. The empty list is the *normal* answer from
 * `/v1/globaltournaments`, so a screen that only handled the live case would
 * show nothing for Royale on most days and look broken rather than quiet.
 */
function royale(
  input: TodayInput,
  now: Date,
  out: TodayEvent[],
  notes: TodayNote[],
): void {
  const live = liveTournament(input.tournaments ?? [], now);

  if (live) {
    const started = parseApiTime(live['startTime']);
    const ends = parseApiTime(live['endTime']);
    const running = !started || started.getTime() <= now.getTime();
    const target = running ? ends : started;

    if (usable(target, now)) {
      out.push({
        id: 'cr-tournament',
        game: 'cr',
        kind: 'tournament',
        title: cleanTitle(live['title']) || 'Global Tournament',
        phase: running ? 'Running' : 'Starts',
        target,
        ending: running,
        route: 'CrHome',
      });
      return;
    }
  }

  // Nothing to count down. Say what is true instead of leaving a gap.
  if (!input.hasCr) return;
  notes.push({
    id: 'cr-quiet',
    game: 'cr',
    title: 'Clash Royale',
    body: riverRaceSentence(input.riverRace),
    route: 'CrClan',
  });
}

/** The tournament that is running now, or the next one still to start. */
function liveTournament(list: ApiRecord[], now: Date): ApiRecord | undefined {
  const at = now.getTime();
  const dated = list
    .map((t) => ({ t, end: parseApiTime(t['endTime']) }))
    // A tournament that has already finished is history, not Today.
    .filter((x) => x.end && x.end.getTime() > at - GRACE_MS)
    .sort((a, b) => a.end!.getTime() - b.end!.getTime());
  return dated[0]?.t;
}

/** Titles arrive as `Event_SomeName`; the battle log's cleaner handles both. */
function cleanTitle(value: unknown): string {
  const raw = text(value);
  if (raw === '—') return '';
  return raw
    .replace(/^Event_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * What Royale has instead of a clock.
 *
 * Deliberately explicit that no end time exists. The river race genuinely runs
 * on a daily cycle, so the obvious move is to derive a countdown from
 * `periodIndex` -- but the service publishes no timestamp to anchor it, and a
 * clock that is quietly wrong is worse than a sentence that is right.
 */
function riverRaceSentence(race: ApiRecord | undefined): string {
  const base = 'No global tournament is running right now.';
  if (!race || text(race['state']) === '—') return base;
  return `${base} Your clan's river race is on ${periodLabel(race)}, which the game service publishes without an end time.`;
}

/** `items` wrapper or a bare array -- this endpoint is documented as both. */
export function tournamentItems(payload: unknown): ApiRecord[] {
  if (Array.isArray(payload)) return rows(payload);
  return rows((payload as { items?: unknown } | null)?.items);
}
