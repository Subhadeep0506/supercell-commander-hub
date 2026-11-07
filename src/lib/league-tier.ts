import { record, type ApiRecord } from '@/api/game-api';
import { leagueFamily, leagueSlug } from '@/assets/slug';




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


export const LEAGUE_TIER_BASE = 105000000;

export const TIERS_PER_FAMILY = 3;


export const LEAGUE_TIER_ROMAN = ['I', 'II', 'III'] as const;


export type LeagueSystem = 'ranked' | 'builder' | 'trophy';

export type LeagueTierInfo = {

  family: string;

  tier?: 1 | 2 | 3;

  number?: number;

  label: string;

  name: string;
  system: LeagueSystem;
  unranked: boolean;
};


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


export function playerLeague(
  entry: ApiRecord,
  mode: 'home' | 'builder' | 'capital',
): LeagueTierInfo | undefined {
  if (mode === 'builder') return leagueTierInfo(entry['builderBaseLeague'], 'builder');
  return (
    leagueTierInfo(entry['leagueTier'], 'ranked') ?? leagueTierInfo(entry['league'], 'trophy')
  );
}
