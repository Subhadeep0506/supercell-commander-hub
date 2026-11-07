import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { averageElixir, averageLevel } from './royale-cards';



/**
 * `20261104T045754.000Z` is not a format Date understands.
 *
 * Supercell uses this one shape for every timestamp it returns -- `battleTime`,
 * `createdDate`, `finishTime`, `lastSeen` -- so this is the project's single
 * date parser rather than a battle-specific one.
 */
export function parseApiDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const iso = value.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    '$1-$2-$3T$4:$5:$6',
  );
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}


export function modeLabel(value: unknown): string {
  const raw = text(value);
  if (raw === '—') return raw;
  return raw
    .replace(/^Event_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bPv P\b/g, 'PvP')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Side = 'team' | 'opponent';
export type Outcome = 'victory' | 'defeat' | 'draw';

/**
 * Which side the tag played on.
 *
 * Defaults to `team`, which is the side the API always puts the requested
 * player on -- but a battle pulled from someone else's log has to be read from
 * whichever side actually holds the tag.
 */
export function sideOf(battle: ApiRecord, tag: string): Side {
  const want = tag.toUpperCase();
  return rows(battle['opponent']).some((p) => text(p['tag']).toUpperCase() === want)
    ? 'opponent'
    : 'team';
}

export function crownsOf(players: ApiRecord[]): number | null {
  const value = players[0]?.['crowns'];
  return typeof value === 'number' ? value : null;
}


export function outcomeOf(battle: ApiRecord, tag: string): Outcome | null {
  const side = sideOf(battle, tag);
  const mine = crownsOf(rows(battle[side]));
  const theirs = crownsOf(rows(battle[side === 'team' ? 'opponent' : 'team']));
  if (mine === null || theirs === null) return null;
  return mine > theirs ? 'victory' : mine < theirs ? 'defeat' : 'draw';
}


function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}


export type BattleSide = {
  tag: string;
  name: string;
  clanName: string | null;
  clanTag: string | null;
  clanBadgeId: unknown;
  crowns: number | null;
  startingTrophies: number | null;
  trophyChange: number | null;
  globalRank: number | null;
  kingTowerHitPoints: number | null;

  princessTowers: number[];

  towersLost: number;
  kingDown: boolean;
  elixirLeaked: number | null;
  cards: ApiRecord[];
  supportCards: ApiRecord[];
  averageElixir: number | null;
  averageLevel: number | null;
};

export function battleSide(player: ApiRecord): BattleSide {
  const clan = record(player['clan']);
  const cards = rows(player['cards']);
  const king = number(player['kingTowerHitPoints']);
  // Absent (null), not an empty array, is how "both princess towers fell" is
  // reported -- so this reads whatever is there and counts what survived.
  const raw = player['princessTowersHitPoints'];
  const standing = (Array.isArray(raw) ? raw : []).filter(
    (hp): hp is number => typeof hp === 'number',
  );
  const kingDown = king === 0;
  return {
    tag: text(player['tag']),
    name: text(player['name']),
    clanName: typeof clan['name'] === 'string' ? clan['name'] : null,
    clanTag: typeof clan['tag'] === 'string' ? clan['tag'] : null,
    clanBadgeId: clan['badgeId'],
    crowns: number(player['crowns']),
    startingTrophies: number(player['startingTrophies']),
    trophyChange: number(player['trophyChange']),
    globalRank: number(player['globalRank']),
    kingTowerHitPoints: king,
    princessTowers: standing,
    towersLost: 2 - standing.length + (kingDown ? 1 : 0),
    kingDown,
    elixirLeaked: number(player['elixirLeaked']),
    cards,
    supportCards: rows(player['supportCards']),
    averageElixir: averageElixir(cards),
    averageLevel: averageLevel(cards),
  };
}

export type NormalBattle = {
  type: string;
  typeLabel: string;
  mode: string;
  modeLabel: string;
  arena: string;
  time: Date | null;
  outcome: Outcome | null;
  mine: ApiRecord[];
  theirs: ApiRecord[];

  myRoster: BattleSide[];
  theirRoster: BattleSide[];
  myCrowns: number | null;
  theirCrowns: number | null;
  trophyChange: number | null;
  elixirLeaked: { mine: number | null; theirs: number | null };

  teamSize: number;

  deckSelection: string | null;

  eventTag: string | null;
  leagueNumber: number | null;
  isHostedMatch: boolean;
  isLadderTournament: boolean;
};

