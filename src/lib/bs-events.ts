import { record, rows } from '@/api/game-api';
import { modeLabel, parseBattleTime } from './bs-battles';



export type BsEvent = {
  slotId: number;
  eventId?: number;

  mode: string;
  modeLabel: string;

  modeId?: number;
  mapName: string;

  modifiers: string[];
  start?: Date;
  end?: Date;
};

const int = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Parses the rotation.
 *
 * Accepts the bare array the service actually returns *and* an `{items}`
 * envelope, because every neighbouring endpoint uses the envelope and a
 * future alignment would otherwise empty this silently.
 */
export function normalizeEvents(body: unknown): BsEvent[] {
  const list = Array.isArray(body) ? body : rows(record(body)['items']);
  return rows(list)
    .map((entry) => {
      const event = record(entry['event']);
      return {
        slotId: int(entry['slotId']) ?? 0,
        eventId: int(event['id']),
        mode: typeof event['mode'] === 'string' ? event['mode'] : '',
        modeLabel: modeLabel(event['mode']),
        modeId: int(event['modeId']),
        mapName: typeof event['map'] === 'string' ? event['map'] : '',
        // Strings only: the published schema declares EventModifier as an
        // empty object, but the live response is `["fastBrawlers"]`.
        modifiers: Array.isArray(event['modifiers'])
          ? event['modifiers'].filter((m): m is string => typeof m === 'string')
          : [],
        // Same compact `20261104T080000.000Z` form as the battle log, which is
        // why the parser is shared rather than written twice.
        start: parseBattleTime(entry['startTime']),
        end: parseBattleTime(entry['endTime']),
      };
    })
    .sort((a, b) => (a.end?.getTime() ?? Infinity) - (b.end?.getTime() ?? Infinity));
}

/**
 * Slots running right now.
 *
 * A slot can be scheduled ahead of its start -- the capture has `startTime`s
 * in the future -- so "in the rotation" and "playable now" are different
 * questions and this answers the second.
 */
export function liveEvents(events: BsEvent[], now = new Date()): BsEvent[] {
  const t = now.getTime();
  return events.filter(
    (e) => (e.start?.getTime() ?? -Infinity) <= t && (e.end?.getTime() ?? -Infinity) > t,
  );
}


export function liveEventIds(events: BsEvent[], now = new Date()): Set<number> {
  return new Set(
    liveEvents(events, now)
      .map((e) => e.eventId)
      .filter((id): id is number => typeof id === 'number'),
  );
}

/**
 * Modifier names as a player would read them.
 *
 * Only `fastBrawlers` has been observed live, so this de-camel-cases rather
 * than mapping a list it cannot claim to know.
 */
export const modifierLabel = (modifier: string): string => modeLabel(modifier);
