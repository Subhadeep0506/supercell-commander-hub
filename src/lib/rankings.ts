import { record, rows, text, type ApiRecord } from '@/api/game-api';

export type Board = 'players' | 'clans';
export type Mode = 'home' | 'builder' | 'capital';

/** Capital is a clan ladder only -- the API has no player equivalent. */
export const MODES: Record<Board, { id: Mode; label: string }[]> = {
  players: [
    { id: 'home', label: 'Home' },
    { id: 'builder', label: 'Builder' },
  ],
  clans: [
    { id: 'home', label: 'Home' },
    { id: 'builder', label: 'Builder' },
    { id: 'capital', label: 'Capital' },
  ],
};

/**
 * Country code to flag emoji.
 *
 * "US" maps to the two regional-indicator characters at U+1F1E6 + offset,
 * which the platform composes into a flag. Android renders these; Windows
 * shows the bare letters instead, so browser testing looks different from the
 * phone. No asset or network request either way.
 */
export function flagEmoji(countryCode: unknown): string | undefined {
  if (typeof countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(countryCode)) return undefined;
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export type RankMove = { direction: 'up' | 'down' | 'same'; places: number };

/**
 * Movement since the previous ranking period.
 *
 * `previousRank` is supplied by the API -- verified against Supercell's live
 * ranking response -- so this is real data rather than a diff against a
 * locally cached snapshot. It is absent on a first-time entry, which reads as
 * "new" rather than "unchanged".
 */
export function rankMove(entry: ApiRecord): RankMove | undefined {
  const rank = Number(entry['rank']);
  const previous = Number(entry['previousRank']);
  if (!Number.isFinite(rank) || !Number.isFinite(previous) || previous <= 0) return undefined;
  const places = previous - rank;
  if (places === 0) return { direction: 'same', places: 0 };
  return { direction: places > 0 ? 'up' : 'down', places: Math.abs(places) };
}

/** The score column differs per ladder, and so does the API field carrying it. */
export function rankScore(entry: ApiRecord, board: Board, mode: Mode): string {
  if (board === 'clans') {
    if (mode === 'capital') return text(entry['clanCapitalPoints'] ?? entry['clanPoints']);
    if (mode === 'builder') return text(entry['clanBuilderBasePoints'] ?? entry['clanVersusPoints']);
    return text(entry['clanPoints'] ?? entry['clanScore']);
  }
  if (mode === 'builder') return text(entry['builderBaseTrophies'] ?? entry['versusTrophies']);
  return text(entry['trophies']);
}

/** Secondary line under the name: clan for players, location/size for clans. */
export function rankSubtitle(entry: ApiRecord, board: Board): string {
  if (board === 'clans') {
    const place = text(record(entry['location'])['name'] ?? '');
    const members = text(entry['members']);
    return [place === '—' ? '' : place, members === '—' ? '' : `${members}/50`]
      .filter(Boolean)
      .join(' · ');
  }
  return text(record(entry['clan'])['name'] ?? 'No clan');
}

/** Badge artwork URL, across the shapes the ranking endpoints return. */
export function badgeUri(entry: ApiRecord, board: Board): string | undefined {
  const urls = record(board === 'clans' ? entry['badgeUrls'] : record(entry['clan'])['badgeUrls']);
  const candidate = urls['medium'] ?? urls['small'] ?? urls['large'];
  return typeof candidate === 'string' ? candidate : undefined;
}

/** League icon for a player row, when the ladder supplies one. */
export function leagueUri(entry: ApiRecord): string | undefined {
  const urls = record(record(entry['league'])['iconUrls']);
  const candidate = urls['medium'] ?? urls['small'] ?? urls['tiny'];
  return typeof candidate === 'string' ? candidate : undefined;
}

export function searchable(entry: ApiRecord, board: Board): string {
  return `${text(entry['name'])} ${text(entry['tag'])} ${rankSubtitle(entry, board)}`.toLowerCase();
}

/** Country locations only; the API also returns regions like "Europe". */
export function countryLocations(payload: unknown): ApiRecord[] {
  return rows(record(payload)['items']).filter((l) => l['isCountry'] === true);
}
