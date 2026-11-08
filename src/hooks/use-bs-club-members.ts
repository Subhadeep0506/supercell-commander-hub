import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, type ApiRecord } from '@/api/game-api';

/**
 * Full profiles for a club roster, on demand.
 *
 * `/v1/clubs/{tag}` returns eight scalar fields and a roster of
 * `{tag, name, nameColor, role, trophies, icon}`. There is no club war, club
 * league or club history endpoint in this API at all -- no equivalent of Clash
 * of Clans' war log or Royale's river race -- so without this the Club tab can
 * only restate what the club call already said.
 *
 * Everything worth knowing about a club is therefore a property of its members
 * individually: who is actually progressing, how deep the rosters are, where
 * the Ranked strength sits. Reaching it costs one call per member.
 *
 * **Behind a button, not automatic.** A club caps at 30, so this is up to 30
 * requests; firing them on mount would make the tab slow to settle every
 * single visit for a figure the reader may not have wanted.
 *
 * The 5-minute staleTime is deliberately longer than the app's 60s default.
 * At the default, navigating away and back inside a minute would re-issue all
 * 30 -- the thing the button exists to prevent.
 */

const MEMBER_STALE_MS = 300000;

export type MemberDetail = {
  tag: string;
  /** Unlocked brawlers, out of however many exist. */
  brawlers: number;
  /** Brawlers at power 11. */
  maxed: number;
  prestige: number;
  rankedRankName?: string;
  rankedElo?: number;
  expLevel?: number;
};

export type ClubMembers = {
  /** Fetched details by tag, growing as the pages land. */
  details: Map<string, MemberDetail>;
  /** True once the caller has asked for them. */
  armed: boolean;
  load: () => void;
  loaded: number;
  total: number;
  busy: boolean;
  /** 0-1, for the progress bar. */
  progress: number;
  /** Tags the service refused. A private or deleted account is not an outage. */
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
