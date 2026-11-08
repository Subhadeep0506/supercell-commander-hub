import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Collapsible } from '@/components/ui/Collapsible';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { ChipRow } from '@/components/ui/ChipRow';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { BS_STAT, brawlerArt, mapArt, modeArt, rankArt } from '@/assets/brawl';
import { COC_ART } from '@/assets/art';
import { arenaImages } from '@/assets/registry.arena';
import {
  byBrawler,
  byMode,
  isRankedType,
  rankedTierName,
  summarize,
  type Breakdown,
  type NormalBattle,
  type Participant,
} from '@/lib/bs-battles';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BsEmpty, Chip, IconValue, Metric, MetricGrid, Section, num } from './BsBits';

/**
 * The battle log, and everything derived from it.
 *
 * There is no aggregate-stats endpoint in this API, so every figure above the
 * list is computed here from the same ~25-battle window the list shows -- the
 * approach hooks/use-cr-meta.ts already takes for Clash Royale. The window is
 * stated plainly rather than implied, because a 75% win rate over eight decided
 * matches is not the same claim as a 75% win rate.
 */
export function BsBattles({
  battles,
  liveEventIds,
}: {
  battles: NormalBattle[];
  /** `event.id`s currently in rotation, for the "live now" marker. */
  liveEventIds?: Set<number>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [group, setGroup] = useState<'mode' | 'brawler'>('mode');

  const summary = useMemo(() => summarize(battles), [battles]);
  const groups = useMemo(
    () => (group === 'mode' ? byMode(battles) : byBrawler(battles)),
    [battles, group],
  );
  const paged = usePaged(battles, 'battles', 8);

  if (!battles.length) {
    return (
      <BsEmpty
        title="No recent battles"
        body="A new battle can take up to 30 minutes to appear."
      />
    );
  }

  return (
    <>
      <Section title={`Last ${summary.total} battles`}>
        <MetricGrid>
          <Metric
            label="Win rate"
            value={summary.winRate !== undefined ? `${Math.round(summary.winRate * 100)}%` : '—'}
            hint={`${summary.wins}W ${summary.losses}L of ${summary.decided}`}
            icon={BS_STAT.champion}
          />
          <Metric
            label="Trophies"
            value={`${summary.trophyChange > 0 ? '+' : ''}${num(summary.trophyChange)}`}
            hint={summary.trophyCounted < summary.total ? `${summary.trophyCounted} reported` : undefined}
            tint={summary.trophyChange >= 0 ? theme.brawl.heading : theme.destructive}
            icon={BS_STAT.trophy}
          />
          <Metric label="Star player" value={`${summary.starPlayer}×`} icon={BS_STAT.fame} />
          <Metric
            label="Showdowns"
            value={num(summary.showdowns)}
            hint={summary.averageRank ? `avg #${summary.averageRank.toFixed(1)}` : undefined}
            icon={BS_STAT.winsSolo}
          />
        </MetricGrid>
      </Section>

      <Section
        title="Breakdown"
        right={
          <ChipRow
            accessibilityLabel="Group battles by"
            chips={[
              { id: 'mode', label: 'Mode' },
              { id: 'brawler', label: 'Brawler' },
            ]}
            value={group}
            onChange={(id) => setGroup(id as 'mode' | 'brawler')}
          />
        }
      >
        <View style={s.groups}>
          {groups.map((row) => (
            <BreakdownRow key={row.key} row={row} />
          ))}
        </View>
      </Section>

      <Section title="Battles">
        <View style={s.list}>
          {paged.shown.map((battle) => (
            <BattleRow
              key={battle.key}
              battle={battle}
              live={Boolean(battle.eventId && liveEventIds?.has(battle.eventId))}
            />
          ))}
        </View>
        <LoadMore remaining={paged.remaining} onPress={paged.loadMore} size={8} noun="battles" />
      </Section>
    </>
  );
}

function BreakdownRow({ row }: { row: Breakdown }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const art = row.brawlerId !== undefined ? brawlerArt(row.brawlerId) : modeArt(row.modeId);
  return (
    <View style={s.groupRow}>
      {art ? <Image source={art} style={s.groupArt} resizeMode="contain" /> : null}
      <Text style={s.groupLabel} numberOfLines={1}>
        {row.label}
      </Text>
      <Text style={s.groupPlayed}>{row.played}×</Text>
      {/*
        A win rate is only printed where something was decided. Showing "0%"
        for six duo showdowns would read as six losses.
      */}
      <Text style={s.groupRate}>
        {row.decided ? `${Math.round((row.wins / row.decided) * 100)}%` : row.averageRank ? `#${row.averageRank.toFixed(1)}` : '—'}
      </Text>
      <IconValue
        icon={BS_STAT.trophy}
        size={12}
        style={[s.groupDelta, { color: row.trophyChange >= 0 ? theme.brawl.heading : theme.destructive }]}
      >
        {`${row.trophyChange > 0 ? '+' : ''}${row.trophyChange}`}
      </IconValue>
    </View>
  );
}

function BattleRow({ battle, live }: { battle: NormalBattle; live: boolean }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const won = battle.result === 'victory';
  const lost = battle.result === 'defeat';
  const outcome = battle.result
    ? won
      ? 'Victory'
      : lost
        ? 'Defeat'
        : 'Draw'
    : battle.rank !== undefined
      ? `Rank ${battle.rank}`
      : '—';

  return (
    <View style={[s.battle, won && s.battleWon, lost && s.battleLost]}>
      <Collapsible
        accessibilityLabel={`${battle.modeLabel} on ${battle.mapName}, ${outcome}`}
        summary={() => (
          <View style={s.battleHead}>
            {modeArt(battle.eventModeId) ? (
              <Image source={modeArt(battle.eventModeId)!} style={s.battleMode} resizeMode="contain" />
            ) : null}
            <View style={s.battleText}>
              <View style={s.battleTitleRow}>
                {/*
                  "Trophies" / "Ranked", not the API's own word -- `type:
                  "ranked"` is the trophy ladder. See battleTypeLabel.
                */}
                <Text style={s.battleType}>{battle.typeLabel}</Text>
                <Text style={s.battleDot}>·</Text>
                <Text style={s.battleMode2} numberOfLines={1}>
                  {battle.modeLabel}
                </Text>
                {live ? <Chip label="Live now" /> : null}
              </View>
              <Text style={s.battleMap} numberOfLines={1}>
                {battle.mapName || 'Unknown map'}
                {battle.at ? ` · ${battle.at.toLocaleString()}` : ''}
              </Text>
            </View>
            <View style={s.battleScore}>
              <Text style={[s.battleOutcome, won && s.won, lost && s.lost]}>{outcome}</Text>
              {/*
                Nothing at all for a Ranked match. It moves your tier, not your
                trophies, so there is no delta to be missing -- the dash below
                read as absent data when in fact no such number exists. Each
                player's tier is on their own row instead.

                Everywhere else an absent trophyChange is still a dash, never a
                zero: two of the 23 captured battles simply do not report one,
                and "0" would claim the match was worth nothing. No trophy icon
                on that dash either -- it means "the service did not say", and
                an icon beside it would read as a figure.
              */}
              {isRankedType(battle.type) ? null : (
                <IconValue
                  icon={battle.trophyChange === undefined ? undefined : BS_STAT.trophy}
                  size={12}
                  style={s.battleDelta}
                >
                  {battle.trophyChange === undefined
                    ? '—'
                    : `${battle.trophyChange > 0 ? '+' : ''}${battle.trophyChange}`}
                </IconValue>
              )}
            </View>
          </View>
        )}
      >
        <BattleDetail battle={battle} />
      </Collapsible>
    </View>
  );
}

function BattleDetail({ battle }: { battle: NormalBattle }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();

  return (
    <View style={s.detail}>
      {/*
        The real map render, bundled rather than fetched. Falls back to the
        mode icon only for a map added to the game since the last
        `bun run fetch:bs-assets` -- not, as it used to, on every single
        battle because the CDN was unreachable.
      */}
      {/*
        Contained, not cropped. Map renders have no common aspect ratio -- the
        three in the capture are 0.64, 1.00 and 0.66 -- so a fixed-height
        `cover` slices the middle out of every portrait map and loses the
        layout, which is the only reason to show a map at all. The frame
        letterboxes instead, so the shape reads as deliberate.
      */}
      <View style={s.mapFrame}>
        <Image
          source={mapArt(battle.eventId) ?? modeArt(battle.eventModeId) ?? arenaImages.brawlmaps}
          style={s.map}
          resizeMode="contain"
          accessibilityLabel={battle.mapName}
        />
      </View>

      <View style={s.detailMeta}>
        {/*
          The clock is Clash of Clans art. Brawl Stars publishes no clock icon
          in any source -- not Brawlify, not the fan kit -- and this is the one
          place in the Brawl screens that borrows from another game.
        */}
        {battle.duration !== undefined ? (
          <Chip label={`${battle.duration}s`} tone="muted" icon={COC_ART['clock']} />
        ) : null}
        {battle.starPlayer ? (
          <Chip
            label={battle.starPlayer.name}
            tone={battle.isStarPlayer ? 'accent' : 'muted'}
            icon={BS_STAT.fame}
          />
        ) : null}
      </View>

      {battle.teams.map((team, index) => {
        /*
         * "Your team" is whichever entry holds your tag, not teams[0].
         *
         * Team order is arbitrary in this API -- the capture has the player in
         * teams[1] on one battle, and teams[0] losing on another -- so an
         * index-based assumption here silently swaps the two sides.
         */
        const isMine = index === battle.myTeamIndex;
        return (
          <View key={index} style={[s.team, isMine && s.teamMine]}>
            {battle.shape === 'team' ? (
              <Text style={s.teamLabel}>{isMine ? 'Your team' : 'Opponents'}</Text>
            ) : null}
            {team.map((player) => (
              <PlayerLine
                key={player.tag || player.name}
                player={player}
                me={player.tag === battle.me?.tag}
                place={battle.shape === 'showdown' ? index + 1 : undefined}
                onPress={() => player.tag && openPlayer(player.tag, 'bs')}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function PlayerLine({
  player,
  me,
  place,
  onPress,
}: {
  player: Participant;
  me: boolean;
  place?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${player.name}, ${player.brawlerName}`}
      onPress={onPress}
      style={[s.player, me && s.playerMe]}
    >
      {place !== undefined ? <Text style={s.place}>#{place}</Text> : null}
      {brawlerArt(player.brawlerId) ? (
        <Image source={brawlerArt(player.brawlerId)!} style={s.playerBrawler} resizeMode="contain" />
      ) : null}
      <View style={s.playerText}>
        {/*
          No nameColor here: battle participants carry none, unlike club
          members and ranking rows.
        */}
        <Text style={[s.playerName, me && s.playerNameMe]} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={s.playerBrawlerName} numberOfLines={1}>
          {player.brawlerName}
          {player.power !== undefined ? ` · P${player.power}` : ''}
        </Text>
      </View>
      {/*
        Trophies or a Ranked tier, never both -- the service sends them under
        the same key and only the battle type tells them apart, which
        `normalize` has already resolved.

        A rank behind a trophy cup was the bug this fixes: every player in a
        Ranked match showed a cup and "1", which is Bronze I, not one trophy.
      */}
      {player.rankedRank !== undefined ? (
        <IconValue
          icon={rankArt(rankedTierName(player.rankedRank))}
          size={14}
          style={s.playerRank}
        >
          {rankedTierName(player.rankedRank) ?? '—'}
        </IconValue>
      ) : player.trophies !== undefined ? (
        <IconValue icon={BS_STAT.trophy} size={12} style={s.playerTrophies}>
          {num(player.trophies)}
        </IconValue>
      ) : null}
    </Pressable>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    groups: { gap: 4 },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: t.radius.md,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    // Mode art is opaque square tile art, so it needs the corners taken off.
    groupArt: { width: 26, height: 26, borderRadius: t.radius.sm },
    groupLabel: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    groupPlayed: { width: 34, textAlign: 'right', fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    groupRate: { width: 44, textAlign: 'right', fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    groupDelta: { width: 44, textAlign: 'right', fontFamily: t.fonts.display, fontSize: 12 },
    list: { gap: 6 },
    battle: {
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderLeftWidth: 3,
      borderLeftColor: t.border,
      paddingHorizontal: 8,
    },
    battleWon: { borderLeftColor: t.brawl.highlight },
    battleLost: { borderLeftColor: t.destructive },
    battleHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, flex: 1 },
    battleMode: { width: 30, height: 30, borderRadius: t.radius.sm },
    battleText: { flex: 1, minWidth: 0 },
    battleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    battleType: { fontFamily: t.fonts.display, fontSize: 10, color: t.brawl.heading },
    battleDot: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    battleMode2: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    battleMap: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground, marginTop: 2 },
    battleScore: { alignItems: 'flex-end' },
    battleOutcome: { fontFamily: t.fonts.display, fontSize: 11, color: t.mutedForeground },
    won: { color: t.brawl.highlight },
    lost: { color: t.destructive },
    battleDelta: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    detail: { gap: 8, paddingBottom: 10 },
    mapFrame: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: t.radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    map: { width: '100%', height: 200, borderRadius: t.radius.md },
    detailMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    team: { gap: 3, padding: 6, borderRadius: t.radius.md },
    teamMine: { backgroundColor: t.card },
    teamLabel: { fontFamily: t.fonts.display, fontSize: 10, color: t.brawl.heading },
    player: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    playerMe: { opacity: 1 },
    place: { width: 26, fontFamily: t.fonts.display, fontSize: 11, color: t.mutedForeground },
    playerBrawler: { width: 28, height: 28 },
    playerText: { flex: 1, minWidth: 0 },
    playerName: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    playerNameMe: { color: t.brawl.heading },
    playerBrawlerName: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    playerTrophies: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    // A tier is a word rather than a figure, so it takes the display face and
    // the accent the other ranked badges on these screens use.
    playerRank: { fontFamily: t.fonts.display, fontSize: 10, color: t.brawl.heading },
  });