export function normalizeBattle(battle: ApiRecord, tag: string): NormalBattle {
  const side = sideOf(battle, tag);
  const mine = rows(battle[side]);
  const theirs = rows(battle[side === 'team' ? 'opponent' : 'team']);
  const leaked = (players: ApiRecord[]) => number(players[0]?.['elixirLeaked']);
  const trophy = mine[0]?.['trophyChange'];
  return {
    type: text(battle['type']),
    typeLabel: modeLabel(battle['type']),
    mode: text(record(battle['gameMode'])['name']),
    modeLabel: modeLabel(record(battle['gameMode'])['name']),
    arena: text(record(battle['arena'])['name']),
    time: parseApiDate(battle['battleTime']),
    outcome: outcomeOf(battle, tag),
    mine,
    theirs,
    myRoster: mine.map(battleSide),
    theirRoster: theirs.map(battleSide),
    myCrowns: crownsOf(mine),
    theirCrowns: crownsOf(theirs),
    trophyChange: typeof trophy === 'number' ? trophy : null,
    elixirLeaked: { mine: leaked(mine), theirs: leaked(theirs) },
    teamSize: Math.max(mine.length, theirs.length, 1),
    deckSelection: typeof battle['deckSelection'] === 'string' ? battle['deckSelection'] : null,
    eventTag: typeof battle['eventTag'] === 'string' ? battle['eventTag'] : null,
    leagueNumber: number(battle['leagueNumber']),
    isHostedMatch: battle['isHostedMatch'] === true,
    isLadderTournament: battle['isLadderTournament'] === true,
  };
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  victory: 'Victory',
  defeat: 'Defeat',
  draw: 'Draw',
};


export function relativeTime(when: Date, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - when.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * `27 Oct, 23:09`. Deliberately not `toLocaleString` with a named timeZone:
 * Hermes ships without full ICU, so anything beyond the default locale throws
 * or silently returns an unformatted string on a release Android build.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function battleStamp(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getDate()} ${MONTHS[when.getMonth()]}, ${pad(when.getHours())}:${pad(
    when.getMinutes(),
  )}`;
}

export type BattleSummary = {
  battles: number;
  wins: number;
  losses: number;
  draws: number;

  undecided: number;
  crownsFor: number;
  crownsAgainst: number;

  trophyChange: number | null;
  winRate: number | null;

  elixirLeaked: number | null;
};

/**
 * The headline record across the whole returned window.
 *
 * Like everything else here this is *recent*, not lifetime -- the player
 * object's own `wins`/`losses` are the lifetime figures and are shown
 * separately under Record.
 */
export function battleSummary(battles: ApiRecord[], tag: string): BattleSummary {
  const out: BattleSummary = {
    battles: battles.length,
    wins: 0,
    losses: 0,
    draws: 0,
    undecided: 0,
    crownsFor: 0,
    crownsAgainst: 0,
    trophyChange: null,
    winRate: null,
    elixirLeaked: null,
  };
  let leakSum = 0;
  let leakCount = 0;
  for (const raw of battles) {
    const battle = normalizeBattle(raw, tag);
    if (battle.outcome === 'victory') out.wins += 1;
    else if (battle.outcome === 'defeat') out.losses += 1;
    else if (battle.outcome === 'draw') out.draws += 1;
    else out.undecided += 1;
    out.crownsFor += battle.myCrowns ?? 0;
    out.crownsAgainst += battle.theirCrowns ?? 0;
    if (battle.trophyChange !== null) out.trophyChange = (out.trophyChange ?? 0) + battle.trophyChange;
    if (battle.elixirLeaked.mine !== null) {
      leakSum += battle.elixirLeaked.mine;
      leakCount += 1;
    }
  }
  const decided = out.wins + out.losses + out.draws;
  out.winRate = decided ? (out.wins / decided) * 100 : null;
  out.elixirLeaked = leakCount ? leakSum / leakCount : null;
  return out;
}


export function battleTypes(battles: ApiRecord[]): string[] {
  return [...new Set(battles.map((b) => text(b['type'])))].filter((t) => t !== '—');
}


export function battleModes(battles: ApiRecord[]): string[] {
  return [...new Set(battles.map((b) => text(record(b['gameMode'])['name'])))].filter(
    (m) => m !== '—',
  );
}

export type ModeRecord = {
  mode: string;
  label: string;
  wins: number;
  losses: number;
  draws: number;
  battles: number;
  crownsFor: number;
  crownsAgainst: number;
  winRate: number | null;
};


export function modeRecords(battles: ApiRecord[], tag: string): ModeRecord[] {
  const found = new Map<string, ModeRecord>();
  for (const battle of battles) {
    const mode = text(record(battle['gameMode'])['name']);
    if (mode === '—') continue;
    let entry = found.get(mode);
    if (!entry) {
      entry = {
        mode,
        label: modeLabel(mode),
        wins: 0,
        losses: 0,
        draws: 0,
        battles: 0,
        crownsFor: 0,
        crownsAgainst: 0,
        winRate: null,
      };
      found.set(mode, entry);
    }
    entry.battles += 1;
    const normal = normalizeBattle(battle, tag);
    if (normal.myCrowns !== null) entry.crownsFor += normal.myCrowns;
    if (normal.theirCrowns !== null) entry.crownsAgainst += normal.theirCrowns;
    if (normal.outcome === 'victory') entry.wins += 1;
    else if (normal.outcome === 'defeat') entry.losses += 1;
    else if (normal.outcome === 'draw') entry.draws += 1;
  }
  return [...found.values()]
    .map((entry) => {
      const decided = entry.wins + entry.losses + entry.draws;
      return { ...entry, winRate: decided ? (entry.wins / decided) * 100 : null };
    })
    .sort((a, b) => b.battles - a.battles || a.label.localeCompare(b.label));
}
