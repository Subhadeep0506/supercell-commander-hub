import { record, rows, text } from '@/api/game-api';

/**
 * `/v1/leaderboards` is messier than its count suggests.
 *
 * It returns 34 entries, but they are not 34 ladders: six distinct names
 * repeated across seasons (Merge Tactics alone appears seven times), plus
 * nineteen with `name: null` that still return perfectly good rankings.
 *
 * Rendering all 34 flat puts six near-identical "Merge Tactics" rows next to
 * each other; dropping the nameless ones silently discards nineteen working
 * ladders. So: group by name, newest season first, and keep the rest together
 * under one heading.
 */

export type Ladder = {
  /** The id to request rankings for -- the newest season of this ladder. */
  id: string;
  name: string;
  /** Every id sharing this name, newest first. One entry means one season. */
  seasons: string[];
};

/** Ids are numeric strings; newest sorts highest. */
function newestFirst(ids: string[]): string[] {
  return [...ids].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
}

export function groupLadders(leaderboards: unknown): {
  named: Ladder[];
  unnamed: Ladder[];
} {
  const items = rows(record(leaderboards)['items']);
  const byName = new Map<string, string[]>();
  const nameless: string[] = [];

  for (const item of items) {
    const id = text(item['id']);
    if (id === '—') continue;
    const name = typeof item['name'] === 'string' && item['name'].length ? item['name'] : null;
    if (!name) {
      nameless.push(id);
      continue;
    }
    byName.set(name, [...(byName.get(name) ?? []), id]);
  }

  const named = [...byName.entries()]
    .map(([name, ids]) => {
      const seasons = newestFirst(ids);
      return { id: seasons[0]!, name, seasons };
    })
    // Newest ladder first, so a freshly added mode leads the list.
    .sort((a, b) => Number(b.id) - Number(a.id));

  const unnamed = newestFirst(nameless).map((id) => ({
    // The API gives no name for these, so the id is the only honest label.
    id,
    name: `Ladder ${id}`,
    seasons: [id],
  }));

  return { named, unnamed };
}

/** A season id is a calendar month: "2026-10". */
const SEASON_ID = /^\d{4}-\d{2}$/;

/**
 * The last `count` finished months, newest first.
 *
 * The *current* month is excluded on purpose: the rankings endpoint 404s for a
 * season until it closes, which is the same rule that made the newest returned
 * id the right default back when the service returned ids at all.
 */
function derivedSeasons(now: Date, count: number): string[] {
  const out: string[] = [];
  for (let back = 1; back <= count; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Season ids for the Path of Legend picker.
 *
 * `/v1/locations/global/seasons` returns 145 entries with duplicates -- 129
 * unique -- and **intermittently returns all 145 with `id: null`**. Caught
 * live on 2026-11-07: every id was null for several minutes, and a re-capture
 * twenty minutes later had them all back. Not a shape change, a flake -- but
 * while it lasts the picker has nothing to offer and the Path of Legend tab is
 * dead, which is how it would be experienced on a phone.
 *
 * The *rankings* endpoint is unaffected throughout -- `/pathoflegend/2026-10/
 * rankings/players` answered 200 with real rows during the outage -- so when
 * the list comes back empty the months are derived from the clock instead.
 * Season ids are plain calendar months, so that is a reconstruction rather
 * than a guess, and the worst case is a 404 on a month that does not exist,
 * which the caller already has to handle.
 */
export function seasonIds(seasons: unknown, now: Date = new Date()): string[] {
  const ids = rows(record(seasons)['items'])
    .map((s) => text(s['id']))
    .filter((id) => SEASON_ID.test(id));
  if (ids.length === 0) return derivedSeasons(now, 24);
  return [...new Set(ids)].sort((a, b) => b.localeCompare(a));
}
