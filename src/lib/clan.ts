import { record, rows, type ApiRecord } from '@/api/game-api';

/**
 * Shared maths and formatting for the clan detail sheet.
 *
 * Everything here is derived from a response the app already has -- nothing
 * estimates, and nothing needs a second request.
 */

/**
 * Supercell timestamps are `20251030T070000.000Z`, which `new Date()` rejects:
 * it is ISO 8601 basic format, and the Date constructor only handles the
 * extended form. Expanded to `2025-10-30T07:00:00.000Z` before parsing.
 *
 * Returns undefined rather than an Invalid Date, so callers can branch on a
 * missing timestamp without checking `isNaN(d.getTime())` everywhere.
 */
export function parseApiTime(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(value.trim());
  const iso = compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}${compact[7] ?? ''}Z`
    : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** 1293951 -> "1.3M". Used for the compact figures on the weekend chips. */
export function compactNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}K`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * 1293951 -> "1 293 951", matching the in-game loot readout.
 *
 * A thin space rather than a comma or a locale separator: the display font
 * renders it cleanly, and it stays unambiguous whichever locale the device is
 * set to.
 */
export function groupedNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Raid weekends run Friday 07:00 UTC to Monday 07:00 UTC, every week. */
const RAID_START_DAY = 5;
const RAID_START_HOUR = 7;

/**
 * When the next raid weekend opens.
 *
 * Prefers the API: if the newest season is still `ongoing` its `endTime` is
 * the live figure to count down to. Only when no season is running is the next
 * Friday 07:00 UTC computed, because the API has no "next start" field at all.
 */
export function raidCountdown(
  seasons: ApiRecord[],
  now: Date = new Date(),
): { target: Date; label: string } | undefined {
  const current = seasons.find((s) => s['state'] === 'ongoing');
  const end = parseApiTime(current?.['endTime']);
  if (current && end && end > now) return { target: end, label: 'Raid Weekend ends in' };

  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RAID_START_HOUR, 0, 0, 0),
  );
  // Advance to the coming Friday; if today *is* Friday but 07:00 has passed,
  // `days === 0` and the <= check pushes it a full week forward.
  const days = (RAID_START_DAY - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + days);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return { target: next, label: 'Next Raid Weekend in' };
}

/** "3d 10h 11m 14s", dropping leading units that are zero. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const total = Math.floor(ms / 1000);
  const parts = [
    ['d', Math.floor(total / 86400)],
    ['h', Math.floor(total / 3600) % 24],
    ['m', Math.floor(total / 60) % 60],
    ['s', total % 60],
  ] as const;
  const first = parts.findIndex(([, n]) => n > 0);
  return parts
    .slice(first === -1 ? parts.length - 1 : first)
    .map(([unit, n]) => `${n}${unit}`)
    .join(' ');
}

/** "2d ago", "3h ago" -- the relative stamp on a war log row. */
export function timeAgo(value: unknown, now: Date = new Date()): string {
  const date = parseApiTime(value);
  if (!date) return '—';
  const ms = now.getTime() - date.getTime();
  if (ms < 0) return 'just now';
  return `${formatDuration(ms).split(' ')[0]} ago`;
}

/** Short date range for a raid weekend: "Oct 30 – Nov 2". */
export function dateRange(start: unknown, end: unknown): string {
  const a = parseApiTime(start);
  const b = parseApiTime(end);
  if (!a) return '—';
  const fmt = (d: Date) =>
    `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
  return b ? `${fmt(a)} – ${fmt(b)}` : fmt(a);
}

/** Just the opening day, for the weekend chips: "Oct 30". */
export function shortDate(value: unknown): string {
  const d = parseApiTime(value);
  if (!d) return '—';
  return `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
}

/** Share of wars won, counting ties as played. Returns undefined with no wars. */
export function winRate(clan: ApiRecord): number | undefined {
  const wins = Number(clan['warWins']) || 0;
  const losses = Number(clan['warLosses']) || 0;
  const ties = Number(clan['warTies']) || 0;
  const total = wins + losses + ties;
  return total > 0 ? wins / total : undefined;
}

const ROLES: Record<string, string> = {
  leader: 'Leader',
  coLeader: 'Co-Leader',
  // The API still calls Elders "admin"; the game has not used that word in
  // years, so it is translated rather than shown raw.
  admin: 'Elder',
  member: 'Member',
};

export function roleLabel(role: unknown): string {
  return typeof role === 'string' ? (ROLES[role] ?? role) : '—';
}

/** Clan type chip: "inviteOnly" -> "Invite only". */
export function clanTypeLabel(type: unknown): string {
  if (type === 'inviteOnly') return 'Invite only';
  if (type === 'open') return 'Anyone can join';
  if (type === 'closed') return 'Closed';
  return '—';
}

const WAR_FREQUENCY: Record<string, string> = {
  always: 'Always',
  moreThanOncePerWeek: 'Twice a week',
  oncePerWeek: 'Once a week',
  lessThanOncePerWeek: 'Rarely',
  never: 'Never',
  any: 'Any time',
  unknown: 'Not set',
};

/** War frequency chip. The API returns camelCase keys, not display text. */
export function warFrequencyLabel(value: unknown): string {
  if (typeof value !== 'string') return '—';
  return WAR_FREQUENCY[value] ?? value;
}

