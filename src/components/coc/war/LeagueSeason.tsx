import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { warLeagueArt } from '@/assets/capital';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import {
  ROUND_LABELS,
  averageTh,
  buildRounds,
  currentRound,
  thRange,
  warSides,
  type SeasonRound,
} from '@/lib/cwl';
import { useLeagueWars } from '@/hooks/use-league-wars';
import { Chevron } from '@/components/ui/Chevron';
import { Collapsible } from '@/components/ui/Collapsible';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ClanBadge } from '../clan/ClanBits';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { navigate } from '@/navigation/navigationRef';
import { LeagueStandings } from './LeagueStandings';
import { Hall, Scoreboard, ThBar, ThLegend } from './WarBits';

/**
 * A Clan War League season: where the clan is in it, the seven rounds, the
 * table, and who else is in the group.
 *
 * The league *name* ("Gold League II") is not on this response -- the group
 * carries clans and rounds and nothing else -- so it is passed in from the
 * clan record, which is the only place the API reports it.
 */
export function LeagueSeason({
  tag,
  group,
  leagueName,
}: {
  tag: string;
  group: ApiRecord;
  leagueName?: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const { warsByTag, loading, loaded, expected } = useLeagueWars(group);
  const rounds = buildRounds(group, warsByTag);
  const active = currentRound(rounds);

  const mineIn = (war: ApiRecord) => {
    const a = text(record(war['clan'])['tag']).toUpperCase();
    const b = text(record(war['opponent'])['tag']).toUpperCase();
    return a === tag.toUpperCase() || b === tag.toUpperCase();
  };
  const liveWar = (rounds[active]?.wars ?? []).find(mineIn);

  const clans = rows(group['clans']);
  const mine = clans.find((c) => text(c['tag']).toUpperCase() === tag.toUpperCase());
  const badge = warLeagueArt(leagueName);
  const range = thRange(group);

  // Ordered by strength, as the screenshot does -- the table above already
  // answers "who is winning", so this list answers "who is dangerous".
  const ranked = [...clans].sort(
    (a, b) => averageTh(rows(b['members'])) - averageTh(rows(a['members'])),
  );

  return (
    <View style={s.stack}>
      <Panel>
        <View style={s.head}>
          <ClanBadge clan={mine ?? {}} size={58} level />
          <View style={s.headText}>
            <Text style={s.clanName} numberOfLines={1}>
              {text((mine ?? {})['name'])}
            </Text>
            <Text style={s.season}>
              Round {active + 1} of {rounds.length} · {ROUND_LABELS[rounds[active]?.status ?? 'upcoming']}
            </Text>
            <View style={s.leagueChip}>
              {badge ? <Image source={badge} style={s.leagueBadge} resizeMode="contain" /> : null}
              <Text style={s.leagueName} numberOfLines={1}>
                {leagueName ?? 'War league'}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.pips}>
          {rounds.map((round) => (
            <View key={round.index} style={s.pipCell}>
              <View
                style={[
                  s.pip,
                  round.status === 'ended' && s.pipDone,
                  (round.status === 'inWar' || round.status === 'preparation') && s.pipLive,
                ]}
              />
              <Text style={[s.pipLabel, round.index === active && s.pipLabelActive]}>
                {round.index + 1}
              </Text>
            </View>
          ))}
        </View>
      </Panel>

      {liveWar ? (
        <Scoreboard
          war={liveWar}
          clanTag={tag}
          label={`Round ${active + 1} · ${ROUND_LABELS[rounds[active]?.status ?? 'upcoming']}`}
          onPress={() => navigate('CocWarRound', { tag, round: active })}
        />
      ) : null}

      <LeagueStandings
        group={group}
        warsByTag={warsByTag}
        leagueName={leagueName}
        myTag={tag}
        loading={loading}
        loaded={loaded}
        expected={expected}
      />

      <Panel style={s.panel}>
        <Text style={s.title}>Rounds</Text>
        {rounds.map((round) => (
          <RoundRow
            key={round.index}
            round={round}
            active={round.index === active}
            war={round.wars.find(mineIn)}
            clanTag={tag}
            onPress={
              round.warTags.length
                ? () => navigate('CocWarRound', { tag, round: round.index })
                : undefined
            }
          />
        ))}
      </Panel>

      <Panel style={s.panel}>
        <View style={s.clansHead}>
          <Text style={s.title}>Participating Clans</Text>
          <ThLegend high={range.high} low={range.low} />
        </View>

        {ranked.map((clan) => (
          <ClanRow
            key={text(clan['tag'])}
            clan={clan}
            own={text(clan['tag']).toUpperCase() === tag.toUpperCase()}
          />
        ))}
      </Panel>
    </View>
  );
}

