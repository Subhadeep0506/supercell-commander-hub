import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, type ApiRecord } from '@/api/game-api';



const MEMBER_STALE_MS = 300000;

export type MemberDetail = {
  tag: string;

  brawlers: number;

  maxed: number;
  prestige: number;
  rankedRankName?: string;
  rankedElo?: number;
  expLevel?: number;
};

export type ClubMembers = {

  details: Map<string, MemberDetail>;

  armed: boolean;
  load: () => void;
  loaded: number;
  total: number;
  busy: boolean;

  progress: number;

  failed: string[];
};

export function useBsClubMembers(members: ApiRecord[]): ClubMembers {
  const [armed, setArmed] = useState(false);

  const tags = useMemo(
    () =>
      members
        .map((m) => (typeof m['tag'] === 'string' ? m['tag'] : ''))
        .filter(Boolean)
        // A club holds 30. The slice is a guard against a shape change rather
        // than an expected trim.
        .slice(0, 30),
    [members],
  );

  const results = useQueries({
    queries: tags.map((tag) => ({
      ...gameQuery({ game: 'bs', resource: 'player', tag }),
      enabled: armed,
      staleTime: MEMBER_STALE_MS,
    })),
  });

  return useMemo(() => {
    const details = new Map<string, MemberDetail>();
    const failed: string[] = [];
    let loaded = 0;

    /*
     * Nothing is reported until the caller actually asks.
     *
     * `enabled: false` stops a *fetch*, but useQuery still hands back whatever
     * is already in the cache -- and one of these tags is usually the signed-in
     * player, whose profile the Home screen fetched a moment ago. Without this
     * guard the club panel showed an "average brawler count" computed from the
     * single member who happened to be cached, before the button was pressed.
     */
    if (!armed) {
      return {
        details,
        armed,
        load: () => setArmed(true),
        loaded: 0,
        total: tags.length,
        busy: false,
        progress: 0,
        failed,
      };
    }

    results.forEach((result, index) => {
      const tag = tags[index]!;
      const data = result.data;
      if (!data) return;
      loaded++;
      if (!data.ok) {
        failed.push(tag);
        return;
      }
      const player = record(JSON.parse(data.data));
      const brawlers = rows(player['brawlers']);
      details.set(tag, {
        tag,
        brawlers: brawlers.length,
        maxed: brawlers.filter((b) => b['power'] === 11).length,
        prestige: typeof player['totalPrestigeLevel'] === 'number' ? player['totalPrestigeLevel'] : 0,
        rankedRankName:
          typeof player['rankedRankName'] === 'string' ? player['rankedRankName'] : undefined,
        rankedElo: typeof player['rankedElo'] === 'number' ? player['rankedElo'] : undefined,
        expLevel: typeof player['expLevel'] === 'number' ? player['expLevel'] : undefined,
      });
    });

    return {
      details,
      armed,
      load: () => setArmed(true),
      loaded,
      total: tags.length,
      busy: armed && results.some((r) => r.isFetching),
      progress: tags.length ? loaded / tags.length : 0,
      failed,
    };
  }, [results, tags, armed]);
}
