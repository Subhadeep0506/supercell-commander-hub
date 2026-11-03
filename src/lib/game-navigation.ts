import type { Game } from '@/api/game-api';
import type { RouteName } from '@/navigation/routes';

export type NavItem = { label: string; route: RouteName };

/**
 * Ported from frontend/src/lib/game-navigation.ts.
 *
 * The reference stores paths; these store route names, because the navigator
 * addresses screens by name and linking.ts owns the path mapping.
 *
 * Clash Royale and Brawl Stars arrive with their own screens, so their rows
 * are empty for now and BottomNav renders nothing for them.
 */
export const GAME_NAV: Record<Game, NavItem[]> = {
  coc: [
    { label: 'War', route: 'CocWar' },
    { label: 'Builder', route: 'CocBuilder' },
    { label: 'Clan', route: 'CocClan' },
    { label: 'Leaderboard', route: 'CocLeaderboard' },
  ],
  cr: [],
  bs: [],
};

/** Which game skin a route belongs to, falling back to the hub's current game. */
export function gameFromRoute(route: string | undefined, fallback: Game): Game {
  if (route?.startsWith('Coc')) return 'coc';
  if (route?.startsWith('Cr')) return 'cr';
  if (route?.startsWith('Bs')) return 'bs';
  return fallback;
}
