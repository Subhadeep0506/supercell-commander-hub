import { record, rows, type ApiRecord } from '@/api/game-api';

/**
 * Normalises `/v1/players/{tag}/battlelog`.
 *
 * This module exists because the raw battle object is three different shapes
 * wearing one name, and because four of its quirks each render plausibly-wrong
 * rather than crashing. Every one of them is covered by __tests__/bs-battles.
 *
 * The shapes, discriminated by which container key is present:
 *
 *   team modes      `teams: [[3], [3]]`   result, duration, starPlayer. No rank.
 *   duo showdown    `teams: [[2] x 10]`   rank 1-10. No result, duration, star.
 *   solo showdown   `players: [20]`       rank 1-20. No teams either.
 *
 * Verified against the 23-battle capture in
 * native/brawl-stars-player-api-dump_v2.json, which covers brawlBall, knockout,
 * duoShowdown and soloShowdown. Battle types beyond `ranked` and `soloRanked`
 * were not sampled; `typeLabel` passes those through rather than guessing.
 */

export type Participant = {
  tag: string;
  name: string;
  brawlerId?: number;
  brawlerName: string;
  power?: number;
  /**
   * Trophy count. Set on trophy-ladder battles only.
   *
   * The service sends this and `rankedRank` under the same key, `trophies`,
   * and which one it means depends on the battle type. They are split here so
   * no renderer has to know that.
   */
  trophies?: number;
  /** Ranked tier, 1 = Bronze I. Set on `soloRanked`/`teamRanked` only. */
  rankedRank?: number;
};

export type BattleShape = 'team' | 'showdown' | 'unknown';

