import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import {
  decksRemaining,
  logCursor,
  logSeasons,
  myRaceClan,
  periodDays,
  periodLabel,
  raceStandings,
  sortParticipants,
  type LogSeason,
  type Participant,
  type ParticipantSort,
  type RaceClan,
} from '@/lib/river-race';
import { battleStamp, modeLabel, parseApiDate, relativeTime } from '@/lib/royale-battles';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { ChipRow } from '@/components/ui/ChipRow';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { Meter } from '@/components/ui/Meter';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { clanBadgeArt, type CrIconName } from '@/assets/royale';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  CrEmpty,
  CrIcon,
  CrList,
  CrLoading,
  DerivedNote,
  Metric,
  MetricGrid,
  PlayerPortrait,
  Podium,
  RankRow,
  Section,
  Source,
  num,
} from './CrBits';

/**
 * The Clash Royale clan, with River Race folded in as tabs.
 *
 * Shared by the Clan screen -- which opens on your own clan -- and the detail
 * sheet, which is where every *other* clan opens. One component, so the two
 * cannot drift.
 *
 * River Race is a tab rather than a sheet layer because, unlike Clash of
 * Clans' Capital Raids and War History, it is a view of the clan's current
 * state rather than a separate history to drill into.
 */

type ClanTab = 'overview' | 'members' | 'race' | 'log';

const TABS: Tab<ClanTab>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'members', label: 'Members' },
  { id: 'race', label: 'River Race' },
  { id: 'log', label: 'Log' },
];

export function CrClanPanel({ clan, tag }: { clan: ApiRecord; tag: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [tab, setTab] = useState<ClanTab>('overview');
  const badge = clanBadgeArt(clan['badgeId']);

  return (
    <View>
      <View style={s.banner}>
        {/*
          Clash Royale clans expose `badgeId` only -- no `badgeUrls` the way
          Clash of Clans has. The crest comes from the generated id map in
          src/data/cr/badge-map.json; all 180 ids resolve, and the generic
          icon is the fallback for anything the map predates.
        */}
        {badge ? (
          <Image
            source={badge}
            style={s.bannerBadge}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <CrIcon name="clan" size={56} />
        )}
        <View style={s.bannerBody}>
          <Text style={s.bannerName} numberOfLines={2}>
            {text(clan['name'])}
          </Text>
          <Text style={s.bannerTag}>{text(clan['tag'])}</Text>
          <Text style={s.bannerMeta} numberOfLines={1}>
            {text(record(clan['location'])['name'])} · {modeLabel(clan['type'])}
          </Text>
        </View>
      </View>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'overview' && <Overview clan={clan} />}
      {tab === 'members' && <Members clan={clan} />}
      {/*
        The clan record goes down into River Race because the race response
        carries nothing about a participant beyond their name and four counts.
        `memberList` is where their arena, role and trophies live. See `roster`.
      */}
      {tab === 'race' && <RiverRace tag={tag} clan={clan} />}
      {tab === 'log' && <RaceLog tag={tag} clan={clan} />}
    </View>
  );
}

