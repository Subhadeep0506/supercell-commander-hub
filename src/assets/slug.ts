/**
 * Name slugging shared by the artwork lookups.
 *
 * Every bundled badge is filed under the kebab-case form of the name the API
 * returns, so the lookups are a slug away from a key rather than a
 * hand-maintained map. Kept in its own module because both `capital.ts` and
 * `leagues.ts` need the identical rules -- restating them is how the two
 * quietly drift apart.
 */

/** "Trophy Pushing" -> "trophy-pushing"; "Capital Peak" -> "capital-peak". */
export function slug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * League names only: "Titan League I" -> "titan-i", "Legend League" -> "legend".
 *
 * Deliberately not shared with `slug`. The clan label "Clan War League" is
 * filed as `clan-war-league`, so dropping the word there would miss it.
 */
export function leagueSlug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return slug(name.replace(/\bleagues?\b/gi, ' '));
}

/**
 * The league family, with any tier dropped: "Titan League III" -> "titan",
 * "Barbarian 1" -> "barbarian".
 *
 * Two tier notations are in play. Trophy, war and capital leagues number their
 * tiers with roman numerals ("Crystal League II"); the Ranked leagues
 * introduced in the October 2025 update use arabic ones ("Skeleton 2"). Both
 * reduce to the same family, which is the level several of the badge sets are
 * drawn at.
 */
export function leagueFamily(name: unknown): string {
  return leagueSlug(name).replace(/-(?:i{1,3}|iv|v|\d+)$/, '');
}
