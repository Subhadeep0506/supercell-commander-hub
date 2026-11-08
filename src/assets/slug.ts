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
 *
 * Dots are deleted rather than turned into separators, which `slug` would do.
 * One league is spelled with them -- "P.E.K.K.A League 24" -- and the artwork
 * for it is filed as `pekka`, not `p-e-k-k-a`. Safe here because no league
 * name relies on a dot to keep two words apart.
 */
export function leagueSlug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return slug(name.replace(/\./g, '').replace(/\bleagues?\b/gi, ' '));
}

/**
 * The league family, with any tier dropped: "Titan League III" -> "titan",
 * "Barbarian 1" -> "barbarian".
 *
 * Two tier notations are in play. Trophy, war, capital and Builder Base
 * leagues number their tiers with roman numerals ("Crystal League II"); the
 * ranked League Tiers use an arabic number that counts across the whole
 * ladder rather than within the family ("Wizard League 11"). Both reduce to
 * the same family, which is the level the ranked badge set is drawn at.
 *
 * See `lib/league-tier.ts` for turning that 1-36 number back into the
 * family's own I/II/III.
 */
export function leagueFamily(name: unknown): string {
  return leagueSlug(name).replace(/-(?:i{1,3}|iv|v|\d+)$/, '');
}
