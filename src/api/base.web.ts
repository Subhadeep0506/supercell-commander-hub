import type { Game } from './game-api';


export function apiBase(game: Game): string {
  return `/api/${game}`;
}
