import { record, rows, text } from '@/api/game-api';



export type Ladder = {

  id: string;
  name: string;

  seasons: string[];
};


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


export function seasonIds(seasons: unknown, now: Date = new Date()): string[] {
  const ids = rows(record(seasons)['items'])
    .map((s) => text(s['id']))
    .filter((id) => SEASON_ID.test(id));
  if (ids.length === 0) return derivedSeasons(now, 24);
  return [...new Set(ids)].sort((a, b) => b.localeCompare(a));
}
