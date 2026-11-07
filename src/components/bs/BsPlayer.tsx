import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { record, text, type ApiRecord } from '@/api/game-api';
import { Meter } from '@/components/ui/Meter';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { BS_STAT, clubBadgeArt, playerIconArt, rankArt } from '@/assets/brawl';
import { arenaImages } from '@/assets/registry.arena';
import { nextRank, rankBand, rankProgress } from '@/lib/bs-brawlers';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Chip, Metric, MetricGrid, Section, nameTint, num } from './BsBits';

/**
 * Robo Rumble difficulty names.
 *
 * **`bestRoboRumbleTime` is not a time.** Robo Rumble is level-based -- Normal,
 * Hard, Expert, Master, then Insane I through XVI, one step per successful
 * defence -- and the field is the furthest level reached. The "Time" in the
 * name is a leftover from an earlier version of the mode.
 *
 * The captures settle it: 6 on a level-216 veteran with 10,836 3v3 wins, 1 and
 * 0 on two weaker accounts. As seconds those are nonsense; as levels they are
 * Insane II, Normal and never-cleared. Supercell documents no unit, so this is
 * the consistent community reading plus our own data rather than an official
 * mapping.
 *
 * `bestTimeAsBigBrawler`, immediately beside it, genuinely *is* seconds -- Big
 * Game runs a two-minute round, so it is 0-120. Two adjacent fields, two
 * different units; labelling them the same way is the trap.
 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
function roboRumbleLevel(value: unknown): string {
  if (typeof value !== 'number' || value <= 0) return 'None';
  const named = ['Normal', 'Hard', 'Expert', 'Master'];
  if (value <= named.length) return named[value - 1]!;
  return `Insane ${ROMAN[value - named.length - 1] ?? value - named.length}`;
}

/**
 * Accounts the service answers for but has no data on.
 *
 * A battle opponent can come back with zero trophies, `expLevel: 1`, a single
 * brawler and `club: {}` even though the battle log just showed them at 1,267
 * trophies on a power-10 Dynamike -- that exact pair is in the v2 capture.
 * It is a real 200, not an error, and without a word of explanation it reads
 * as our bug rather than as a reset or banned account.
 */
const isGhost = (player: ApiRecord): boolean =>
  player['trophies'] === 0 && typeof player['expLevel'] === 'number' && player['expLevel'] <= 1;

