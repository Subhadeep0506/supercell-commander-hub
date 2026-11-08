import { record, type ApiRecord } from '@/api/game-api';
import { leagueFamily, leagueSlug } from '@/assets/slug';

/**
 * Clash of Clans League Tiers.
 *
 * The update that introduced them retired Home Village trophy leagues and put
 * a new `leagueTier` field on players, clan members and the player ladder:
 *
 *   "leagueTier": { "id": 105000011, "name": "Wizard League 11" }
 *
 * The legacy `league` field did not go away -- it still arrives on clan
 * members and ranking rows -- but it now reads `{ id: 29000000, name:
 * "Unranked" }` for every player alive, so reading it is how the whole app
 * ended up showing one meaningless badge. `leagueTier` is the real one and is
 * preferred wherever both are present.
 *
 * The number in that name is the awkward part: it counts across the *whole*
 * ladder, 1-36, not within the family. "Wizard League 11" is the second of
 * the three Wizard tiers, and the game calls it Wizard League II. Twelve
 * families, three tiers each, so:
 *
 *   family index = ceil(N / 3)        tier within family = ((N - 1) % 3) + 1
 *
 * Confirmed against a live capture rather than assumed -- Archer 7/8/9,
 * Wizard 10/11/12, Valkyrie 14/15, Golem 20, P.E.K.K.A 24 and Dragon 29 all
 * land exactly where this arithmetic puts them.
 */

/** Lowest to highest. Index + 1 is the family's position in the 1-36 ladder. */
export const LEAGUE_FAMILIES = [
  'skeleton',
  'barbarian',
  'archer',
  'wizard',
  'valkyrie',
  'witch',
  'golem',
  'pekka',
  'titan',
  'dragon',
  'electro',
  'legend',
] as const;

/** `leagueTier.id` is this plus the 1-36 tier number; 105000000 is Unranked. */
export const LEAGUE_TIER_BASE = 105000000;

export const TIERS_PER_FAMILY = 3;

/** The marker drawn in the corner of a ranked badge, indexed by tier - 1. */
export const LEAGUE_TIER_ROMAN = ['I', 'II', 'III'] as const;

/**
 * Which badge set a league belongs to, because three of them are live at once
 * and they are drawn at different granularities.
 *
 *   ranked   League Tiers, per family (`ranked-league-wizard`)
 *   builder  Builder Base, per tier   (`bb-league-iron-iii`)
 *   trophy   the retired Home Village leagues, per family (`league-crystal`)
 */
export type LeagueSystem = 'ranked' | 'builder' | 'trophy';

export type LeagueTierInfo = {
  /** Slug for the artwork lookup: `wizard`, `iron-iii`, `crystal`. */
  family: string;
  /** The family's own tier, 1-3. Absent when unranked or unnumbered. */
  tier?: 1 | 2 | 3;
  /** The ladder-wide 1-36 number, for sorting. Absent when unranked. */
  number?: number;
  /** What to print: "Wizard League II". */
  label: string;
  /** The name exactly as the API gave it, for the artwork fallbacks. */
  name: string;
  system: LeagueSystem;
  unranked: boolean;
};

/** "Wizard League 11" -> 11. Absent when the name carries no number. */
function trailingNumber(name: string): number | undefined {
  const match = /(\d+)\s*$/.exec(name);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Read one league object -- `leagueTier`, `league` or `builderBaseLeague`.
 *
 * `system` is passed in rather than sniffed from the name. "Unranked" is a
 * valid value in all three sets and each files it under a different key, so
 * guessing would land on the wrong artwork for two of them.
 */
export function leagueTierInfo(value: unknown, system: LeagueSystem): LeagueTierInfo | undefined {
  const league = record(value);
  const name = typeof league['name'] === 'string' ? league['name'].trim() : '';
  if (!name) return undefined;

  if (system !== 'ranked') {
    // Builder art is drawn per tier, so the tier stays in the key
    // ("iron-iii"); trophy art is drawn per family and the tier is dropped.
    const key = system === 'builder' ? leagueSlug(name) : leagueFamily(name);
    if (!key) return undefined;
    return {
      family: key,
      label: name,
      name,
      system,
      unranked: key === 'unranked',
    };
  }

  const family = leagueFamily(name);
  if (!family) return undefined;

  // Prefer the id: it is a number already, and survives a localised name.
  const id = Number(league['id']);
  const fromId = Number.isFinite(id) && id >= LEAGUE_TIER_BASE ? id - LEAGUE_TIER_BASE : undefined;
  const number = fromId ?? trailingNumber(name);

  if (family === 'unranked' || !number || number < 1) {
    return { family: 'unranked', label: name, name, system, unranked: true };
  }

  const tier = (((number - 1) % TIERS_PER_FAMILY) + 1) as 1 | 2 | 3;

  // Built off the API's own string rather than LEAGUE_FAMILIES, so a family
  // Supercell adds later still prints its real name -- and so "P.E.K.K.A"
  // keeps its dots in the label even though the artwork key drops them.
  const stem = name.replace(/\s*\d+\s*$/, '').trim();

  return {
    family,
    tier,
    number,
    label: `${stem} ${LEAGUE_TIER_ROMAN[tier - 1]}`,
    name,
    system,
    unranked: false,
  };
}

/**
 * The league to show for a player row on whichever ladder is open.
 *
 * Home mode has to serve two shapes at once: `leagueTier` on anything fetched
 * since the update, and the old `league` on a cached or fixture payload that
 * predates it. Falling back rather than committing to one keeps old captures
 * rendering something truthful instead of a hole.
 */
export function playerLeague(
  entry: ApiRecord,
  mode: 'home' | 'builder' | 'capital',
): LeagueTierInfo | undefined {
  if (mode === 'builder') return leagueTierInfo(entry['builderBaseLeague'], 'builder');
  return (
    leagueTierInfo(entry['leagueTier'], 'ranked') ?? leagueTierInfo(entry['league'], 'trophy')
  );
}
