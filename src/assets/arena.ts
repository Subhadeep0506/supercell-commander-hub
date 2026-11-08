import type { ImageSourcePropType } from 'react-native';
import { arenaImages } from './registry.arena';

/**
 * Replaces frontend/src/lib/arena-art.ts.
 *
 * The reference shipped 337 hand-written imports of Lovable CDN pointers; the
 * artwork itself is already bundled here as WebP by scripts/build-assets.mjs
 * (the `cr/cards` and `bs/main` fan kits), so this is a slug away from a key
 * rather than a generated map.
 *
 * Checked against the live `/v1/cards`: with the aliases below this resolves
 * **123 of 123 cards and 4 of 4 tower troops**.
 */

/** "P.E.K.K.A" -> "pekka"; "Giant Snowball" -> "giantsnowball". */
export function arenaSlug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Cards whose fan-kit filename is not their slug.
 *
 * Three of them, all because the kit disambiguates a name that collides with
 * something else in the same folder: the Clash of Clans crossover art carries
 * an `ac` suffix, the spell carries its type, and the tower troop is filed
 * apart from the Princess card of the same name.
 */
const ALIASES: Record<string, string> = {
  'giant skeleton': 'giantskeletonac',
  vines: 'vinesspell',
  'tower princess': 'princesstowertroop',
};

/** Artwork for a card, tower troop or brawler by its API name. */
export function arenaArt(name: unknown): ImageSourcePropType | undefined {
  if (typeof name !== 'string') return undefined;
  const alias = ALIASES[name.toLowerCase()];
  return arenaImages[alias ?? arenaSlug(name)];
}

/**
 * Bundled evolution artwork, when it exists.
 *
 * 57 cards evolve and only 18 have evolution art in the fan kit, so the caller
 * must fall back to the API's own `iconUrls.evolutionMedium` through
 * RemoteImage -- which is why this returns undefined rather than the base art.
 * Silently handing back the base card would make an un-evolved card look
 * evolved.
 */
export function arenaEvolutionArt(name: unknown): ImageSourcePropType | undefined {
  const slug = arenaSlug(name);
  return slug ? arenaImages[`${slug}evolution`] : undefined;
}

// Icons the Royale screens draw live in assets/royale.ts, keyed by meaning
// rather than by filename -- see CR_ICONS there.
