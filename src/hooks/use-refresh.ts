import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Pull-to-refresh, for any screen.
 *
 * Every request in the app goes through `gameQuery`, which keys on
 * `['game-data', input]` -- so one prefix refetches the lot: the player, the
 * clan, the war, the chest track, the battle log, the event rotation. A screen
 * does not have to enumerate what it is showing, which is what kept this from
 * being written per-screen seventeen times.
 *
 * `type: 'active'` limits it to queries something is currently subscribed to.
 * Without it a pull would also refetch every account visited earlier in the
 * session, which is a request storm nobody asked for.
 *
 * `refetchQueries` ignores `staleTime`, so a pull always reaches the network
 * even if the 60s window has not expired. That is the point of the gesture:
 * the user is saying they do not believe what is on screen.
 */
export function useRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ queryKey: ['game-data'], type: 'active' });
    } finally {
      // A failed refetch must still clear the spinner: the error surfaces
      // through each query's own error state, and a stuck spinner reads as a
      // hang rather than as a failure.
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, onRefresh };
}
