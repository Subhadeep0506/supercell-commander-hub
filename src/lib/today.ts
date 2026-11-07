import { rows, text, type ApiRecord, type Game } from '@/api/game-api';
import { parseApiTime, raidCountdown } from '@/lib/clan';
import { buildRounds, currentRound, ROUND_LABELS } from '@/lib/cwl';
import { periodLabel } from '@/lib/river-race';
import { modifierLabel, type BsEvent } from '@/lib/bs-events';
import type { RouteName } from '@/navigation/routes';



export type TodayKind = 'war' | 'cwl' | 'raid' | 'tournament' | 'rotation';

export type TodayEvent = {
  id: string;
  game: Game;
  kind: TodayKind;

  title: string;

  phase: string;

  detail?: string;

  target: Date;

  ending: boolean;

  route: RouteName;
};


export type TodayNote = {
  id: string;
  game: Game;
  title: string;
  body: string;
  route?: RouteName;
};


export type LiveEvent = {
  id: string;
  game: Game;
  title: string;
  body?: string;
};

export type TodayInput = {

  war?: ApiRecord;

  leagueGroup?: ApiRecord;
  /**
   * League wars keyed by war tag. One war per round is enough -- all four
   * wars of a round share one state and one pair of timestamps.
   */
  leagueWars?: Map<string, ApiRecord>;

  raidSeasons?: ApiRecord[];

  tournaments?: ApiRecord[];

  riverRace?: ApiRecord;

  crEvents?: ApiRecord[];
  /**
   * `/v1/events/rotation` — Brawl Stars' event schedule, already normalised.
   *
   * The counterpart to `crEvents` and the opposite case: **every slot here
   * carries a real `startTime` and `endTime`**, so unlike Royale's events
   * these belong in the timeline rather than in the untimed list.
   */
  bsEvents?: BsEvent[];

  hasCoc?: boolean;

  hasCr?: boolean;
};


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
): { events: TodayEvent[]; notes: TodayNote[]; live: LiveEvent[] } {
  const events: TodayEvent[] = [];
  const notes: TodayNote[] = [];

  // Built first, because the quiet Royale note reads differently depending on
  // whether anything is visibly running above it -- and the list is filtered,
  // so the raw response count is not the same number.
  const live = liveEvents(input);

  cocWar(input, now, events);
  cocLeague(input, now, events);
  cocRaid(input, now, events);
  royale(input, now, events, notes, live.length);
  brawl(input, now, events);

  events.sort((a, b) => a.target.getTime() - b.target.getTime());
  return { events, notes, live };
}


const BS_SLOTS = 4;

function brawl(input: TodayInput, now: Date, out: TodayEvent[]): void {
  const at = now.getTime();
  const running = (input.bsEvents ?? [])
    .filter(
      (event) =>
        event.end !== undefined &&
        (event.start?.getTime() ?? -Infinity) <= at &&
        usable(event.end, now),
    )
    // normalizeEvents already sorts by end time, so this is the soonest four.
    .slice(0, BS_SLOTS);

  for (const event of running) {
    out.push({
      id: `bs-slot-${event.slotId}`,
      game: 'bs',
      kind: 'rotation',
      title: event.modeLabel,
      phase: 'In rotation',
      detail: [event.mapName, ...event.modifiers.map(modifierLabel)].filter(Boolean).join(' · '),
      target: event.end!,
      ending: true,
      route: 'BsStats',
    });
  }
}

/**
 * What is playable right now, from Clash Royale's untimed event list.
 *
 * Kept out of the timeline deliberately: these have no end time, so putting
 * them among the countdowns would need a fake target or a blank clock, and
 * both would misrepresent what the service actually said.
 */
function liveEvents(input: TodayInput): LiveEvent[] {
  const out: LiveEvent[] = [];
  const seen = new Set<string>();

  for (const [i, event] of (input.crEvents ?? []).entries()) {
    const title = localized(event['title']);
    if (!title) continue;
    // `description` is null on several live rows, and a card that is a bare
    // title over empty space says less than it takes up -- these have no
    // clock either, so the body is the only thing on them. Dropped rather
    // than rendered hollow.
    const body = localized(event['description']);
    if (!body) continue;
    // `eventTag` is the stable id, but fall back to the index rather than
    // dropping a row that happens to arrive without one.
    const tag = text(event['eventTag']);
    const id = `cr-event-${tag === '—' ? i : tag}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, game: 'cr', title, body });
  }
  return out;
}

/**
 * `title` and `description` are `JsonLocalizedName`: documented as string,
 * object *or* null, and observed live as a plain string with `description`
 * sometimes null. Both forms are handled rather than assuming the one seen.
 */
function localized(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (value && typeof value === 'object') {
    const named = value as Record<string, unknown>;
    for (const key of ['en', 'EN', 'name', 'value']) {
      const found = named[key];
      if (typeof found === 'string' && found.trim()) return found.trim();
    }
  }
  return undefined;
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

  liveCount: number,
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
    body: riverRaceSentence(input.riverRace, liveCount > 0),
    route: 'CrClan',
  });
}


function liveTournament(list: ApiRecord[], now: Date): ApiRecord | undefined {
  const at = now.getTime();
  const dated = list
    .map((t) => ({ t, end: parseApiTime(t['endTime']) }))
    // A tournament that has already finished is history, not Today.
    .filter((x) => x.end && x.end.getTime() > at - GRACE_MS)
    .sort((a, b) => a.end!.getTime() - b.end!.getTime());
  return dated[0]?.t;
}


function cleanTitle(value: unknown): string {
  const raw = text(value);
  if (raw === '—') return '';
  return raw
    .replace(/^Event_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}


function riverRaceSentence(race: ApiRecord | undefined, hasEvents: boolean): string {
  // With events listed above, "no global tournament" alone would read as
  // "nothing is happening", which is the opposite of what the screen shows.
  const base = hasEvents
    ? 'The events above run without a published end time, so none of them can be counted down. No global tournament is running either.'
    : 'No global tournament is running right now.';
  if (!race || text(race['state']) === '—') return base;
  return `${base} Your clan's river race is on ${periodLabel(race)}, which the game service also publishes without an end time.`;
}


export function tournamentItems(payload: unknown): ApiRecord[] {
  if (Array.isArray(payload)) return rows(payload);
  return rows((payload as { items?: unknown } | null)?.items);
}
