import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { Button } from '@/components/ui/Button';
import { Meter } from '@/components/ui/Meter';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { BS_STAT, clubBadgeArt, rankArt } from '@/assets/brawl';
import { arenaImages } from '@/assets/registry.arena';
import { useBsClubMembers, type MemberDetail } from '@/hooks/use-bs-club-members';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BsPlayerRow } from './BsPlayer';
import { Chip, Metric, MetricGrid, Section, num } from './BsBits';

/** `member` / `senior` / `vicePresident` / `president` -- all four are live. */
const ROLE_LABEL: Record<string, string> = {
  president: 'President',
  vicePresident: 'Vice President',
  senior: 'Senior',
  member: 'Member',
};
const ROLE_ORDER = ['president', 'vicePresident', 'senior', 'member'];

const TYPE_LABEL: Record<string, string> = {
  open: 'Open',
  inviteOnly: 'Invite only',
  closed: 'Closed',
};

export function BsClub({ club }: { club: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();

  // `members` is already inside this response. `/v1/clubs/{tag}/members`
  // returns byte for byte the same array and a club caps at 30, so its paging
  // never engages -- asking for it would be a second call for nothing.
  const members = useMemo(() => rows(club['members']), [club]);
  const roster = useBsClubMembers(members);

  const sorted = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          ROLE_ORDER.indexOf(String(a['role'])) - ROLE_ORDER.indexOf(String(b['role'])) ||
          (typeof b['trophies'] === 'number' ? b['trophies'] : 0) -
            (typeof a['trophies'] === 'number' ? a['trophies'] : 0),
      ),
    [members],
  );

  const required = typeof club['requiredTrophies'] === 'number' ? club['requiredTrophies'] : 0;
  const totals = useMemo(() => {
    const got = [...roster.details.values()];
    if (!got.length) return undefined;
    return {
      brawlers: Math.round(got.reduce((n, d) => n + d.brawlers, 0) / got.length),
      maxed: got.reduce((n, d) => n + d.maxed, 0),
      prestige: got.reduce((n, d) => n + d.prestige, 0),
      level: Math.round(got.reduce((n, d) => n + (d.expLevel ?? 0), 0) / got.length),
    };
  }, [roster.details]);

  return (
    <>
      <View style={s.banner}>
        <Image
          source={clubBadgeArt(club['badgeId']) ?? arenaImages.bsicon}
          style={s.badge}
          resizeMode="contain"
        />
        <View style={s.bannerText}>
          <Text style={s.name} numberOfLines={1}>
            {text(club['name'])}
          </Text>
          <Text style={s.tag}>{text(club['tag'])}</Text>
          <View style={s.bannerChips}>
            <Chip label={TYPE_LABEL[String(club['type'])] ?? text(club['type'])} />
            <Chip label={`${members.length}/30`} tone="muted" />
            {club['isFamilyFriendly'] === true ? <Chip label="Family friendly" tone="muted" /> : null}
          </View>
        </View>
      </View>

      {typeof club['description'] === 'string' && club['description'].trim() ? (
        <Text style={s.description}>{club['description']}</Text>
      ) : null}

      <Section title="Club">
        <MetricGrid>
          <Metric label="Trophies" value={num(club['trophies'])} icon={BS_STAT.trophy} />
          <Metric
            label="Required"
            value={num(required)}
            hint="to join"
            icon={BS_STAT.trophy}
          />
          <Metric
            label="Average"
            value={num(
              members.length
                ? Math.round(
                    members.reduce(
                      (n, m) => n + (typeof m['trophies'] === 'number' ? m['trophies'] : 0),
                      0,
                    ) / members.length,
                  )
                : 0,
            )}
            hint="per member"
            icon={BS_STAT.trophy}
          />
        </MetricGrid>
      </Section>

      {/*
        A refused member is not an outage -- the account may be deleted, or the
        service may simply have declined that one -- so it is a chip beside the
        loaded count rather than a paragraph under the roster.
      */}
      <Section
        title="Members"
        right={
          roster.armed ? (
            <>
              <Chip label={`${roster.loaded}/${roster.total}`} tone="muted" />
              {roster.failed.length ? (
                <Chip label={`${roster.failed.length} unread`} tone="muted" />
              ) : null}
            </>
          ) : undefined
        }
      >
        {!roster.armed ? (
          <View style={s.load}>
            <Text style={s.loadHint}>
              Brawler counts, power 11s and Ranked tier need one request per member — up to{' '}
              {roster.total}.
            </Text>
            <Button onPress={roster.load}>Load member details</Button>
          </View>
        ) : roster.busy ? (
          <View style={s.load}>
            <Meter value={roster.progress} max={1} fill={theme.brawl.highlight} />
            <Text style={s.loadHint}>
              Reading {roster.loaded} of {roster.total} profiles…
            </Text>
          </View>
        ) : null}

        {totals ? (
          <MetricGrid>
            <Metric label="Avg brawlers" value={num(totals.brawlers)} icon={BS_STAT.brawler} />
            <Metric
              label="Power 11s"
              value={num(totals.maxed)}
              hint="club total"
              icon={BS_STAT.power}
            />
            <Metric
              label="Prestige"
              value={num(totals.prestige)}
              hint="club total"
              icon={BS_STAT.prestige}
            />
            <Metric label="Avg level" value={num(totals.level)} icon={BS_STAT.xp} />
          </MetricGrid>
        ) : null}

        <View style={s.roster}>
          {sorted.map((member) => {
            const tag = text(member['tag']);
            return (
              <BsPlayerRow
                key={tag}
                name={text(member['name'])}
                nameColor={member['nameColor']}
                iconId={record(member['icon'])['id']}
                subtitle={subtitleFor(member, roster.details.get(tag))}
                score={member['trophies']}
                onPress={() => openPlayer(tag, 'bs')}
                trailing={
                  <View style={s.rowTrailing}>
                    <Text style={s.rowTrophies}>{num(member['trophies'])}</Text>
                    <RankMark detail={roster.details.get(tag)} />
                  </View>
                }
              />
            );
          })}
        </View>

      </Section>
    </>
  );
}

function subtitleFor(member: ApiRecord, detail?: MemberDetail): string {
  const role = ROLE_LABEL[String(member['role'])] ?? text(member['role']);
  if (!detail) return role;
  return `${role} · ${detail.brawlers} brawlers · ${detail.maxed}× P11`;
}

function RankMark({ detail }: { detail?: MemberDetail }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (!detail?.rankedRankName) return null;
  const art = rankArt(detail.rankedRankName);
  return (
    <View style={s.rankMark}>
      {art ? <Image source={art} style={s.rankArt} resizeMode="contain" /> : null}
      <Text style={s.rankText}>{detail.rankedRankName}</Text>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    banner: {
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
    // A club badge is a transparent crest, but the fallback when one is
    // missing is `bsicon` -- a full-bleed square. The radius is for that.
    badge: { width: 56, height: 56, borderRadius: t.radius.lg },
    bannerText: { flex: 1, minWidth: 0, gap: 3 },
    name: { fontFamily: t.fonts.display, fontSize: 19, color: t.foreground },
    tag: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    bannerChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 3 },
    description: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 18,
      color: t.mutedForeground,
      paddingHorizontal: 4,
    },
    load: { gap: 8, paddingVertical: 4 },
    loadHint: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    roster: { gap: 6 },
    rowTrailing: { alignItems: 'flex-end', gap: 2 },
    rowTrophies: { fontFamily: t.fonts.display, fontSize: 13, color: t.brawl.highlight },
    rankMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    rankArt: { width: 16, height: 16 },
    rankText: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
  });
