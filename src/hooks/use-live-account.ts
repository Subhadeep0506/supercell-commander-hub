import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { normalizeTag, record, type Game, type GameRequest } from '@/api/game-api';
import { useHub } from '@/state/HubProvider';


export function useLiveAccount(
  game: Game,
  resource: 'player' | 'clan' | 'war',
  initialTag = '',
) {
  const { passport, ready } = useHub();
  const [override, setOverride] = useState(initialTag);
  const savedTag = passport[game];

  const player = useQuery({
    ...gameQuery({ game, resource: 'player', tag: savedTag }),
    enabled: ready && Boolean(savedTag) && resource !== 'player' && !override,
  });

  const savedPlayer = player.data?.ok ? record(JSON.parse(player.data.data)) : {};
  const clan = record(savedPlayer['clan'] ?? savedPlayer['club']);
  const target =
    override ||
    (resource === 'player' ? savedTag : typeof clan['tag'] === 'string' ? clan['tag'] : '');

  const result = useQuery({
    ...gameQuery({ game, resource, tag: target }),
    enabled: ready && Boolean(target),
  });

  const input: GameRequest = { game, resource, tag: target };

  return {
    result:
      result.data ??
      (!override && resource !== 'player' && player.data && !player.data.ok
        ? player.data
        : undefined),
    busy: result.isFetching || player.isFetching || !ready,
    target,
    input,
    load: (tag: string) => setOverride(normalizeTag(tag)),
    refresh: result.refetch,
    error: result.error ?? player.error,
    saved: Boolean(savedTag) && !override,
  };
}