/** One row of the seven. Undrawn rounds have nothing to open. */
function RoundRow({
  round,
  active,
  war,
  clanTag,
  onPress,
}: {
  round: SeasonRound;
  active: boolean;
  war?: ApiRecord;
  clanTag: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const sides = war ? warSides(war, clanTag) : undefined;
  const body = (
    <>
      <View style={[s.roundNumber, active && s.roundNumberActive]}>
        <Text style={[s.roundNumberText, active && s.roundNumberTextActive]}>
          {round.index + 1}
        </Text>
      </View>
      {sides ? <ClanBadge clan={sides.them} size={26} level /> : null}
      <View style={s.roundText}>
        <Text style={s.roundTitle} numberOfLines={1}>
          {sides ? text(sides.them['name']) : `Round ${round.index + 1}`}
        </Text>
        <Text style={s.roundStatus}>{ROUND_LABELS[round.status]}</Text>
      </View>
      {sides ? (
        <Text style={s.roundScore}>
          {text(sides.us['stars'] ?? 0)}-{text(sides.them['stars'] ?? 0)}
        </Text>
      ) : null}
      {onPress ? <Text style={s.chevron}>›</Text> : null}
    </>
  );

  if (!onPress) {
    return <View style={[s.round, active && s.roundActive]}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Round ${round.index + 1}`}
      style={[s.round, active && s.roundActive]}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

/** A participating clan, collapsed to a summary and expanded to its roster. */
function ClanRow({ clan, own }: { clan: ApiRecord; own: boolean }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer, openClan } = useDetailSheet();
  const members = rows(clan['members']);
  const avg = averageTh(members);
  const paged = usePaged(members, text(clan['tag']));

  return (
    <View style={[s.clanCard, own && s.clanCardOwn]}>
      <Collapsible
        accessibilityLabel={`Roster of ${text(clan['name'])}`}
        // The bar belongs to the summary, not after the body: dropped below a
        // twenty-row roster it would be a quarter of a screen away from the
        // clan it describes.
        //
        // This summary is two stacked rows, so it draws its own chevron beside
        // the clan name rather than taking Collapsible's, which would centre it
        // against the whole block and leave it floating beside the TH bar.
        chevron={false}
        summary={(open) => (
          <View style={s.clanSummary}>
            <View style={s.clanTop}>
              <ClanBadge clan={clan} size={40} level />
              <View style={s.clanText}>
                <Text style={[s.rowName, own && s.clanNameOwn]} numberOfLines={1}>
                  {text(clan['name'])}
                </Text>
                <Text style={s.clanMeta}>Avg. TH {avg ? avg.toFixed(1) : '—'}</Text>
              </View>
              <Text style={s.clanCount}>{members.length} 👤</Text>
              <Chevron open={open} />
            </View>
            <ThBar members={members} style={s.clanBar} />
          </View>
        )}
      >
        <View style={s.members}>
          {paged.shown.map((member, i) => (
            <Pressable
              key={text(member['tag']) + i}
              accessibilityRole="link"
              accessibilityLabel={`View ${text(member['name'])}`}
              style={s.member}
              onPress={() => openPlayer(text(member['tag']), 'coc')}
            >
              <Hall member={member} size={34} />
              <Text style={s.memberName} numberOfLines={1}>
                {text(member['name'])}
              </Text>
              <Text style={s.memberTag}>{text(member['tag'])}</Text>
            </Pressable>
          ))}
          <LoadMore
            remaining={paged.remaining}
            onPress={paged.loadMore}
            noun="members"
            style={s.more}
          />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${text(clan['name'])}`}
            onPress={() => openClan(text(clan['tag']), 'coc')}
          >
            <Text style={s.clanLink}>Clan profile ›</Text>
          </Pressable>
        </View>
      </Collapsible>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 16 },
    more: { marginVertical: 8, alignSelf: 'flex-start' },
    panel: { padding: 12 },
    title: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },

    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headText: { flex: 1, minWidth: 0 },
    clanName: { fontFamily: t.fonts.display, fontSize: 19, color: t.foreground },
    clanNameOwn: { color: t.cocHighlight },
    season: { marginTop: 4, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    leagueChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    leagueBadge: { width: 18, height: 18 },
    leagueName: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },

    pips: { flexDirection: 'row', gap: 6, marginTop: 18 },
    pipCell: { flex: 1, minWidth: 0, alignItems: 'center' },
    pip: { width: '100%', height: 5, borderRadius: 999, backgroundColor: t.muted },
    pipDone: { backgroundColor: t.primary },
    pipLive: { backgroundColor: t.success },
    pipLabel: { marginTop: 5, fontSize: 9, color: t.mutedForeground, fontFamily: t.fonts.sans },
    pipLabelActive: { color: t.foreground, fontFamily: t.fonts.display },

    round: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    roundActive: { borderColor: t.primary },
    roundNumber: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.border,
    },
    roundNumberActive: { borderColor: t.primary },
    roundNumberText: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    roundNumberTextActive: { color: t.primary },
    roundText: { flex: 1, minWidth: 0 },
    roundTitle: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    roundStatus: { marginTop: 2, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    chevron: { fontSize: 15, color: t.mutedForeground },
    roundScore: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },

    clansHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexWrap: 'wrap',
    },
    clanCard: {
      marginTop: 10,
      padding: 10,
      borderRadius: 8,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    clanCardOwn: { borderColor: t.cocHighlight },
    // A column inside the Collapsible's own row, so the bar stacks under the
    // clan line instead of sitting beside it.
    clanSummary: { flex: 1, minWidth: 0 },
    clanTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    clanText: { flex: 1, minWidth: 0 },
    rowName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    clanMeta: { marginTop: 2, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    clanCount: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    clanBar: { marginTop: 10 },

    members: { gap: 2 },
    member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
    memberName: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    memberTag: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    clanLink: { marginTop: 8, fontFamily: t.fonts.display, fontSize: 10, color: t.primary },
  });
