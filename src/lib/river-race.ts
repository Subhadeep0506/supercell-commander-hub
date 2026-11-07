import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { parseApiDate } from './royale-battles';



/**
 * `training` is the first half of the week, `warDay` the second.
 *
 * Only `training` has been observed live on the calibration clan. The other
 * values are handled by label rather than by behaviour, so an unexpected one
 * renders its own name instead of falling into the wrong branch.
 */
export function isWarDay(race: ApiRecord): boolean {
  return text(race['periodType']).toLowerCase().includes('war');
}

export function isColosseum(race: ApiRecord): boolean {
  return text(race['periodType']).toLowerCase().includes('colosseum');
}

export function periodLabel(race: ApiRecord): string {
  const type = text(race['periodType']);
  if (type === '—') return 'River Race';
  if (isColosseum(race)) return 'Colosseum';
  if (isWarDay(race)) return 'War Day';
  if (type.toLowerCase() === 'training') return 'Training';
  // Something new. Show it rather than mislabelling it.
  return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export type Participant = {
  tag: string;
  name: string;
  fame: number;
  repairPoints: number;
  boatAttacks: number;
  decksUsed: number;
  decksUsedToday: number;
};

function participant(row: ApiRecord): Participant {
  const num = (key: string) => (typeof row[key] === 'number' ? (row[key] as number) : 0);
  return {
    tag: text(row['tag']),
    name: text(row['name']),
    fame: num('fame'),
    repairPoints: num('repairPoints'),
    boatAttacks: num('boatAttacks'),
    decksUsed: num('decksUsed'),
    decksUsedToday: num('decksUsedToday'),
  };
}

export type RaceClan = {
  tag: string;
  name: string;
  badgeId: number | null;
  fame: number;
  repairPoints: number;
  periodPoints: number;
  clanScore: number;

  finishTime: Date | null;
  participants: Participant[];

  active: number;
  decksUsed: number;
  decksUsedToday: number;
  boatAttacks: number;
  isMine: boolean;
  rank: number;
};

function raceClan(row: ApiRecord, myTag: string, rank: number): RaceClan {
  const num = (key: string) => (typeof row[key] === 'number' ? (row[key] as number) : 0);
  const participants = rows(row['participants']).map(participant);
  return {
    tag: text(row['tag']),
    name: text(row['name']),
    badgeId: typeof row['badgeId'] === 'number' ? row['badgeId'] : null,
    fame: num('fame'),
    repairPoints: num('repairPoints'),
    periodPoints: num('periodPoints'),
    clanScore: num('clanScore'),
    finishTime: parseApiDate(row['finishTime']),
    participants,
    active: participants.filter((p) => p.decksUsed > 0).length,
    decksUsed: participants.reduce((sum, p) => sum + p.decksUsed, 0),
    decksUsedToday: participants.reduce((sum, p) => sum + p.decksUsedToday, 0),
    boatAttacks: participants.reduce((sum, p) => sum + p.boatAttacks, 0),
    isMine: text(row['tag']).toUpperCase() === myTag.toUpperCase(),
    rank,
  };
}


export function raceStandings(race: unknown, myTag = ''): RaceClan[] {
  const r = record(race);
  return rows(r['clans'])
    .slice()
    .sort((a, b) => {
      const fame = (x: ApiRecord) => (typeof x['fame'] === 'number' ? x['fame'] : 0);
      const score = (x: ApiRecord) => (typeof x['clanScore'] === 'number' ? x['clanScore'] : 0);
      return fame(b) - fame(a) || score(b) - score(a) || text(a['tag']).localeCompare(text(b['tag']));
    })
    .map((row, i) => raceClan(row, myTag, i + 1));
}


export function myRaceClan(race: unknown, myTag = ''): RaceClan | null {
  const r = record(race);
  const own = record(r['clan']);
  if (!own['tag']) return null;
  const ranked = raceStandings(race, myTag || text(own['tag']));
  const match = ranked.find((c) => c.tag === text(own['tag']));
  return match ?? raceClan(own, myTag || text(own['tag']), 0);
}

export type ParticipantSort = 'fame' | 'decks' | 'repair' | 'boat' | 'name';

export function sortParticipants(list: Participant[], by: ParticipantSort): Participant[] {
  return [...list].sort((a, b) => {
    switch (by) {
      case 'decks':
        return b.decksUsed - a.decksUsed || a.name.localeCompare(b.name);
      case 'repair':
        return b.repairPoints - a.repairPoints || a.name.localeCompare(b.name);
      case 'boat':
        return b.boatAttacks - a.boatAttacks || a.name.localeCompare(b.name);
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return b.fame - a.fame || a.name.localeCompare(b.name);
    }
  });
}

export type LogSeason = {
  seasonId: number | null;
  sectionIndex: number | null;
  created: Date | null;
  standings: { rank: number; trophyChange: number; clan: RaceClan }[];

  mine: { rank: number; trophyChange: number; clan: RaceClan } | null;
};

/**
 * `/v1/clans/{tag}/riverracelog`, normalised.
 *
 * Cursor-paged exactly like CoC's capitalraidseasons: `paging.cursors.after`
 * is an opaque base64 string that must be passed back untouched.
 */
export function logSeasons(log: unknown, myTag = ''): LogSeason[] {
  return rows(record(log)['items']).map((season) => {
    const standings = rows(season['standings']).map((entry) => {
      const rank = typeof entry['rank'] === 'number' ? entry['rank'] : 0;
      const trophyChange = typeof entry['trophyChange'] === 'number' ? entry['trophyChange'] : 0;
      return { rank, trophyChange, clan: raceClan(record(entry['clan']), myTag, rank) };
    });
    return {
      seasonId: typeof season['seasonId'] === 'number' ? season['seasonId'] : null,
      sectionIndex: typeof season['sectionIndex'] === 'number' ? season['sectionIndex'] : null,
      created: parseApiDate(season['createdDate']),
      standings: standings.sort((a, b) => a.rank - b.rank),
      mine: standings.find((s) => s.clan.isMine) ?? null,
    };
  });
}


export function logCursor(log: unknown): string | null {
  const after = record(record(record(log)['paging'])['cursors'])['after'];
  return typeof after === 'string' && after.length ? after : null;
}

export type PeriodDay = {
  periodIndex: number | null;
  rows: {
    clanTag: string;
    pointsEarned: number;
    progressStartOfDay: number;
    progressEndOfDay: number;
    endOfDayRank: number | null;
    progressEarned: number;
    numOfDefensesRemaining: number | null;
  }[];
};


export function periodDays(race: unknown): PeriodDay[] {
  return rows(record(race)['periodLogs']).map((day) => ({
    periodIndex: typeof day['periodIndex'] === 'number' ? day['periodIndex'] : null,
    rows: rows(day['items']).map((row) => {
      const num = (key: string) => (typeof row[key] === 'number' ? (row[key] as number) : 0);
      const maybe = (key: string) => (typeof row[key] === 'number' ? (row[key] as number) : null);
      return {
        clanTag: text(row['clanTag']),
        pointsEarned: num('pointsEarned'),
        progressStartOfDay: num('progressStartOfDay'),
        progressEndOfDay: num('progressEndOfDay'),
        endOfDayRank: maybe('endOfDayRank'),
        progressEarned: num('progressEarned'),
        numOfDefensesRemaining: maybe('numOfDefensesRemaining'),
      };
    }),
  }));
}

/**
 * Decks used against decks available today.
 *
 * Four per player per war day is the game's rule, and it is not in any
 * response -- the API reports only what was used. Stated here once so the
 * figure has a single home rather than being inlined in a progress bar.
 */
export const DECKS_PER_DAY = 4;

export function decksRemaining(clan: RaceClan): number {
  return Math.max(0, clan.participants.length * DECKS_PER_DAY - clan.decksUsedToday);
}
