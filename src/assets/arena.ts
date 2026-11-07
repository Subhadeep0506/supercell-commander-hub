import type { ImageSourcePropType } from 'react-native';
import { arenaImages } from './registry.arena';




export function arenaSlug(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}


const ALIASES: Record<string, string> = {
  'giant skeleton': 'giantskeletonac',
  vines: 'vinesspell',
  'tower princess': 'princesstowertroop',
};


export function arenaArt(name: unknown): ImageSourcePropType | undefined {
  if (typeof name !== 'string') return undefined;
  const alias = ALIASES[name.toLowerCase()];
  return arenaImages[alias ?? arenaSlug(name)];
}


export function arenaEvolutionArt(name: unknown): ImageSourcePropType | undefined {
  const slug = arenaSlug(name);
  return slug ? arenaImages[`${slug}evolution`] : undefined;
}

// Icons the Royale screens draw live in assets/royale.ts, keyed by meaning
// rather than by filename -- see CR_ICONS there.