export function BsPlayer({ player, tag }: { player: ApiRecord; tag: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();

  const club = record(player['club']);
  // `club` is an empty object rather than a missing key on an account with no
  // club, so the tag has to be tested rather than the object.
  const clubTag = typeof club['tag'] === 'string' ? club['tag'] : '';
  const tint = nameTint(player['nameColor']);
  const ghost = isGhost(player);

  const rank = player['rankedRank'];
  const band = rankBand(rank);
  const progress = rankProgress(rank, player['rankedElo']);
  const next = nextRank(rank);
  // The API shouts its rank names ("GOLD I"); the art is keyed by family.
  const rankName = typeof player['rankedRankName'] === 'string' ? player['rankedRankName'] : band?.name;

  return (
    <View style={s.stack}>
      <View style={s.header}>
        <Image source={playerIconArt(record(player['icon'])['id']) ?? arenaImages.bsicon} style={s.avatar} resizeMode="contain" />
        <View style={s.headerText}>
          <Text style={[s.name, tint ? { color: tint } : null]} numberOfLines={1}>
            {text(player['name'])}
          </Text>
          <Text style={s.tag}>{text(player['tag']) !== '—' ? text(player['tag']) : tag}</Text>
          <View style={s.headerChips}>
            <Chip label={`Level ${num(player['expLevel'])}`} tone="muted" />
            {clubTag ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Club ${text(club['name'])}`}
                onPress={() => openClan(clubTag, 'bs')}
                style={s.clubChip}
              >
                <Image source={clubBadgeArt(club['badgeId']) ?? arenaImages.bsicon} style={s.clubBadge} resizeMode="contain" />
                <Text style={s.clubName} numberOfLines={1}>
                  {text(club['name'])}
                </Text>
              </Pressable>
            ) : (
              <Chip label="No club" tone="muted" />
            )}
          </View>
        </View>
      </View>

      {ghost ? (
        <View style={s.ghost}>
          <Text style={s.ghostTitle}>This account reads as reset or inactive</Text>
          <Text style={s.ghostBody}>The service returns zeros for it.</Text>
        </View>
      ) : null}

      <Section title="Trophies">
        <MetricGrid>
          <Metric label="Trophies" value={num(player['trophies'])} icon={BS_STAT.trophy} />
          <Metric
            label="Personal best"
            value={num(player['highestTrophies'])}
            icon={BS_STAT.trophy}
          />
          <Metric
            label="Prestige"
            value={num(player['totalPrestigeLevel'])}
            hint="across all brawlers"
            icon={BS_STAT.prestige}
          />
        </MetricGrid>
      </Section>

      <Section
        title="Ranked"
        right={rankName ? <Chip label={`Season ${num(player['rankedSeasonId'])}`} tone="muted" /> : undefined}
      >
        <View style={s.rankRow}>
          {rankArt(rankName) ? (
            <Image source={rankArt(rankName)!} style={s.rankBadge} resizeMode="contain" />
          ) : null}
          <View style={s.rankText}>
            <Text style={s.rankName}>{rankName ?? 'Unranked'}</Text>
            <Text style={s.rankElo}>{num(player['rankedElo'])} Elo</Text>
          </View>
        </View>
        {/*
          No meter at the top of the ladder: Pro carries `maxElo: 0` to mean
          "no ceiling", and a bar that is always full says less than none.
        */}
        {progress !== undefined && next ? (
          <View style={s.rankMeter}>
            {/* `progress` is a 0-1 fraction; Meter defaults to a 0-100 scale. */}
            <Meter value={progress} max={1} fill={theme.brawl.highlight} />
            <Text style={s.rankMeterLabel}>
              {num((band?.maxElo ?? 0) + 1 - Number(player['rankedElo'] ?? 0))} Elo to {next.name}
            </Text>
          </View>
        ) : null}
        <MetricGrid>
          <Metric
            label="Season best"
            value={text(player['highestSeasonRankedRankName']) !== '—' ? text(player['highestSeasonRankedRankName']) : '—'}
            hint={`${num(player['highestSeasonRankedElo'])} Elo`}
            icon={rankArt(player['highestSeasonRankedRankName'])}
          />
          <Metric
            label="All-time best"
            value={text(player['highestAllTimeRankedRankName']) !== '—' ? text(player['highestAllTimeRankedRankName']) : '—'}
            hint={`${num(player['highestAllTimeRankedElo'])} Elo`}
            icon={rankArt(player['highestAllTimeRankedRankName'])}
          />
        </MetricGrid>
      </Section>

      <Section title="Victories">
        <MetricGrid>
          {/*
            Gem Grab stands in for 3v3: it is a category rather than a mode, so
            no 3v3 icon exists. See BS_STAT.
          */}
          <Metric label="3 vs 3" value={num(player['3vs3Victories'])} icon={BS_STAT.wins3v3} />
          <Metric label="Solo" value={num(player['soloVictories'])} icon={BS_STAT.winsSolo} />
          <Metric label="Duo" value={num(player['duoVictories'])} icon={BS_STAT.winsDuo} />
        </MetricGrid>
      </Section>

      <Section title="Milestones">
        <MetricGrid>
          <Metric
            label="Fame"
            value={num(player['fame'])}
            hint={text(player['fameTierName']) !== '—' ? text(player['fameTierName']) : undefined}
            icon={BS_STAT.fame}
          />
          <Metric
            label="Experience"
            value={num(player['expPoints'])}
            hint="points"
            icon={BS_STAT.xp}
          />
          {/*
            Two adjacent fields, two different units. See roboRumbleLevel.
          */}
          <Metric
            label="Robo Rumble"
            value={roboRumbleLevel(player['bestRoboRumbleTime'])}
            hint="best level"
            icon={BS_STAT.roboRumble}
          />
          <Metric
            label="Big Brawler"
            value={
              typeof player['bestTimeAsBigBrawler'] === 'number' && player['bestTimeAsBigBrawler'] > 0
                ? `${player['bestTimeAsBigBrawler']}s`
                : '—'
            }
            hint="best survival"
            icon={BS_STAT.bigBrawler}
          />
          <Metric
            label="Championship"
            value={player['isQualifiedFromChampionshipChallenge'] === true ? 'Qualified' : 'No'}
            icon={BS_STAT.champion}
          />
        </MetricGrid>
      </Section>
    </View>
  );
}

/** The roster row and leaderboard row share this; it is not Home-only. */
export function BsPlayerRow({
  name,
  nameColor,
  subtitle,
  iconId,
  score,
  onPress,
  leading,
  trailing,
}: {
  name: string;
  nameColor?: unknown;
  subtitle?: string;
  iconId?: unknown;
  score?: unknown;
  onPress?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const tint = nameTint(nameColor);
  const Row = onPress ? Pressable : View;
  return (
    <Row
      {...(onPress ? { onPress, accessibilityRole: 'button' as const, accessibilityLabel: name } : {})}
      style={s.row}
    >
      {leading}
      <Image source={playerIconArt(iconId) ?? arenaImages.bsicon} style={s.rowIcon} resizeMode="contain" />
      <View style={s.rowText}>
        <Text style={[s.rowName, tint ? { color: tint } : null]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={s.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (score !== undefined ? <Text style={s.rowScore}>{num(score)}</Text> : null)}
    </Row>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 12 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      backgroundColor: t.card,
      borderRadius: t.radius.xl,
      // Matches Section: one 2px purple rim, no plate shadow.
      borderWidth: 2,
      borderColor: t.chrome.bs.rim,
    },
    avatar: { width: 60, height: 60, borderRadius: t.radius.lg },
    headerText: { flex: 1, minWidth: 0, gap: 3 },
    name: { fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    tag: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    headerChips: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
    clubChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: t.radius.pill,
      backgroundColor: t.brawl.chip,
      maxWidth: 180,
    },
    clubBadge: { width: 16, height: 16, borderRadius: 4 },
    clubName: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 10, color: t.brawl.onChip },
    ghost: {
      padding: 12,
      gap: 4,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    ghostTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    ghostBody: { fontFamily: t.fonts.sans, fontSize: 11, lineHeight: 16, color: t.mutedForeground },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rankBadge: { width: 52, height: 52 },
    rankText: { flex: 1, minWidth: 0 },
    rankName: { fontFamily: t.fonts.display, fontSize: 17, color: t.foreground },
    rankElo: { fontFamily: t.fonts.sans, fontSize: 12, color: t.mutedForeground },
    rankMeter: { gap: 4 },
    rankMeterLabel: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    rowIcon: { width: 32, height: 32, borderRadius: t.radius.md },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    rowSub: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    rowScore: { fontFamily: t.fonts.display, fontSize: 14, color: t.brawl.heading },
  });
