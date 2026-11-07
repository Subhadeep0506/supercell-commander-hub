import { record, rows, text, type ApiRecord } from '@/api/game-api';

export type Board = 'players' | 'clans';
export type Mode = 'home' | 'builder' | 'capital';


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


export function rankMove(entry: ApiRecord): RankMove | undefined {
  const rank = Number(entry['rank']);
  const previous = Number(entry['previousRank']);
  if (!Number.isFinite(rank) || !Number.isFinite(previous) || previous <= 0) return undefined;
  const places = previous - rank;
  if (places === 0) return { direction: 'same', places: 0 };
  return { direction: places > 0 ? 'up' : 'down', places: Math.abs(places) };
}


export function rankScore(entry: ApiRecord, board: Board, mode: Mode): string {
  if (board === 'clans') {
    if (mode === 'capital') return text(entry['clanCapitalPoints'] ?? entry['clanPoints']);
    if (mode === 'builder') return text(entry['clanBuilderBasePoints'] ?? entry['clanVersusPoints']);
    return text(entry['clanPoints'] ?? entry['clanScore']);
  }
  if (mode === 'builder') return text(entry['builderBaseTrophies'] ?? entry['versusTrophies']);
  return text(entry['trophies']);
}


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

/**
 * The same subtitle facts, kept apart so each can carry its own icon.
 *
 * `rankSubtitle` stays as the joined string because `searchable` matches
 * against it -- splitting that would quietly change what a search finds.
 */
export type SubtitleParts = {
  place?: string;
  countryCode?: string;
  members?: string;
  clanName?: string;
};

export function rankSubtitleParts(entry: ApiRecord, board: Board): SubtitleParts {
  if (board === 'clans') {
    const location = record(entry['location']);
    const place = text(location['name'] ?? '');
    const members = text(entry['members']);
    return {
      place: place === '—' ? undefined : place,
      countryCode: typeof location['countryCode'] === 'string' ? location['countryCode'] : undefined,
      members: members === '—' ? undefined : `${members}/50`,
    };
  }
  const name = text(record(entry['clan'])['name'] ?? 'No clan');
  return { clanName: name };
}


export function badgeUri(entry: ApiRecord, board: Board): string | undefined {
  const urls = record(board === 'clans' ? entry['badgeUrls'] : record(entry['clan'])['badgeUrls']);
  const candidate = urls['medium'] ?? urls['small'] ?? urls['large'];
  return typeof candidate === 'string' ? candidate : undefined;
}

/*
 * There was a `leagueUri` here, reading `league.iconUrls` for a player row.
 *
 * It is gone with the League Tier change, for two reasons. The field it read
 * is now `{ id: 29000000, name: "Unranked" }` for every player alive, so it
 * returned the same grey badge for the whole ladder; and its replacement,
 * `leagueTier.iconUrls`, is deliberately not used -- see the note on `Badge`
 * in CocLeaderboard for why one bundled source beats a better picture here.
 */

export function searchable(entry: ApiRecord, board: Board): string {
  return `${text(entry['name'])} ${text(entry['tag'])} ${rankSubtitle(entry, board)}`.toLowerCase();
}


export function countryLocations(payload: unknown): ApiRecord[] {
  return rows(record(payload)['items']).filter((l) => l['isCountry'] === true);
}
