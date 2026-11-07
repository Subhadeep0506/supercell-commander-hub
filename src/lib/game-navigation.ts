import type { Game } from '@/api/game-api';
import type { RouteName } from '@/navigation/routes';

export type NavItem = { label: string; route: RouteName };


export const GAME_NAV: Record<Game, NavItem[]> = {
  coc: [
    { label: 'War', route: 'CocWar' },
    { label: 'Builder', route: 'CocBuilder' },
    { label: 'Clan', route: 'CocClan' },
    { label: 'Leaderboard', route: 'CocLeaderboard' },
  ],
  cr: [
    { label: 'Home', route: 'CrHome' },
    { label: 'Decks', route: 'CrDecks' },
    { label: 'Clan', route: 'CrClan' },
    { label: 'Leaderboard', route: 'CrLeaderboard' },
  ],
  bs: [
    { label: 'Home', route: 'BsHome' },
    { label: 'Stats', route: 'BsStats' },
    { label: 'Club', route: 'BsClub' },
    { label: 'Leaderboard', route: 'BsLeaderboard' },
  ],
};


export function gameFromRoute(route: string | undefined, fallback: Game): Game {
  if (route?.startsWith('Coc')) return 'coc';
  if (route?.startsWith('Cr')) return 'cr';
  if (route?.startsWith('Bs')) return 'bs';
  return fallback;
}
