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

/**
 * Season ids for the Path of Legend picker.
 *
 * `/v1/locations/global/seasons` returns 145 entries with duplicates -- 129
 * unique. The **current** season 404s on the rankings endpoint until it
 * closes, so the newest returned id is the newest *finished* one and is the
 * right default.
 */
export function seasonIds(seasons: unknown): string[] {
  const ids = rows(record(seasons)['items'])
    .map((s) => text(s['id']))
    .filter((id) => id !== '—');
  return [...new Set(ids)].sort((a, b) => b.localeCompare(a));
}