export type NormalBattle = {
  /** Stable within a log: battleTime plus event, which no two entries share. */
  key: string;
  at?: Date;
  /** `battle.mode`, camelCase as the service spells it. */
  mode: string;
  modeLabel: string;
  /** `battle.type`, raw. */
  type: string;
  typeLabel: string;
  shape: BattleShape;
  eventId?: number;
  eventModeId?: number;
  mapName: string;
  result?: 'victory' | 'defeat' | 'draw';
  rank?: number;
  /** Absent on some battles. Must render as "—", never as 0. */
  trophyChange?: number;
  duration?: number;
  starPlayer?: Participant;
  /** You, found by tag. Undefined only if the log belongs to someone else. */
  me?: Participant;
  /** Which entry of `teams` you are in. See the warning on `normalize`. */
  myTeamIndex?: number;
  /** Always populated: solo showdown's flat `players` becomes one-per-team. */
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

/**
 * `"brawlBall"` -> `"Brawl Ball"`; `"megaDuoShowdown"` -> `"Mega Duo Showdown"`.
 *
 * The team-size suffix is split off **before** the camelCase pass, not after.
 * Seven live modes end in one -- `brawlBall5V5`, `gemGrab2V2` and the rest --
 * and splitting on case first turns `5V5` into `5 V5`, after which no amount
 * of tidying puts it back together.
 */
export function modeLabel(mode: unknown): string {
  if (typeof mode !== 'string' || !mode) return 'Unknown';
  return mode
    .replace(/(\d)V(\d)$/, ' $1v$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * What the player would call this match.
 *
 * **`type: "ranked"` is the trophy ladder, not Ranked mode.** The competitive
 * queue is `soloRanked` / `teamRanked`. Printing the API's own word would put
 * "Ranked" on 22 of the 23 battles in the capture, every one of which was a
 * trophy game -- the same trap as Clash Royale's `type: "PvP"` not meaning a
 * ladder match.
 *
 * Unsampled types pass through de-camel-cased rather than being forced into
 * one of these two buckets.
 */
export function battleTypeLabel(type: unknown): string {
  if (typeof type !== 'string' || !type) return 'Battle';
  if (type === 'ranked') return 'Trophies';
  if (isRankedType(type)) return 'Ranked';
  return modeLabel(type);
}

/**
 * True for the competitive queue, false for the trophy ladder.
 *
 * **`ranked` is deliberately excluded.** That value is the trophy ladder -- see
 * `battleTypeLabel` -- and treating it as Ranked mode would relabel every
 * trophy count in the log as a rank tier. The whole fix inverts on this one
 * predicate, which is why it is a named function with a test rather than an
 * inline comparison.
 */
export function isRankedType(type: unknown): boolean {
  return type === 'soloRanked' || type === 'teamRanked';
}

/** Bronze through Legendary run in threes; Masters and Pro are single steps. */
const RANK_FAMILIES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Mythic', 'Legendary'];
const RANK_NUMERALS = ['I', 'II', 'III'];

/**
 * Ranked tier for the number a battle log carries.
 *
 * In a Ranked battle `brawler.trophies` is not a trophy count -- it is the
 * player's rank. A power-11 brawler reading "8" gave that away: as trophies it
 * is absurd, as a tier it is Gold II.
 *
 * The ladder is read off the captures rather than guessed. Pairs of
 * `rankedRank` and `rankedRankName` in the two player dumps give 1 = BRONZE I,
 * 4 = SILVER I, 7 = GOLD I and 8 = GOLD II -- which fixes both the three-step
 * family size and the offset.
 *
 * Returns undefined for 0, which the captures show for an unranked account,
 * and for anything past the table. **Masters and Pro are inferred**, not
 * attested: they follow the pattern and the eight bundled badge families, but
 * no capture reaches them. An unknown value renders as nothing rather than as
 * a confidently wrong name.
 */
export function rankedTierName(rank: unknown): string | undefined {
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) return undefined;
  const steps = RANK_FAMILIES.length * RANK_NUMERALS.length;
  if (rank <= steps) {
    const family = RANK_FAMILIES[Math.floor((rank - 1) / RANK_NUMERALS.length)]!;
    return `${family} ${RANK_NUMERALS[(rank - 1) % RANK_NUMERALS.length]!}`;
  }
  if (rank === steps + 1) return 'Masters';
  if (rank === steps + 2) return 'Pro';
  return undefined;
}

/**
 * One raw participant.
 *
 * `ranked` decides which field the brawler's number lands in, because the
 * service reuses `trophies` for both a trophy count and a rank tier. Exactly
 * one of `trophies` / `rankedRank` is ever set.
 */
function participant(raw: ApiRecord, ranked: boolean): Participant {
  const brawler = record(raw['brawler']);
  const value = typeof brawler['trophies'] === 'number' ? brawler['trophies'] : undefined;
  return {
    tag: typeof raw['tag'] === 'string' ? raw['tag'] : '',
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    brawlerId: typeof brawler['id'] === 'number' ? brawler['id'] : undefined,
    brawlerName: typeof brawler['name'] === 'string' ? brawler['name'] : '',
    power: typeof brawler['power'] === 'number' ? brawler['power'] : undefined,
    trophies: ranked ? undefined : value,
    rankedRank: ranked ? value : undefined,
  };
}

const maybeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * One raw entry -> one NormalBattle.
 *
 * **`myTag` is required and must be the log's owner.** Team order is arbitrary
 * -- you are in `teams[1]` in battle 22 of the capture, and `teams[0]` is not
 * the winner either (battle 1 is `teams[0]` and a defeat). Anything that
 * assumes "my team is first" or "the winner is first" inverts the whole render
 * silently, which is why the tag is threaded all the way down here rather than
 * resolved at the call site.
 */
export function normalizeBattle(entry: ApiRecord, myTag: string): NormalBattle {
  const battle = record(entry['battle']);
  const event = record(entry['event']);
  const tag = myTag.toUpperCase();

  const rawTeams = Array.isArray(battle['teams']) ? battle['teams'] : undefined;
  const rawPlayers = Array.isArray(battle['players']) ? battle['players'] : undefined;

  // Decided once, here, because `participant` needs it and the raw type is not
  // threaded any further down.
  const ranked = isRankedType(battle['type']);

  let teams: Participant[][];
  let shape: BattleShape;
  if (rawTeams) {
    /*
      `.map((p) => participant(p, ranked))`, never `.map(participant)`.

      Array.map passes the index as the second argument, which would land in
      `ranked` -- false for team 0 and true for every team after it. The bug
      would show as one team rendering trophies and the other rendering tiers,
      which is subtle enough to survive a glance at the screen.
    */
    teams = rawTeams.map((team) => rows(team).map((p) => participant(p, ranked)));
    // Duo showdown is also `teams`, but ten of them rather than two. The
    // discriminator that matters downstream is whether there is a `result`,
    // not how many teams there are.
    shape = typeof battle['result'] === 'string' ? 'team' : 'showdown';
  } else if (rawPlayers) {
    // Solo showdown: a flat list of 20. Wrapped one-per-team so every consumer
    // can iterate `teams` without caring which shape it came from.
    teams = rows(rawPlayers).map((p) => [participant(p, ranked)]);
    shape = 'showdown';
  } else {
    teams = [];
    shape = 'unknown';
  }

  const myTeamIndex = teams.findIndex((team) => team.some((p) => p.tag.toUpperCase() === tag));
  const me = myTeamIndex >= 0 ? teams[myTeamIndex]!.find((p) => p.tag.toUpperCase() === tag) : undefined;
  const star = record(battle['starPlayer']);
  const starPlayer = typeof star['tag'] === 'string' ? participant(star, ranked) : undefined;

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

/** The whole log, newest first as the service already returns it. */
export function normalizeBattles(items: unknown, myTag: string): NormalBattle[] {
  return rows(items).map((entry) => normalizeBattle(entry, myTag));
}

/* ---- derived stats ----------------------------------------------------- */

export type BattleSummary = {
  total: number;
  /** Battles that carry a victory/defeat. Showdowns do not. */
  decided: number;
  wins: number;
  losses: number;
  /** Over `decided` only, or undefined when nothing was decided. */
  winRate?: number;
  /** Over battles that reported one. */
  trophyChange: number;
  trophyCounted: number;
  starPlayer: number;
  /** Showdown placements, for the half of the log that has no win/loss. */
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
  /** Mode icon lookup, where the group is a mode. */
  modeId?: number;
  /** Brawler art lookup, where the group is a brawler. */
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

/** Grouped by the brawler you played. Battles where you are absent are skipped. */
export const byBrawler = (battles: NormalBattle[]): Breakdown[] =>
  fold(battles, (b) =>
    b.me?.brawlerId !== undefined
      ? { key: String(b.me.brawlerId), label: b.me.brawlerName, brawlerId: b.me.brawlerId }
      : undefined,
  );
