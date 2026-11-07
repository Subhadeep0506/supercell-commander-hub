import { record, rows, text, type ApiRecord } from '@/api/game-api';




const PLACEHOLDER = '#0';

export type RoundStatus = 'ended' | 'inWar' | 'preparation' | 'upcoming';

export type SeasonRound = {

  index: number;

  warTags: string[];
  status: RoundStatus;

  wars: ApiRecord[];
};

/**
 * The war tags of one round, with the placeholders removed.
 *
 * A future round is published as `["#0","#0","#0","#0"]`. Requesting `#0` is
 * rejected by our own tag validation before it reaches the network, so the
 * placeholder is the signal for "upcoming" rather than something to fetch.
 */
export function realWarTags(round: ApiRecord): string[] {
  const tags = round['warTags'];
  if (!Array.isArray(tags)) return [];
  return tags.filter(
    (tag): tag is string => typeof tag === 'string' && tag !== PLACEHOLDER && tag.length > 1,
  );
}


export function allWarTags(group: ApiRecord): string[] {
  return rows(group['rounds']).flatMap(realWarTags);
}


export function sampleWarTags(group: ApiRecord): string[] {
  return rows(group['rounds'])
    .map((round) => realWarTags(round)[0])
    .filter((tag): tag is string => Boolean(tag));
}


export function buildRounds(group: ApiRecord, warsByTag: Map<string, ApiRecord>): SeasonRound[] {
  return rows(group['rounds']).map((round, index) => {
    const warTags = realWarTags(round);
    const wars = warTags.map((tag) => warsByTag.get(tag)).filter((w): w is ApiRecord => !!w);
    return { index, warTags, wars, status: statusOf(group, warTags, wars) };
  });
}

function statusOf(group: ApiRecord, warTags: string[], wars: ApiRecord[]): RoundStatus {
  if (!warTags.length) return 'upcoming';
  if (wars.some((w) => w['state'] === 'inWar')) return 'inWar';
  if (wars.some((w) => w['state'] === 'preparation')) return 'preparation';
  if (wars.length && wars.every((w) => w['state'] === 'warEnded')) return 'ended';
  return group['state'] === 'ended' ? 'ended' : 'preparation';
}

/**
 * The round to headline as "Round N of 7": the one being fought, else the one
 * in preparation, else the last that happened.
 */
export function currentRound(rounds: SeasonRound[]): number {
  const live = rounds.find((r) => r.status === 'inWar') ?? rounds.find((r) => r.status === 'preparation');
  if (live) return live.index;
  const played = rounds.filter((r) => r.status !== 'upcoming');
  return played.length ? played[played.length - 1]!.index : 0;
}

export const ROUND_LABELS: Record<RoundStatus, string> = {
  ended: 'Ended',
  inWar: 'Battle day',
  preparation: 'Preparation',
  upcoming: 'Upcoming',
};

/* -------------------------------------------------------------------------- */
/* Town Halls                                                                  */
/* -------------------------------------------------------------------------- */


export function memberTh(member: ApiRecord): number {
  const value = member['townhallLevel'] ?? member['townHallLevel'];
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}