function Overview({ clan }: { clan: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const description = text(clan['description']);
  const chestMax = Number(clan['clanChestMaxLevel']) || 0;

  return (
    <View>
      {description !== '—' && <Text style={s.description}>{description}</Text>}
      <MetricGrid>
        <Metric label="Members" value={clan['members']} icon="members" />
        <Metric label="Clan score" value={clan['clanScore']} icon="trophy" />
        <Metric label="War trophies" value={clan['clanWarTrophies']} icon="trophy" />
        <Metric label="Required trophies" value={clan['requiredTrophies']} icon="key" />
        <Metric label="Donations per week" value={clan['donationsPerWeek']} icon="trade" />
        <Metric label="Clan chest" value={modeLabel(clan['clanChestStatus'])} icon="shop" />
      </MetricGrid>
      {chestMax > 0 && (
        <View style={s.chestBlock}>
          <Text style={s.subHead}>
            Clan chest · level {text(clan['clanChestLevel'])} of {chestMax}
          </Text>
          <Meter value={Number(clan['clanChestLevel']) || 0} max={chestMax} />
        </View>
      )}
    </View>
  );
}

type MemberSort = 'rank' | 'trophies' | 'donations' | 'received' | 'name';

/**
 * Each ordering, and the figure it ranks by.
 *
 * `score` is what the podium prints under each place, so sorting by Donated
 * shows donation counts rather than trophies -- a podium captioned with a
 * number it is not ordered by is just three names on blocks.
 *
 * Clan rank and Name have no figure of their own, so they fall back to
 * trophies, which is also what the rows below show.
 */
const MEMBER_SORTS: {
  id: MemberSort;
  label: string;
  icon: CrIconName;
  score: (m: ApiRecord) => unknown;
}[] = [
  { id: 'rank', label: 'Clan rank', icon: 'trophy', score: (m) => m['trophies'] },
  { id: 'trophies', label: 'Trophies', icon: 'trophy', score: (m) => m['trophies'] },
  { id: 'donations', label: 'Donated', icon: 'trade', score: (m) => m['donations'] },
  { id: 'received', label: 'Received', icon: 'trade', score: (m) => m['donationsReceived'] },
  { id: 'name', label: 'Name', icon: 'trophy', score: (m) => m['trophies'] },
];

/**
 * The clan roster, read as a ladder.
 *
 * A clan is a leaderboard of 50 -- it has ranks, movement and a figure per row
 * -- so it gets the same podium the rankings do rather than showing its top
 * three as three ordinary rows with a gold square. The podium follows the
 * *active sort*: order by Donated and it is the top three donors standing on
 * it, scored by donations.
 */
function Members({ clan }: { clan: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const [sort, setSort] = useState<MemberSort>('rank');
  const list = rows(clan['memberList']);

  const sorted = useMemo(() => {
    const n = (m: ApiRecord, key: string) => Number(m[key]) || 0;
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'trophies':
          return n(b, 'trophies') - n(a, 'trophies');
        case 'donations':
          return n(b, 'donations') - n(a, 'donations');
        case 'received':
          return n(b, 'donationsReceived') - n(a, 'donationsReceived');
        case 'name':
          return text(a['name']).localeCompare(text(b['name']));
        default:
          return n(a, 'clanRank') - n(b, 'clanRank');
      }
    });
  }, [list, sort]);

  const active = MEMBER_SORTS.find((o) => o.id === sort) ?? MEMBER_SORTS[0]!;
  const tail = useMemo(
    () => sorted.slice(sorted.length >= 3 ? 3 : 0),
    [sorted],
  );
  const paged = usePaged(tail, sort);

  if (!list.length) return <CrEmpty body="This clan has no members listed." />;

  return (
    <View>
      <ChipRow
        chips={MEMBER_SORTS.map((o) => ({ id: o.id, label: o.label }))}
        value={sort}
        onChange={(id) => setSort(id as MemberSort)}
        accessibilityLabel="Sort members"
      />

      {/*
        The podium's rank is the *position in this ordering*, not clanRank --
        the third-highest donor is not usually the third-ranked member, and
        printing their clan rank on a donation podium would be two orderings
        shown as one.
      */}
      {/*
        No `badgeId` here, unlike everywhere else that draws a portrait. The
        crest fallback exists to say something true about a player when their
        arena art is missing -- but inside a single clan every member shares one
        crest, so it would put the same picture on all three plinths and on
        every row beneath them. A framed king at least does not pretend to
        distinguish them.
      */}
      <Podium
        icon={active.icon}
        places={sorted.slice(0, 3).map((member, i) => ({
          key: text(member['tag']),
          rank: i + 1,
          art: <PlayerPortrait player={member} size={54} />,
          name: text(member['name']),
          subtitle: modeLabel(member['role']),
          score: active.score(member),
          onPress: () => openPlayer(text(member['tag']), 'cr'),
        }))}
      />

      <CrList>
        {paged.shown.map((member) => {
          const rank = Number(member['clanRank']) || 0;
          const previous = Number(member['previousClanRank']) || 0;
          // 0 means "no previous rank", not "moved up from the top".
          const drift = previous > 0 ? previous - rank : 0;
          const seen = parseApiDate(member['lastSeen']);
          return (
            <RankRow
              key={text(member['tag'])}
              art={<PlayerPortrait player={member} size={32} />}
              rank={
                <Text style={s.rankCell}>
                  {rank}
                  {drift !== 0 ? (
                    <Text style={drift > 0 ? s.up : s.down}>{drift > 0 ? ' ▲' : ' ▼'}</Text>
                  ) : null}
                </Text>
              }
              podium={rank > 0 && rank <= 3}
              title={text(member['name'])}
              subtitle={`${modeLabel(member['role'])} · ${num(member['donations'])} donated · ${num(
                member['donationsReceived'],
              )} received${seen ? ` · seen ${relativeTime(seen)}` : ''}`}
              score={active.score(member)}
              icon={active.icon}
              onPress={() => openPlayer(text(member['tag']), 'cr')}
            />
          );
        })}
      </CrList>
      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        noun="members"
        style={s.more}
      />
    </View>
  );
}

