import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { memberTh } from './cwl';

/**
 * One player's war attacks and defences, pulled out of a war board.
 *
 * Clash of Clans has **no battle log**. There is no endpoint for a player's
 * multiplayer raids, and the clan war log (`/clans/{tag}/warlog`) carries only
 * clan-level totals -- `attacks`, `stars`, `destructionPercentage`, `result`
 * -- with no `members` array at all, so past wars cannot be broken down by
 * player either.
 *
 * What *does* exist per player is the current war board
 * (`/clans/{tag}/currentwar`) and each Clan War League war
 * (`/clanwarleagues/wars/{warTag}`): both list every member with the attacks
 * they made, each naming its defender by tag. Defences are the mirror image --
 * the opposing roster's attacks whose `defenderTag` is this player. That pair
 * is the whole of what the API can say about a Clash of Clans player's
 * battles, and it is what this builds.
 */

export type WarRole = 'attack' | 'defence';

export type WarBattle = {
  role: WarRole;
  /** Which war this came from, for the row's subtitle. */
  warLabel: string;
  /** Sort key: newest war first, then by attack order within it. */
  warRank: number;
  order: number;
  stars: number;
  destruction: number;
  /** Seconds. 0 when the API omitted it. */
  duration: number;
  /** The other player: whoever was hit, or whoever attacked. */
  otherName: string;
  otherTag: string;
  otherPosition: string;
  otherTownHall: number;
  otherClanName: string;
  myPosition: string;
  myTownHall: number;
  /** `inWar` / `warEnded` / `preparation`, straight off the war. */
  warState: string;
  warEndTime: string;
};

type Found = { side: ApiRecord; other: ApiRecord; member: ApiRecord };

/** Which roster the tag is on, with the opposing one beside it. */
function locate(war: ApiRecord, tag: string): Found | null {
  const want = tag.toUpperCase();
  for (const [key, otherKey] of [
    ['clan', 'opponent'],
    ['opponent', 'clan'],
  ] as const) {
    const side = record(war[key]);
    const member = rows(side['members']).find((m) => text(m['tag']).toUpperCase() === want);
    if (member) return { side, other: record(war[otherKey]), member };
  }
  return null;
}

function indexByTag(side: ApiRecord): Map<string, ApiRecord> {
  const index = new Map<string, ApiRecord>();
  for (const m of rows(side['members'])) index.set(text(m['tag']).toUpperCase(), m);
  return index;
}

/**
 * Every attack this player made and took in one war.
 *
 * Returns an empty array -- not null -- when the player is not on either
 * roster, which is the normal case for a member who sat the war out.
 */
export function warBattlesFor(
  war: ApiRecord,
  tag: string,
  warLabel: string,
  warRank: number,
): WarBattle[] {
  const found = locate(war, tag);
  if (!found) return [];
  const { other, member } = found;
  const want = tag.toUpperCase();
  const theirs = indexByTag(other);
  const warState = text(war['state']);
  const warEndTime = text(war['endTime']);
  const myPosition = text(member['mapPosition']);
  const myTownHall = memberTh(member);
  // Both roles name the *other* clan: the one we attacked into, and the one
  // the attack on us came from. In a regular war those are the same clan.
  const otherClanName = text(other['name']);

  const out: WarBattle[] = [];

  for (const attack of rows(member['attacks'])) {
    const defender = theirs.get(text(attack['defenderTag']).toUpperCase()) ?? {};
    out.push({
      role: 'attack',
      warLabel,
      warRank,
      order: Number(attack['order']) || 0,
      stars: Number(attack['stars']) || 0,
      destruction: Number(attack['destructionPercentage']) || 0,
      duration: Number(attack['duration']) || 0,
      otherName: text(defender['name']),
      otherTag: text(attack['defenderTag']),
      otherPosition: text(defender['mapPosition']),
      otherTownHall: memberTh(defender),
      otherClanName,
      myPosition,
      myTownHall,
      warState,
      warEndTime,
    });
  }

  // Defences. `bestOpponentAttack` on our own member is only the best one --
  // every attack taken is on the *other* roster, named by defenderTag.
  for (const enemy of rows(other['members'])) {
    for (const attack of rows(enemy['attacks'])) {
      if (text(attack['defenderTag']).toUpperCase() !== want) continue;
      out.push({
        role: 'defence',
        warLabel,
        warRank,
        order: Number(attack['order']) || 0,
        stars: Number(attack['stars']) || 0,
        destruction: Number(attack['destructionPercentage']) || 0,
        duration: Number(attack['duration']) || 0,
        otherName: text(enemy['name']),
        otherTag: text(enemy['tag']),
        otherPosition: text(enemy['mapPosition']),
        otherTownHall: memberTh(enemy),
        otherClanName,
        myPosition,
        myTownHall,
        warState,
        warEndTime,
      });
    }
  }

  return out;
}

/**
 * Whether the tag is on any league-group roster.
 *
 * Worth asking before the wars are fetched. A league season is up to 28 war
 * requests, and a clan member who did not sign up for Clan War League appears
 * in none of them -- which is the common case, since the roster is capped and
 * opting in is per-player. The group lists every participant up front, so one
 * cheap read decides whether the 28 are worth making at all.
 *
 * `members` here is the clan-roster spelling, the same one `memberTh` reads.
 */
export function inLeagueGroup(group: ApiRecord | undefined, tag: string): boolean {
  if (!group) return false;
  const want = tag.toUpperCase();
  return rows(group['clans']).some((clan) =>
    rows(clan['members']).some((m) => text(m['tag']).toUpperCase() === want),
  );
}

/** Newest war first, and within a war the most recent attack first. */
export function sortWarBattles(battles: WarBattle[]): WarBattle[] {
  return [...battles].sort((a, b) => b.warRank - a.warRank || b.order - a.order);
}

export type WarBattleSummary = {
  attacks: number;
  defences: number;
  starsFor: number;
  starsAgainst: number;
  /** Mean destruction across attacks made, or null when none were made. */
  destructionFor: number | null;
  destructionAgainst: number | null;
  threeStars: number;
  /** Attacks that took no stars at all. */
  failed: number;
};

export function warBattleSummary(battles: WarBattle[]): WarBattleSummary {
  const made = battles.filter((b) => b.role === 'attack');
  const taken = battles.filter((b) => b.role === 'defence');
  const mean = (list: WarBattle[]) =>
    list.length ? list.reduce((n, b) => n + b.destruction, 0) / list.length : null;
  return {
    attacks: made.length,
    defences: taken.length,
    starsFor: made.reduce((n, b) => n + b.stars, 0),
    starsAgainst: taken.reduce((n, b) => n + b.stars, 0),
    destructionFor: mean(made),
    destructionAgainst: mean(taken),
    threeStars: made.filter((b) => b.stars === 3).length,
    failed: made.filter((b) => b.stars === 0).length,
  };
}