export function thHistogram(members: ApiRecord[]): { th: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const member of members) {
    const th = memberTh(member);
    if (th) counts.set(th, (counts.get(th) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([th, count]) => ({ th, count }))
    .sort((a, b) => b.th - a.th);
}


export function averageTh(members: ApiRecord[]): number {
  const levels = members.map(memberTh).filter((n) => n > 0);
  if (!levels.length) return 0;
  return levels.reduce((sum, n) => sum + n, 0) / levels.length;
}

/**
 * Colour per Town Hall level, high to low.
 *
 * A monotonic ramp rather than a categorical palette: these drive a stacked
 * distribution bar, and a ramp makes "this clan is mostly high Town Halls"
 * readable without consulting the legend.
 */
export const TH_COLOURS: Record<number, string> = {
  18: '#4C7EF3',
  17: '#3E9BE9',
  16: '#2FB8D9',
  15: '#27C7B8',
  14: '#2ECC8F',
  13: '#5BD16A',
  12: '#8FD250',
  11: '#BFD049',
  10: '#E8C84A',
  9: '#F0A93F',
  8: '#EC8B3C',
  7: '#E36D42',
  6: '#D8554F',
  5: '#C4475F',
  4: '#A8456E',
  3: '#8A4578',
  2: '#6B4474',
  1: '#4F4160',
};

export function thColour(level: number): string {
  return TH_COLOURS[level] ?? '#4F4160';
}


export function thRange(group: ApiRecord): { high: number; low: number } {
  const levels = rows(group['clans'])
    .flatMap((clan) => rows(clan['members']))
    .map(memberTh)
    .filter((n) => n > 0);
  if (!levels.length) return { high: 18, low: 1 };
  return { high: Math.max(...levels), low: Math.min(...levels) };
}

/* -------------------------------------------------------------------------- */
/* Wars                                                                        */
/* -------------------------------------------------------------------------- */


export function warSides(war: ApiRecord, clanTag?: string) {
  const clan = record(war['clan']);
  const opponent = record(war['opponent']);
  const mine = clanTag && text(opponent['tag']).toUpperCase() === clanTag.toUpperCase();
  return mine ? { us: opponent, them: clan } : { us: clan, them: opponent };
}

export type WarOutcome = 'win' | 'lose' | 'tie';


export function warOutcome(us: ApiRecord, them: ApiRecord): WarOutcome {
  const stars = Number(us['stars']) || 0;
  const theirStars = Number(them['stars']) || 0;
  if (stars !== theirStars) return stars > theirStars ? 'win' : 'lose';
  const pct = Number(us['destructionPercentage']) || 0;
  const theirPct = Number(them['destructionPercentage']) || 0;
  if (pct !== theirPct) return pct > theirPct ? 'win' : 'lose';
  return 'tie';
}

/**
 * Map position for each member tag on a roster.
 *
 * An attack names its defender by tag; the roster it belongs to is the only
 * thing that can turn that into the "#7" a reader recognises.
 */
export function positionIndex(side: ApiRecord): Map<string, string> {
  const index = new Map<string, string>();
  for (const member of rows(side['members'])) {
    index.set(text(member['tag']).toUpperCase(), text(member['mapPosition']));
  }
  return index;
}

/**
 * Attacks per member for a war.
 *
 * Regular wars send 2 and CWL wars send 1, but the field is absent on some
 * responses -- so the fallback is derived from the roster rather than assumed.
 */
export function attacksPerMember(war: ApiRecord): number {
  const declared = Number(war['attacksPerMember']);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const most = rows(record(war['clan'])['members']).reduce(
    (max, m) => Math.max(max, rows(m['attacks']).length),
    0,
  );
  return Math.max(1, most);
}

/* -------------------------------------------------------------------------- */
/* Standings                                                                   */
/* -------------------------------------------------------------------------- */


export const WIN_BONUS_STARS = 10;

export type Standing = {
  tag: string;
  clan: ApiRecord;
  stars: number;
  destruction: number;
  attacks: number;
  wins: number;
  warsCounted: number;
};


export function standings(group: ApiRecord, warsByTag: Map<string, ApiRecord>): Standing[] {
  const table = new Map<string, Standing>();

  // Seeded from the group so every clan appears, including one that has not
  // played a counted war yet.
  for (const clan of rows(group['clans'])) {
    const tag = text(clan['tag']).toUpperCase();
    if (tag === '—') continue;
    table.set(tag, { tag, clan, stars: 0, destruction: 0, attacks: 0, wins: 0, warsCounted: 0 });
  }

  for (const war of warsByTag.values()) {
    const state = war['state'];
    if (state !== 'inWar' && state !== 'warEnded') continue;
    const ended = state === 'warEnded';
    const clan = record(war['clan']);
    const opponent = record(war['opponent']);

    for (const [side, other] of [
      [clan, opponent],
      [opponent, clan],
    ] as const) {
      const tag = text(side['tag']).toUpperCase();
      let entry = table.get(tag);
      if (!entry) {
        // A clan in a war but not in `group.clans` should not exist; counting
        // it anyway keeps the table honest rather than dropping its stars.
        entry = { tag, clan: side, stars: 0, destruction: 0, attacks: 0, wins: 0, warsCounted: 0 };
        table.set(tag, entry);
      }

      const won = ended && warOutcome(side, other) === 'win';
      entry.stars += (Number(side['stars']) || 0) + (won ? WIN_BONUS_STARS : 0);
      entry.destruction += Number(side['destructionPercentage']) || 0;
      entry.attacks += Number(side['attacks']) || 0;
      entry.warsCounted += 1;
      if (won) entry.wins += 1;
    }
  }

  return [...table.values()].sort(
    (a, b) =>
      b.stars - a.stars ||
      b.destruction - a.destruction ||
      text(a.clan['name']).localeCompare(text(b.clan['name'])),
  );
}

/* -------------------------------------------------------------------------- */
/* Promotion and demotion                                                      */
/* -------------------------------------------------------------------------- */

export type LeagueRule = { promote: number; demote: number };


const RULES: Record<string, LeagueRule> = {
  'champion league i': { promote: 0, demote: 2 },
  'bronze league iii': { promote: 2, demote: 0 },
};

const DEFAULT_RULE: LeagueRule = { promote: 2, demote: 2 };

export function leagueRule(name: unknown): LeagueRule {
  const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
  return RULES[key] ?? DEFAULT_RULE;
}
