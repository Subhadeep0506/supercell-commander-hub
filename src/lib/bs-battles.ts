import { record, rows, type ApiRecord } from '@/api/game-api';



export type Participant = {
  tag: string;
  name: string;
  brawlerId?: number;
  brawlerName: string;
  power?: number;
  trophies?: number;
};

export type BattleShape = 'team' | 'showdown' | 'unknown';

export type NormalBattle = {

  key: string;
  at?: Date;

  mode: string;
  modeLabel: string;

  type: string;
  typeLabel: string;
  shape: BattleShape;
  eventId?: number;
  eventModeId?: number;
  mapName: string;
  result?: 'victory' | 'defeat' | 'draw';
  rank?: number;

  trophyChange?: number;
  duration?: number;
  starPlayer?: Participant;

  me?: Participant;

  myTeamIndex?: number;

  teams: Participant[][];
  isStarPlayer: boolean;
};

/**
 * `"20261106T183115.000Z"` -> Date.
 *
 * Not ISO 8601 and not parseable as-is: `Date.parse` returns NaN for the
 * compact form on every engine the app runs on. The separators have to be put
 * back before parsing.
 */
export function parseBattleTime(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(value.trim());
  if (!m) return undefined;
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}


export function modeLabel(mode: unknown): string {
  if (typeof mode !== 'string' || !mode) return 'Unknown';
  return mode
    .replace(/(\d)V(\d)$/, ' $1v$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}


export function battleTypeLabel(type: unknown): string {
  if (typeof type !== 'string' || !type) return 'Battle';
  if (type === 'ranked') return 'Trophies';
  if (type === 'soloRanked' || type === 'teamRanked') return 'Ranked';
  return modeLabel(type);
}

function participant(raw: ApiRecord): Participant {
  const brawler = record(raw['brawler']);
  return {
    tag: typeof raw['tag'] === 'string' ? raw['tag'] : '',
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    brawlerId: typeof brawler['id'] === 'number' ? brawler['id'] : undefined,
    brawlerName: typeof brawler['name'] === 'string' ? brawler['name'] : '',
    power: typeof brawler['power'] === 'number' ? brawler['power'] : undefined,
    trophies: typeof brawler['trophies'] === 'number' ? brawler['trophies'] : undefined,
  };
}

const maybeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;


export function normalizeBattle(entry: ApiRecord, myTag: string): NormalBattle {
  const battle = record(entry['battle']);
  const event = record(entry['event']);
  const tag = myTag.toUpperCase();

  const rawTeams = Array.isArray(battle['teams']) ? battle['teams'] : undefined;
  const rawPlayers = Array.isArray(battle['players']) ? battle['players'] : undefined;

  let teams: Participant[][];
  let shape: BattleShape;
  if (rawTeams) {
    teams = rawTeams.map((team) => rows(team).map(participant));
    // Duo showdown is also `teams`, but ten of them rather than two. The
    // discriminator that matters downstream is whether there is a `result`,
    // not how many teams there are.
    shape = typeof battle['result'] === 'string' ? 'team' : 'showdown';
  } else if (rawPlayers) {
    // Solo showdown: a flat list of 20. Wrapped one-per-team so every consumer
    // can iterate `teams` without caring which shape it came from.
    teams = rows(rawPlayers).map((p) => [participant(p)]);
    shape = 'showdown';
  } else {
    teams = [];
    shape = 'unknown';
  }

  const myTeamIndex = teams.findIndex((team) => team.some((p) => p.tag.toUpperCase() === tag));
  const me = myTeamIndex >= 0 ? teams[myTeamIndex]!.find((p) => p.tag.toUpperCase() === tag) : undefined;
  const star = record(battle['starPlayer']);
  const starPlayer = typeof star['tag'] === 'string' ? participant(star) : undefined;

  const result = battle['result'];
  return {
    key: `${String(entry['battleTime'] ?? '')}:${String(event['id'] ?? '')}`,
    at: parseBattleTime(entry['battleTime']),
    // `battle.mode` wins over `event.mode`. They disagree: the event says
    // `megaShowdown` (modeId 75) where the battle says `soloShowdown`. The
    // battle field is what was played; the event field is the slot it ran in,
    // and is what the mode *icon* should key off.
    mode: typeof battle['mode'] === 'string' ? battle['mode'] : '',
    modeLabel: modeLabel(battle['mode']),
    type: typeof battle['type'] === 'string' ? battle['type'] : '',
    typeLabel: battleTypeLabel(battle['type']),
    shape,
    eventId: maybeNumber(event['id']),
    eventModeId: maybeNumber(event['modeId']),
    mapName: typeof event['map'] === 'string' ? event['map'] : '',
    result: result === 'victory' || result === 'defeat' || result === 'draw' ? result : undefined,
    rank: maybeNumber(battle['rank']),
    // Deliberately undefined rather than 0 when absent -- two of the 23
    // captured battles have no `trophyChange` at all, and "0" claims the
    // match was worth nothing rather than that we were not told.
    trophyChange: maybeNumber(battle['trophyChange']),
    duration: maybeNumber(battle['duration']),
    starPlayer,
    me,
    myTeamIndex: myTeamIndex >= 0 ? myTeamIndex : undefined,
    teams,
    isStarPlayer: Boolean(starPlayer && starPlayer.tag.toUpperCase() === tag),
  };
}


export function normalizeBattles(items: unknown, myTag: string): NormalBattle[] {
  return rows(items).map((entry) => normalizeBattle(entry, myTag));
}

/* ---- derived stats ----------------------------------------------------- */

export type BattleSummary = {
  total: number;

  decided: number;
  wins: number;
  losses: number;

  winRate?: number;

  trophyChange: number;
  trophyCounted: number;
  starPlayer: number;

  showdowns: number;
  averageRank?: number;
};

export function summarize(battles: NormalBattle[]): BattleSummary {
  const decided = battles.filter((b) => b.result === 'victory' || b.result === 'defeat');
  const wins = decided.filter((b) => b.result === 'victory').length;
  const scored = battles.filter((b) => b.trophyChange !== undefined);
  const ranked = battles.filter((b) => b.rank !== undefined);
  return {
    total: battles.length,
    decided: decided.length,
    wins,
    losses: decided.length - wins,
    winRate: decided.length ? wins / decided.length : undefined,
    trophyChange: scored.reduce((sum, b) => sum + (b.trophyChange ?? 0), 0),
    trophyCounted: scored.length,
    starPlayer: battles.filter((b) => b.isStarPlayer).length,
    showdowns: ranked.length,
    averageRank: ranked.length
      ? ranked.reduce((sum, b) => sum + (b.rank ?? 0), 0) / ranked.length
      : undefined,
  };
}

export type Breakdown = {
  key: string;
  label: string;

  modeId?: number;

  brawlerId?: number;
  played: number;
  wins: number;
  decided: number;
  trophyChange: number;
  averageRank?: number;
};

function fold(
  battles: NormalBattle[],
  keyOf: (b: NormalBattle) => { key: string; label: string; modeId?: number; brawlerId?: number } | undefined,
): Breakdown[] {
  const groups = new Map<string, Breakdown & { rankSum: number; rankCount: number }>();
  for (const battle of battles) {
    const id = keyOf(battle);
    if (!id) continue;
    const group =
      groups.get(id.key) ??
      {
        ...id,
        played: 0,
        wins: 0,
        decided: 0,
        trophyChange: 0,
        rankSum: 0,
        rankCount: 0,
      };
    group.played++;
    if (battle.result === 'victory' || battle.result === 'defeat') {
      group.decided++;
      if (battle.result === 'victory') group.wins++;
    }
    if (battle.trophyChange !== undefined) group.trophyChange += battle.trophyChange;
    if (battle.rank !== undefined) {
      group.rankSum += battle.rank;
      group.rankCount++;
    }
    groups.set(id.key, group);
  }
  return [...groups.values()]
    .map(({ rankSum, rankCount, ...rest }) => ({
      ...rest,
      averageRank: rankCount ? rankSum / rankCount : undefined,
    }))
    .sort((a, b) => b.played - a.played || b.trophyChange - a.trophyChange);
}

/**
 * Grouped by what was played.
 *
 * Keyed on `battle.mode`, so Mega Showdown and Solo Showdown fold together as
 * the one mode they are. `modeId` carries `event.modeId` for the icon, which
 * is the field that *does* distinguish them.
 */
export const byMode = (battles: NormalBattle[]): Breakdown[] =>
  fold(battles, (b) =>
    b.mode ? { key: b.mode, label: b.modeLabel, modeId: b.eventModeId } : undefined,
  );


export const byBrawler = (battles: NormalBattle[]): Breakdown[] =>
  fold(battles, (b) =>
    b.me?.brawlerId !== undefined
      ? { key: String(b.me.brawlerId), label: b.me.brawlerName, brawlerId: b.me.brawlerId }
      : undefined,
  );
