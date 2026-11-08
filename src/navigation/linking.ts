import type { LinkingOptions } from '@react-navigation/native';
import { ROUTE_PATHS, type RootStackParamList } from './routes';

/**
 * URL mapping. Paths match the reference app exactly, so every link that works
 * there works here.
 *
 * React Navigation folds unmatched query parameters into route params, which
 * is how `?tag=` arrives on the three lookup screens. The tag is
 * percent-encoded on the way out (`%232PP`) -- an unencoded `#2PP` would be
 * read by the browser as a fragment, and is equally broken in the reference.
 *
 * ROUTE_PATHS is ordered most-specific-first so two-segment CoC paths are
 * never shadowed by the bare 'coc' route.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['supercellcommanderhub://', 'https://commanderhub.local'],
  config: { screens: ROUTE_PATHS },
};
