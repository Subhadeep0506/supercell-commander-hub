import { queryOptions } from '@tanstack/react-query';
import { getGameData } from './client';
import type { GameRequest } from './game-api';

/**
 * Ported from frontend/src/lib/game-queries.ts. Same query key and the same
 * 60s staleTime; only the function behind it changed from a server function
 * to the fetch client.
 */
export function gameQuery(input: GameRequest) {
  return queryOptions({
    queryKey: ['game-data', input],
    queryFn: () => getGameData(input),
    staleTime: 60000,
  });
}
