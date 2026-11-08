import type { Game } from './game-api';

/**
 * Browser target: go through the Vite dev proxy.
 *
 * The RoyaleAPI proxies send no CORS headers, so Chrome blocks a direct
 * fetch. These paths are rewritten onto the real hosts by server.proxy in
 * vite.config.mts -- which also means the web build only works behind a dev
 * or preview server carrying that config.
 */
export function apiBase(game: Game): string {
  return `/api/${game}`;
}
