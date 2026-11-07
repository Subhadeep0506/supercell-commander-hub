import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, type ApiRecord, type GameResult } from '@/api/game-api';
import { SkeletonBlock, Spinner } from '@/components/ui/Shimmer';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Source } from '../CocBits';
import { EmptyState } from '../clan/ClanBits';
import { LeagueSeason } from './LeagueSeason';
import { WarDetail } from './WarDetail';

type WarTab = 'war' | 'league';

/**
 * The War screen's two halves.
 *
 * They are genuinely separate wars on genuinely separate endpoints, and the
 * clan is almost never in both: `clans/{tag}/currentwar` answers `notInWar`
 * for the whole of a league season, which is why a clan in CWL used to see
 * "no active war" and nothing else.
 *
 * The tab that is live is selected on arrival; once the user picks one, that
 * choice stands.
 */
export function WarTabs({ tag, warResult }: { tag: string; warResult?: GameResult }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [chosen, setChosen] = useState<WarTab>();
  const war = parsed(warResult);

  const { data: groupResult, isFetching: groupBusy } = useQuery(
    gameQuery({ game: 'coc', resource: 'leagueGroup', tag }),
  );
  // The league name lives on the clan record and nowhere else; the group has
  // clans and rounds only. Usually already cached from the clan screen.
  const { data: clanResult } = useQuery(gameQuery({ game: 'coc', resource: 'clan', tag }));

  const group = parsed(groupResult);
  const clan = parsed(clanResult);
  const leagueName = clan ? asName(record(clan['warLeague'])['name']) : undefined;

  const inLeague = Boolean(group) && group!['state'] !== 'notInWar';
  const inWar = Boolean(war) && war!['state'] !== 'notInWar';
  const privateLog = warResult?.ok === false && warResult.status === 403;
  const tab: WarTab = chosen ?? (inLeague ? 'league' : 'war');

  return (
    <View style={s.stack}>
      <Tabs
        tone="coc"
        value={tab}
        onChange={setChosen}
        tabs={[
          { id: 'war' as const, label: 'Current War' },
          { id: 'league' as const, label: 'War League' },
        ]}
      />

      {tab === 'war' ? (
        inWar ? (
          <View>
            <WarDetail war={war!} clanTag={tag} />
            {warResult ? <Source result={warResult} /> : null}
          </View>
        ) : (
          <View style={s.fill}>
            {/*
              A clan that keeps its war log private answers 403 here even while
              a war is running, which is a setting rather than a fault and gets
              its own explanation -- the same treatment the clan war history
              gets.
            */}
            <EmptyState
              title={privateLog ? 'This war is private' : 'No active war'}
              body={
                privateLog
                  ? 'This clan keeps its war log hidden, so the live board is only visible to its own members.'
                  : inLeague
                    ? 'This clan is in Clan War League, so it has no regular war running. The War League tab has the season.'
                    : 'This clan is not in a regular war right now. Start one and the live board appears here.'
              }
            />
            {warResult && !warResult.ok && warResult.status !== 403 ? (
              <Source result={warResult} />
            ) : null}
          </View>
        )
      ) : group && inLeague ? (
        <View>
          {/*
            A refetch over a warm cache keeps the season on screen and marks
            itself with a spinner. It used to replace the whole tab with a line
            of text that appeared and vanished faster than it could be read,
            which is what made a cached load look like a glitch.
          */}
          {groupBusy ? <Spinner label="Refreshing…" style={s.refreshing} /> : null}
          <LeagueSeason tag={tag} group={group} leagueName={leagueName} />
        </View>
      ) : groupBusy && !group ? (
        <SkeletonBlock height={140} label="Loading war league" />
      ) : (
        <View style={s.fill}>
          <EmptyState
            title="Not in war league"
            body="Clan War League runs for the first week of each month."
          />
          {/* A 404 is the API's way of saying "no league group", not a fault,
              so it must not raise the service-error box. Anything else is
              worth showing. */}
          {groupResult && !groupResult.ok && groupResult.status !== 404 ? (
            <Source result={groupResult} />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** `warLeague.name` is a string or absent; `text()` would yield an em dash. */
function asName(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function parsed(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

const build = (_t: Theme) =>
  StyleSheet.create({
    stack: { gap: 16 },
    fill: { flex: 1 },
    refreshing: { paddingBottom: 12 },
  });