const PARTICIPANT_SORTS = [
  { id: 'fame', label: 'Fame' },
  { id: 'decks', label: 'Decks used' },
  { id: 'repair', label: 'Repair' },
  { id: 'boat', label: 'Boat attacks' },
  { id: 'name', label: 'Name' },
];

/**
 * The clan's own roster, indexed by tag.
 *
 * River Race participants are returned as `{tag, name, fame, repairPoints,
 * boatAttacks, decksUsed, decksUsedToday}` and nothing else -- no arena, no
 * role, no trophies -- which is why those rows used to be bare text. The clan
 * response sitting one component above has all three for every current member,
 * so the two are joined on tag.
 *
 * A participant who has since left the clan will not be in here, and keeps the
 * plain row rather than borrowing someone else's art.
 */
function roster(clan: ApiRecord): Map<string, ApiRecord> {
  const out = new Map<string, ApiRecord>();
  for (const member of rows(clan['memberList'])) {
    const tag = text(member['tag']).toUpperCase();
    if (tag !== '—') out.set(tag, member);
  }
  return out;
}

function RiverRace({ tag, clan }: { tag: string; clan: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { data: result, isFetching } = useQuery({
    ...gameQuery({ game: 'cr', resource: 'riverRace', tag }),
    enabled: Boolean(tag),
  });
  const race = result?.ok ? record(JSON.parse(result.data)) : null;
  const [sort, setSort] = useState<ParticipantSort>('fame');
  const members = useMemo(() => roster(clan), [clan]);

  if (isFetching && !race) return <CrLoading label="Loading the river race…" />;
  if (!race) {
    return (
      <View>
        <CrEmpty
          title="No river race"
          body="Nothing came back for this clan's current race."
        />
        {result ? <Source result={result} /> : null}
      </View>
    );
  }

  const standings = raceStandings(race, tag);
  const mine = myRaceClan(race, tag);
  const days = periodDays(race);

  return (
    <View>
      <View style={s.raceHead}>
        <Text style={s.racePeriod}>{periodLabel(race)}</Text>
        <Text style={s.raceMeta}>
          Day {Number(race['periodIndex']) + 1} · section {text(race['sectionIndex'])} ·{' '}
          {modeLabel(race['state'])}
        </Text>
      </View>

      <Section title="Standings" count={standings.length}>
        <CrList>
          {standings.map((entry) => (
            <RankRow
              key={entry.tag}
              rank={entry.rank}
              art={clanBadgeArt(entry.badgeId)}
              podium={entry.rank === 1}
              title={`${entry.name}${entry.isMine ? ' · your clan' : ''}`}
              subtitle={`${num(entry.fame)} fame · ${num(entry.repairPoints)} repair · ${num(
                entry.periodPoints,
              )} today · ${entry.active}/${entry.participants.length} active`}
              score={entry.clanScore}
            />
          ))}
        </CrList>
      </Section>

      {mine && mine.participants.length > 0 && (
        <Section title="Your clan today" count={mine.participants.length}>
          <MetricGrid>
            <Metric label="Fame" value={mine.fame} icon="fame" />
            <Metric label="Repair points" value={mine.repairPoints} icon="hammer" />
            <Metric label="Decks used today" value={mine.decksUsedToday} icon="cards" />
            <Metric label="Decks remaining" value={decksRemaining(mine)} icon="cards" />
          </MetricGrid>
          <DerivedNote>
            Decks remaining assumes four per member per day — the game's rule, which the API does
            not publish. Everything else is returned directly.
          </DerivedNote>
          <ChipRow
            chips={PARTICIPANT_SORTS}
            value={sort}
            onChange={(id) => setSort(id as ParticipantSort)}
            accessibilityLabel="Sort participants"
          />
          <Participants clan={mine} sort={sort} members={members} />
        </Section>
      )}

      {days.length > 0 && (
        <Section title="Day by day" count={days.length}>
          {days.map((day, i) => (
            <Collapsible
              key={day.periodIndex ?? i}
              accessibilityLabel={`Toggle day ${(day.periodIndex ?? i) + 1}`}
              summary={() => (
                <Text style={s.toggle}>
                  Day {(day.periodIndex ?? i) + 1} · {day.rows.length} clans
                </Text>
              )}
            >
              {day.rows.map((row) => (
                <View key={row.clanTag} style={s.dayRow}>
                  <Text style={s.dayTag} numberOfLines={1}>
                    {row.clanTag}
                  </Text>
                  <Text style={s.dayScore}>
                    {num(row.pointsEarned)} pts
                    {row.endOfDayRank !== null ? ` · rank ${row.endOfDayRank}` : ''}
                  </Text>
                </View>
              ))}
            </Collapsible>
          ))}
        </Section>
      )}

      {result ? <Source result={result} /> : null}
    </View>
  );
}

/**
 * Who turned up this week.
 *
 * The row is built from two sources: the race response for the four effort
 * figures, and the clan roster for everything that makes the row look like a
 * person -- arena art, their role, their trophies. Those never appear in a race
 * payload, which is why this list used to be four numbers in a sentence.
 *
 * The figures are rendered through `Stat` rather than joined with middots so
 * fame, repair and decks read as the same three things they do on a clan row
 * further down the screen.
 */
function Participants({
  clan,
  sort,
  members,
}: {
  clan: RaceClan;
  sort: ParticipantSort;
  members: Map<string, ApiRecord>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const list = useMemo(() => sortParticipants(clan.participants, sort), [clan, sort]);
  const paged = usePaged(list, `${clan.tag}:${sort}`);

  if (!list.length) return <Text style={s.dayTag}>No participants recorded.</Text>;

  return (
    <View>
      <CrList>
        {paged.shown.map((p) => {
          const member = members.get(p.tag.toUpperCase());
          return (
            <ParticipantRow
              key={p.tag}
              participant={p}
              member={member}
              onPress={() => openPlayer(p.tag, 'cr')}
            />
          );
        })}
      </CrList>
      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        noun="members"
        style={s.more}
      />
    </View>
  );
}

function ParticipantRow({
  participant: p,
  member,
  onPress,
}: {
  participant: Participant;
  member: ApiRecord | undefined;
  onPress: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${p.name}`}
      onPress={onPress}
      style={({ pressed }) => [s.participant, pressed && s.pressed]}
    >
      <PlayerPortrait player={member ?? null} size={34} />
      <View style={s.participantBody}>
        <Text style={s.participantName} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={s.participantMeta} numberOfLines={1}>
          {member
            ? `${modeLabel(member['role'])} · ${num(member['trophies'])} trophies`
            : 'No longer in the clan'}
        </Text>
        <View style={s.statRow}>
          <Stat icon="hammer" value={p.repairPoints} label="repair" />
          <Stat icon="cards" value={p.decksUsed} label="decks" />
          <Stat icon="battle" value={p.boatAttacks} label="boat" />
        </View>
      </View>
      <View style={s.participantScore}>
        <CrIcon name="fame" size={20} />
        <Text style={s.participantFame}>{num(p.fame)}</Text>
        <Text style={s.participantToday}>{`${num(p.decksUsedToday)} today`}</Text>
      </View>
    </Pressable>
  );
}

function RaceLog({ tag, clan }: { tag: string; clan: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const members = useMemo(() => roster(clan), [clan]);
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages[pages.length - 1];
  const { data: result, isFetching } = useQuery({
    ...gameQuery({ game: 'cr', resource: 'riverRaceLog', tag, limit: 10, after: cursor }),
    enabled: Boolean(tag),
  });
  const log = result?.ok ? record(JSON.parse(result.data)) : null;

  if (isFetching && !log) return <CrLoading label="Loading race history…" />;
  if (!log) {
    return (
      <View>
        <CrEmpty title="No history" body="Nothing came back for this clan's race history." />
        {result ? <Source result={result} /> : null}
      </View>
    );
  }

  const seasons = logSeasons(log, tag);
  const next = logCursor(log);

  if (!seasons.length) {
    return <CrEmpty body="This clan has not finished a river race yet." />;
  }

  return (
    <View>
      {seasons.map((season, i) => (
        <SeasonCard
          key={`${season.seasonId}-${season.sectionIndex}-${i}`}
          season={season}
          members={members}
        />
      ))}

      {next ? (
        <Button variant="outline" size="sm" style={s.more} onPress={() => setPages([...pages, next])}>
          Load earlier seasons
        </Button>
      ) : (
        <Text style={s.logEnd}>That is the whole history the API returns.</Text>
      )}
      {result ? <Source result={result} /> : null}
    </View>
  );
}

/**
 * One finished river race week.
 *
 * This used to be a single line of text per season -- "Season 137 · week 4 ·
 * finished 5th" -- which threw away almost everything the endpoint returns.
 * Each entry actually carries the full five-clan standings, every clan's
 * crest, fame and repair points, the trophy change, the creation date and
 * every participant's individual fame for that week.
 *
 * So the card leads with your own result and opens onto the rest. The
 * participants are the part that is genuinely hard to get anywhere else: the
 * current-race endpoint only covers the race in progress, so this is the only
 * record of who actually turned up in a week that has closed.
 */
function SeasonCard({
  season,
  members,
}: {
  season: LogSeason;
  members: Map<string, ApiRecord>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const mine = season.mine;
  // Only members who actually scored. A roster of fifty mostly has a long
  // tail on zero, and "top scorer: 0 fame" is not a fact worth a row.
  const top = mine
    ? sortParticipants(mine.clan.participants, 'fame')
        .filter((p) => p.fame > 0)
        .slice(0, 3)
    : [];

  return (
    <View style={s.season}>
      <View style={s.seasonHead}>
        <Text style={s.seasonTitle} numberOfLines={1}>
          Season {season.seasonId ?? '—'} · Week {(season.sectionIndex ?? 0) + 1}
        </Text>
        {season.created ? <Text style={s.seasonDate}>{battleStamp(season.created)}</Text> : null}
      </View>

      {mine ? (
        <View style={s.seasonResult}>
          <View style={[s.medal, mine.rank === 1 && s.medalWinner]}>
            <Text style={[s.medalText, mine.rank === 1 && s.medalTextWinner]}>
              {ordinal(mine.rank)}
            </Text>
          </View>
          <ClanCrest badgeId={mine.clan.badgeId} size={34} />
          <View style={s.seasonBody}>
            <Text style={s.seasonClan} numberOfLines={1}>
              {mine.clan.name}
            </Text>
            <View style={s.statRow}>
              <Stat icon="fame" value={mine.clan.fame} label="fame" />
              <Stat icon="hammer" value={mine.clan.repairPoints} label="repair" />
              <Stat icon="cards" value={mine.clan.decksUsed} label="decks" />
            </View>
          </View>
          <View style={s.trophyBox}>
            <CrIcon name="trophy" size={18} />
            <Text
              style={[
                s.trophyChange,
                mine.trophyChange > 0 ? s.up : mine.trophyChange < 0 ? s.down : null,
              ]}
            >
              {mine.trophyChange > 0 ? '+' : ''}
              {num(mine.trophyChange)}
            </Text>
          </View>
        </View>
      ) : null}

      <Collapsible
        accessibilityLabel={`Toggle season ${season.seasonId ?? ''} standings`}
        summary={(open) => (
          <Text style={s.toggle}>
            {open ? 'Hide standings' : `Standings · ${season.standings.length} clans`}
          </Text>
        )}
      >
        {season.standings.map((entry) => (
          <View key={entry.clan.tag} style={[s.logRow, entry.clan.isMine && s.logRowMine]}>
            <Text style={s.logRank}>{entry.rank}</Text>
            <ClanCrest badgeId={entry.clan.badgeId} size={26} />
            <View style={s.logBody}>
              <Text style={s.logName} numberOfLines={1}>
                {entry.clan.name}
              </Text>
              <View style={s.statRow}>
                <Stat icon="fame" value={entry.clan.fame} label="fame" />
                <Stat icon="hammer" value={entry.clan.repairPoints} label="repair" />
                <Stat icon="members" value={entry.clan.active} label="active" />
              </View>
            </View>
            <Text
              style={[
                s.logTrophy,
                entry.trophyChange > 0 ? s.up : entry.trophyChange < 0 ? s.down : null,
              ]}
            >
              {entry.trophyChange > 0 ? '+' : ''}
              {num(entry.trophyChange)}
            </Text>
          </View>
        ))}

        {top.length > 0 && (
          <View style={s.topBlock}>
            <Text style={s.subHead}>Your top scorers that week</Text>
            <TopScorers top={top} members={members} />
          </View>
        )}
      </Collapsible>
    </View>
  );
}

/**
 * The three who scored most in a finished week.
 *
 * Joined against the roster the same way the live race is -- a log entry's
 * participants carry no more about a player than the current race's do. Someone
 * who has left since that week keeps a plain row.
 */
function TopScorers({
  top,
  members,
}: {
  top: Participant[];
  members: Map<string, ApiRecord>;
}) {
  const { openPlayer } = useDetailSheet();
  return (
    <>
      {top.map((p) => (
        <ParticipantRow
          key={p.tag}
          participant={p}
          member={members.get(p.tag.toUpperCase())}
          onPress={() => openPlayer(p.tag, 'cr')}
        />
      ))}
    </>
  );
}

/** A clan crest, falling back to the generic clan icon when the id is new. */
function ClanCrest({ badgeId, size }: { badgeId: unknown; size: number }) {
  const art = clanBadgeArt(badgeId);
  if (!art) return <CrIcon name="clan" size={size} />;
  return (
    <Image
      source={art}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/** Icon, figure, unit -- the repeated three-up under a clan's name. */
function Stat({ icon, value, label }: { icon: CrIconName; value: number; label: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.stat}>
      <CrIcon name={icon} size={13} />
      <Text style={s.statValue}>{num(value)}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

const build = (t: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 16,
    },
    bannerBadge: { width: 56, height: 64, flexShrink: 0 },
    bannerBody: { flex: 1, minWidth: 0 },
    bannerName: { fontFamily: t.fonts.display, fontSize: 23, lineHeight: 30, color: t.foreground },
    bannerTag: { fontFamily: t.fonts.sans, fontSize: 10, marginTop: 5, color: t.mutedForeground },
    bannerMeta: { fontFamily: t.fonts.sans, fontSize: 11, marginTop: 4, color: t.accent },
    description: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 22,
      color: t.mutedForeground,
      marginTop: 14,
    },
    subHead: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground, marginBottom: 8 },
    chestBlock: { marginTop: 18 },

    rankCell: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    // Collapsible renders `summary` straight into a View; it must be a <Text>.
    toggle: { fontFamily: t.fonts.display, fontSize: 12, color: t.accent },
    up: { color: t.success },
    down: { color: t.destructive },
    pressed: { opacity: 0.75 },

    participant: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 10,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
    },
    participantBody: { flex: 1, minWidth: 0 },
    participantName: { fontFamily: t.fonts.display, fontSize: 12, color: t.cardForeground },
    participantMeta: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      lineHeight: 13,
      marginTop: 3,
      color: t.mutedForeground,
    },
    participantScore: { alignItems: 'center', gap: 2, minWidth: 52 },
    participantFame: { fontFamily: t.fonts.display, fontSize: 13, color: t.accent },
    participantToday: { fontFamily: t.fonts.sans, fontSize: 8, color: t.mutedForeground },

    raceHead: { paddingVertical: 14 },
    racePeriod: { fontFamily: t.fonts.display, fontSize: 18, color: t.primary },
    raceMeta: { fontFamily: t.fonts.sans, fontSize: 11, marginTop: 5, color: t.mutedForeground },

    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 8,
    },
    dayTag: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground, flexShrink: 1 },
    dayScore: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },

    season: {
      marginBottom: 10,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
      backgroundColor: t.card,
      paddingHorizontal: 10,
      paddingBottom: 8,
    },
    seasonHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    seasonTitle: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 13, color: t.primary },
    seasonDate: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    seasonResult: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    medal: {
      minWidth: 34,
      paddingVertical: 5,
      paddingHorizontal: 4,
      alignItems: 'center',
      backgroundColor: t.muted,
      borderRadius: t.radius.sm,
    },
    medalWinner: { backgroundColor: t.primary },
    medalText: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    medalTextWinner: { color: t.primaryForeground },
    seasonBody: { flex: 1, minWidth: 0 },
    seasonClan: { fontFamily: t.fonts.display, fontSize: 13, color: t.cardForeground },
    trophyBox: { alignItems: 'center', gap: 2, minWidth: 40 },
    trophyChange: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    topBlock: { marginTop: 12, gap: 8 },

    // The three-up figure row under a clan name. `flexWrap` because three
    // stats plus their units overflow a narrow phone once the numbers reach
    // five digits, and wrapping is better than clipping a value.
    statRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 5 },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statValue: { fontFamily: t.fonts.display, fontSize: 10, color: t.foreground },
    statLabel: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },

    logRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: t.radius.sm,
    },
    logRowMine: { backgroundColor: t.muted },
    logRank: { fontFamily: t.fonts.display, fontSize: 13, color: t.primary, minWidth: 18 },
    logBody: { flex: 1, minWidth: 0 },
    logName: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    logTrophy: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    more: { marginTop: 14, alignSelf: 'flex-start' },
    logEnd: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      marginTop: 14,
      color: t.mutedForeground,
    },
  });
