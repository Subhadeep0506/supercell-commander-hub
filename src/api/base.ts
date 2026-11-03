import { HOSTS } from '@/config/keys';
import type { Game } from './game-api';

/**
 * Native target: call the RoyaleAPI proxies directly.
 * CORS does not apply outside a browser, so no intermediary is needed.
 *
 * The browser build uses base.web.ts instead.
 */
export function apiBase(game: Game): string {
  return HOSTS[game];
}