export type MemberSort = 'rank' | 'donations' | 'townHall' | 'builder' | 'name';

export const MEMBER_SORTS: { id: MemberSort; label: string }[] = [
  { id: 'rank', label: 'Rank' },
  { id: 'donations', label: 'Donations' },
  { id: 'townHall', label: 'Town Hall' },
  { id: 'builder', label: 'Builder' },
  { id: 'name', label: 'Name' },
];

/**
 * Sorts the roster locally -- the whole memberList arrives with the clan, so
 * none of these orderings costs a request.
 */
export function sortMembers(members: ApiRecord[], sort: MemberSort): ApiRecord[] {
  const by = (pick: (m: ApiRecord) => number) => (a: ApiRecord, b: ApiRecord) => pick(b) - pick(a);
  const copy = [...members];
  switch (sort) {
    case 'donations':
      return copy.sort(by((m) => Number(m['donations']) || 0));
    case 'townHall':
      // Trophies break the tie, so a Town Hall band is itself ordered.
      return copy.sort(
        (a, b) =>
          (Number(b['townHallLevel']) || 0) - (Number(a['townHallLevel']) || 0) ||
          (Number(b['trophies']) || 0) - (Number(a['trophies']) || 0),
      );
    case 'builder':
      return copy.sort(by((m) => Number(m['builderBaseTrophies']) || 0));
    case 'name':
      return copy.sort((a, b) =>
        String(a['name'] ?? '').localeCompare(String(b['name'] ?? ''), undefined, {
          sensitivity: 'base',
        }),
      );
    default:
      return copy.sort((a, b) => (Number(a['clanRank']) || 0) - (Number(b['clanRank']) || 0));
  }
}

export function memberMatches(member: ApiRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${member['name'] ?? ''} ${member['tag'] ?? ''}`.toLowerCase().includes(q);
}

/** Totals for one raid weekend, all summed from the rows the API returned. */
export type RaidTotals = {
  loot: number;
  attacks: number;
  attackLimit: number;
  perAttack: number;
  medals: number;
  offense: number;
  defense: number;
  districts: number;
  raids: number;
};

export function raidTotals(season: ApiRecord): RaidTotals {
  const members = rows(season['members']);
  const loot = Number(season['capitalTotalLoot']) || 0;
  const attacks = Number(season['totalAttacks']) || 0;
  // Each raider gets attackLimit attacks plus a bonus one once the clan has
  // destroyed enough districts, so the denominator is per-member, not 6 x 50.
  const attackLimit = members.reduce(
    (n, m) => n + (Number(m['attackLimit']) || 0) + (Number(m['bonusAttackLimit']) || 0),
    0,
  );
  const offense = Number(season['offensiveReward']) || 0;
  const defense = Number(season['defensiveReward']) || 0;
  return {
    loot,
    attacks,
    attackLimit,
    perAttack: attacks > 0 ? loot / attacks : 0,
    medals: offense + defense,
    offense,
    defense,
    districts: Number(season['enemyDistrictsDestroyed']) || 0,
    raids: Number(season['raidsCompleted']) || 0,
  };
}

/**
 * One raided capital, from `attackLog` or `defenseLog`.
 *
 * Loot is summed from the districts rather than read off the entry: the entry
 * itself carries no total, only the per-district spoils.
 */
export function raidLogTotals(entry: ApiRecord) {
  const districts = rows(entry['districts']);
  const destroyed = Number(entry['districtsDestroyed']) || 0;
  const count = Number(entry['districtCount']) || districts.length;
  return {
    districts,
    loot: districts.reduce((n, d) => n + (Number(d['totalLooted']) || 0), 0),
    // Prefer the entry's own count; fall back to summing the districts for a
    // response that omits it.
    attacks:
      Number(entry['attackCount']) ||
      districts.reduce((n, d) => n + (Number(d['attackCount']) || 0), 0),
    destroyed,
    count,
    perfect: count > 0 && destroyed >= count,
  };
}

/**
 * Average attacks spent per capital raided.
 *
 * Computed from the log itself rather than from the season's `totalAttacks`,
 * which counts offence only -- reusing it under Defences would print a figure
 * for the wrong side.
 */
export function attacksPerCapital(log: ApiRecord[]): number | undefined {
  if (!log.length) return undefined;
  return log.reduce((n, entry) => n + raidLogTotals(entry).attacks, 0) / log.length;
}

/** The clan on the other end of a raid: defender on offence, attacker on defence. */
export function raidOpponent(entry: ApiRecord): ApiRecord {
  const defender = record(entry['defender']);
  return defender['name'] !== undefined ? defender : record(entry['attacker']);
}

/** Averages and best across every weekend loaded so far. */
export function raidSummary(seasons: ApiRecord[]) {
  const totals = seasons.map(raidTotals);
  if (!totals.length) return undefined;
  const sum = (pick: (t: RaidTotals) => number) => totals.reduce((n, t) => n + pick(t), 0);
  return {
    avgLoot: sum((t) => t.loot) / totals.length,
    bestLoot: Math.max(...totals.map((t) => t.loot)),
    avgMedals: sum((t) => t.medals) / totals.length,
  };
}

/** The `after` cursor for the next page, when the API offered one. */
export function nextCursor(payload: unknown): string | undefined {
  const after = record(record(record(payload)['paging'])['cursors'])['after'];
  return typeof after === 'string' && after ? after : undefined;
}
