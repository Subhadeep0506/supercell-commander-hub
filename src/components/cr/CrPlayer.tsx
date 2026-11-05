import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { modeLabel } from '@/lib/royale-battles';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { Meter } from '@/components/ui/Meter';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import {
  CR_ICONS,
  arenaBadgeArt,
  chestArt,
  clanBadgeArt,
  leagueBadgeArt,
  playerBadgeArt,
  type CrIconName,
} from '@/assets/royale';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  CrEmpty,
  CrIcon,
  CrownRecord,
  Metric,
  MetricGrid,
  PlayerPortrait,
  Section,
  Source,
  num,
  url,
} from './CrBits';
import { CrBattles } from './CrBattles';
import { CardGrid, useCardSheet } from './CrCards';

/**
 * The Clash Royale player profile.
 *
 * Shared by the Home tab and the detail sheet, the same way CocPlayer is, so
 * the two can never drift.
 *
 * Several of the richest sections are **absent on a normal account** --
 * `leagueStatistics` is undefined and all three Path of Legend results are
 * null below Legend arena, which is true of the calibration account. Every one
 * of them is rendered conditionally rather than with a fallback, because an
 * empty "Path of Legend: —" block is worse than no block.
 */
export function CrPlayer({ player, tag }: { player: ApiRecord; tag: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const chests = useQuery({
    ...gameQuery({ game: 'cr', resource: 'upcomingChests', tag }),
    enabled: Boolean(tag),
  });
  const battles = useQuery({
    ...gameQuery({ game: 'cr', resource: 'battles', tag }),
    enabled: Boolean(tag),
  });

  const deck = rows(player['currentDeck']);
  const deckSupport = rows(player['currentDeckSupportCards']);
  const log = battles.data?.ok ? rows(JSON.parse(battles.data.data)) : [];
  const { openCard, cardSheet } = useCardSheet();

  return (
    <View>
      <AccountBanner player={player} />

      {deck.length > 0 && (
        <Section title="Current deck" count={deck.length}>
          <CardGrid cards={deck} showCopies={false} onPressCard={openCard} />
          {deckSupport.length > 0 && (
            /*
              Tower troops are cards, so they get the card treatment: artwork,
              level badge and the same tap-to-open sheet as the eight above.
              They used to print as a comma-joined list of names, which was the
              only place in either game where a card appeared as bare text.
              The Decks tab already renders them this way.
            */
            <View style={s.towerBlock}>
              <Text style={s.towerLabel}>Tower troop</Text>
              <CardGrid cards={deckSupport} showCopies={false} onPressCard={openCard} />
            </View>
          )}
        </Section>
      )}

      <Section title="Record">
        <MetricGrid>
          {/*
            Lifetime, unlike everything in the Battles section below. The two
            used to disagree on which crown meant what -- Wins carried the red
            one and Losses the blue -- which is the whole reason the colours now
            live in one component.
          */}
          <Metric
            label="Lifetime record"
            value={
              <CrownRecord
                wins={Number(player['wins']) || 0}
                losses={Number(player['losses']) || 0}
              />
            }
          />
          <Metric label="Three-crown wins" value={player['threeCrownWins']} icon="crownBlue" />
          <Metric label="Battles" value={player['battleCount']} icon="battle" />
          <Metric label="Win / lose streak" value={player['currentWinLoseStreak']} icon="streak" />
          <Metric label="Best trophies" value={player['bestTrophies']} icon="trophy" />
          <Metric label="Experience level" value={player['expLevel']} icon="experience" />
        </MetricGrid>
      </Section>

      <ArenaDetails player={player} />

      {/*
        The battle log is the only history the API has, so everything derived
        from it -- the per-mode record included -- lives in this one section
        rather than being scattered across the screen.
      */}
      <CrBattles battles={log} tag={text(player['tag'])} loading={battles.isFetching} />
      {battles.data && !battles.data.ok ? <Source result={battles.data} /> : null}

      <PathOfLegend player={player} />
      <LeagueStatistics player={player} />

      <Section title="Cards &amp; donations">
        <MetricGrid>
          <Metric label="Cards found" value={rows(player['cards']).length} icon="cards" />
          <Metric label="Collection level" value={player['collectionLevel']} icon="cards" />
          <Metric label="King tower level" value={player['kingTowerLevel']} icon="king" />
          <Metric label="Favourite card" value={text(record(player['currentFavouriteCard'])['name'])} icon="heart" />
          <Metric label="Donated" value={player['donations']} icon="trade" />
          <Metric label="Received" value={player['donationsReceived']} icon="trade" />
          <Metric label="Total donations" value={player['totalDonations']} icon="trade" />
          <Metric label="Clan cards collected" value={player['clanCardsCollected']} icon="book" />
          <Metric label="War day wins" value={player['warDayWins']} icon="clanWars" />
          <Metric label="Star points" value={player['starPoints']} icon="star" />
          <Metric label="Experience points" value={player['expPoints']} icon="experience" />
          <Metric label="Total experience" value={player['totalExpPoints']} icon="experience" />
        </MetricGrid>
      </Section>

      <Section title="Challenges &amp; tournaments">
        <MetricGrid>
          <Metric label="Challenge cards won" value={player['challengeCardsWon']} icon="tournament" />
          <Metric label="Best challenge streak" value={player['challengeMaxWins']} icon="tournament" />
          <Metric label="Tournament cards won" value={player['tournamentCardsWon']} icon="tournament" />
          <Metric label="Tournament battles" value={player['tournamentBattleCount']} icon="tournament" />
          <Metric label="Legacy trophy road best" value={player['legacyTrophyRoadHighScore']} icon="trophy" />
        </MetricGrid>
      </Section>

      <ChestTrack result={chests.data} loading={chests.isFetching} />
      <Achievements player={player} />
      <Badges player={player} />
      {cardSheet}
    </View>
  );
}

/** `.arena-account-banner`. */
function AccountBanner({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();
  const clan = record(player['clan']);
  const clanTag = text(clan['tag']);
  const clanBadge = clanBadgeArt(clan['badgeId']);

  return (
    <View style={s.banner}>
      <View style={s.bannerPortrait}>
        {/*
          Arena, then clan crest, then a framed king -- see PlayerPortrait. The
          middle step is what this banner was missing: arena art stops at the
          last arena the upstream repo shipped, so on a clan roster roughly four
          players in ten used to land on the king.
        */}
        <PlayerPortrait player={player} size={68} />
      </View>
      <View style={s.bannerBody}>
        <Text style={s.bannerEyebrow}>EXPERIENCE LEVEL {text(player['expLevel'])}</Text>
        <Text style={s.bannerName} numberOfLines={2}>
          {text(player['name'])}
        </Text>
        {clanTag !== '—' ? (
          <Pressable
            onPress={() => openClan(clanTag, 'cr')}
            accessibilityRole="button"
            accessibilityLabel={`View ${text(clan['name'])}`}
            style={s.bannerClanRow}
          >
            {clanBadge ? (
              <Image
                source={clanBadge}
                style={s.bannerClanBadge}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            <Text style={s.bannerClan} numberOfLines={1}>
              {text(clan['name'])} ›
            </Text>
          </Pressable>
        ) : (
          <Text style={s.bannerClan}>No clan</Text>
        )}
        <Text style={s.bannerTag}>{text(player['tag'])}</Text>
      </View>
      <View style={s.bannerScore}>
        <CrIcon name="trophy" size={30} />
        <Text style={s.bannerScoreValue}>{num(player['trophies'])}</Text>
        <Text style={s.bannerScoreLabel}>Trophies</Text>
      </View>
    </View>
  );
}

/**
 * Arena and the other game modes' ladders.
 *
 * `progress` is a map keyed by mode or season id -- an empty-string key is
 * real and is the legacy Merge Tactics ladder. The fan kit has no arena
 * artwork, only cards, so arenas are named rather than pictured.
 *
 * The per-mode win/loss record used to sit here too. It moved into the
 * Battles section below, which is where its data comes from.
 */
function ArenaDetails({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const arena = record(player['arena']);
  const progress = record(player['progress']);
  const entries = Object.entries(progress);

  return (
    <Section title="Arena &amp; game modes">
      <View style={s.arenaCard}>
        <ArenaArt id={arena['id']} fallback="trophy" />
        <View style={s.arenaBody}>
          <Text style={s.arenaLabel}>Current arena</Text>
          <Text style={s.arenaName}>{text(arena['name'])}</Text>
        </View>
        <Text style={s.arenaTrophies}>{num(player['trophies'])}</Text>
      </View>

      {entries.map(([key, value]) => {
        const row = record(value);
        const modeArena = record(row['arena']);
        return (
          <View key={key || 'legacy'} style={s.arenaCard}>
            <ArenaArt id={modeArena['id']} fallback="crown" />
            <View style={s.arenaBody}>
              <Text style={s.arenaLabel}>{progressLabel(key, modeArena)}</Text>
              <Text style={s.arenaName}>{text(modeArena['name'])}</Text>
            </View>
            <View style={s.arenaScoreBox}>
              <Text style={s.arenaTrophies}>{num(row['trophies'])}</Text>
              <Text style={s.arenaBest}>best {num(row['bestTrophies'])}</Text>
            </View>
          </View>
        );
      })}
    </Section>
  );
}

/** The `progress` map's keys are ids, not labels. */
function progressLabel(key: string, arena: ApiRecord): string {
  if (!key) return 'Merge Tactics (legacy)';
  if (key.toLowerCase().startsWith('autochess')) return 'Merge Tactics';
  if (key.toLowerCase().startsWith('seasonal-trophy-road')) return 'Seasonal Trophy Road';
  return modeLabel(key) || text(arena['rawName']);
}

/**
 * Path of Legend, when the account has any.
 *
 * All three fields are null below Legend arena, which is the common case --
 * the calibration account has none.
 */
function PathOfLegend({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const seasons = [
    ['Current season', player['currentPathOfLegendSeasonResult']],
    ['Last season', player['lastPathOfLegendSeasonResult']],
    ['Best season', player['bestPathOfLegendSeasonResult']],
  ] as const;
  const present = seasons.filter(([, value]) => value != null);
  if (!present.length) return null;

  return (
    <Section title="Path of Legend">
      {present.map(([label, value]) => {
        const row = record(value);
        return (
          <View key={label} style={s.modeRow}>
            <LeagueArt number={row['leagueNumber']} />
            <View style={s.modeBody}>
              <Text style={s.modeName}>{label}</Text>
              <Text style={s.modeMeta}>League {text(row['leagueNumber'])}</Text>
            </View>
            <Text style={s.modeScore}>
              {num(row['trophies'])}
              {row['rank'] != null ? ` · rank ${num(row['rank'])}` : ''}
            </Text>
          </View>
        );
      })}
    </Section>
  );
}

/** League statistics, when present. Absent below Legend arena. */
function LeagueStatistics({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const stats = record(player['leagueStatistics']);
  const rowsOut = [
    ['Current season', record(stats['currentSeason'])],
    ['Previous season', record(stats['previousSeason'])],
    ['Best season', record(stats['bestSeason'])],
  ].filter(([, value]) => Object.keys(value as ApiRecord).length > 0) as [string, ApiRecord][];
  if (!rowsOut.length) return null;

  return (
    <Section title="League statistics">
      {rowsOut.map(([label, row]) => (
        <View key={label} style={s.modeRow}>
          <View style={s.modeBody}>
            <Text style={s.modeName}>{label}</Text>
            {row['id'] != null && <Text style={s.modeMeta}>{text(row['id'])}</Text>}
          </View>
          <Text style={s.modeScore}>
            {num(row['trophies'])}
            {row['bestTrophies'] != null ? ` · best ${num(row['bestTrophies'])}` : ''}
          </Text>
        </View>
      ))}
    </Section>
  );
}

/**
 * The upcoming chest track, as a timeline.
 *
 * A track is a *sequence* -- the whole point is what comes after what -- and
 * sixteen stacked rows said that worse than a rail you read left to right. So
 * it scrolls sideways, with a connector between consecutive chests.
 *
 * Indices are **sparse**: a real account returns 0-8, then 14, 23, 39, 61, 276,
 * 284, 388. Every card is the same width and the jump is drawn on the connector
 * between the two it separates, because the alternative -- spacing the cards in
 * proportion -- puts a kilometre of empty rail between the ninth chest and the
 * tenth and makes the near future unreadable to show the far one honestly.
 * The index is printed on every card either way, so nothing is positional.
 */
function ChestTrack({
  result,
  loading,
}: {
  result: { ok: true; data: string; fetchedAt: string } | { ok: false; status: number; error: string } | undefined;
  loading: boolean;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const items = result?.ok ? rows(record(JSON.parse(result.data))['items']) : [];

  if (loading && !items.length) {
    return (
      <Section title="Upcoming chests">
        <SkeletonRows rows={3} avatar label="Loading the chest track" />
      </Section>
    );
  }
  if (!items.length) return null;

  return (
    <Section title="Upcoming chests" count={items.length}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Upcoming chest track"
        style={s.trackScroll}
        contentContainerStyle={s.track}
      >
        {items.map((chest, i) => {
          const index = typeof chest['index'] === 'number' ? chest['index'] : 0;
          const previous = i > 0 ? Number(items[i - 1]?.['index'] ?? index) : index;
          const skipped = i > 0 ? index - previous - 1 : 0;
          const next = index === 0;
          return (
            <View key={`${index}-${i}`} style={s.trackCell}>
              {i > 0 ? (
                <View style={s.connector}>
                  <View style={[s.rail, skipped > 0 && s.railGap]} />
                  {skipped > 0 ? (
                    <Text style={s.railLabel} numberOfLines={1}>
                      {`+${num(skipped)}`}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View
                accessibilityLabel={`${text(chest['name'])}, ${
                  next ? 'next' : `${index} chests away`
                }`}
                style={[s.chestCard, next && s.chestCardNext]}
              >
                <View style={[s.chestIndex, next && s.chestIndexNext]}>
                  <Text style={[s.chestIndexText, next && s.chestIndexTextNext]}>
                    {next ? 'Next' : `+${index}`}
                  </Text>
                </View>
                <ChestArt name={chest['name']} />
                <Text style={s.chestName} numberOfLines={2}>
                  {text(chest['name'])}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <Text style={s.trackNote}>
        The API returns a sparse track — the chests it names are not every chest between here and
        there. A marker on the rail counts the ones it skipped.
      </Text>
    </Section>
  );
}

/**
 * Artwork for an achievement.
 *
 * Clash Royale's twelve achievements are a fixed list, and neither the API nor
 * the fan kit carries a picture for any of them -- the response is name,
 * stars, info and progress and nothing else. So each one is mapped by hand to
 * the closest real art the app already has: the clan crest for "Join a Clan",
 * the trade icon for donations, the tournament wreath for the three
 * tournament rows. None of these is the achievement's true icon and two
 * families deliberately share one, which is the same trade the metric grid
 * already makes.
 *
 * Keyed on the exact names the API returns, with a keyword fallback so a new
 * achievement still lands on something sensible rather than nothing.
 */
const ACHIEVEMENT_ICONS: Record<string, CrIconName> = {
  'Team Player': 'clan',
  'Friend in Need': 'trade',
  'Friend in Need II': 'trade',
  'Road to Glory': 'trophy',
  Gatherer: 'cards',
  'TV Royale': 'tvRoyale',
  'Tournament Rewards': 'tournament',
  'Tournament Host': 'tournament',
  'Tournament Player': 'tournament',
  'Challenge Streak': 'streak',
  'Practice with Friends': 'members',
  'Special Challenge': 'battle',
};

function achievementIcon(name: unknown): CrIconName {
  if (typeof name !== 'string') return 'crown';
  const exact = ACHIEVEMENT_ICONS[name];
  if (exact) return exact;
  const n = name.toLowerCase();
  if (n.includes('clan')) return 'clan';
  if (n.includes('donat') || n.includes('friend in need')) return 'trade';
  if (n.includes('tournament')) return 'tournament';
  if (n.includes('challenge')) return 'battle';
  if (n.includes('arena') || n.includes('glory') || n.includes('trophy')) return 'trophy';
  if (n.includes('card') || n.includes('collect')) return 'cards';
  if (n.includes('friend')) return 'members';
  return 'crown';
}

/**
 * Achievements.
 *
 * `value` can exceed `target` -- "Road to Glory 11/6" is a real row -- so the
 * meter is clamped. An unclamped bar overflows its track.
 *
 * Open by default rather than behind a toggle: with art on every row this is
 * now the kind of thing you scroll past and read, and twelve rows is short
 * enough that hiding them saved nothing.
 */
function Achievements({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const list = rows(player['achievements']);
  if (!list.length) return null;

  const earned = list.filter((a) => (Number(a['stars']) || 0) >= 3).length;

  return (
    <Section title="Achievements" count={list.length}>
      <Text style={s.sectionNote}>
        {num(earned)} of {num(list.length)} fully earned
      </Text>
      {list.map((a, i) => {
        const value = Number(a['value']) || 0;
        const target = Number(a['target']) || 0;
        const stars = Number(a['stars']) || 0;
        const done = stars >= 3;
        return (
          <View
            key={`${text(a['name'])}-${i}`}
            style={[s.achievement, done && s.achievementRowDone]}
          >
            <View style={[s.achievementArt, done && s.achievementArtDone]}>
              <CrIcon name={achievementIcon(a['name'])} size={30} style={done ? undefined : s.artDim} />
            </View>
            <View style={s.achievementBody}>
              <View style={s.achievementHead}>
                <Text style={[s.achievementName, done && s.achievementDone]} numberOfLines={2}>
                  {text(a['name'])}
                </Text>
                <View style={s.achievementStarRow}>
                  {/* Three slots always. Unearned ones are the same art
                      dimmed -- React Native has no grayscale filter, and a
                      second asset for an empty star is not worth it. */}
                  {Array.from({ length: 3 }, (_, n) => (
                    <CrIcon key={n} name="star" size={14} style={n < stars ? undefined : s.starOff} />
                  ))}
                </View>
              </View>
              <Text style={s.achievementInfo} numberOfLines={2}>
                {text(a['info'])}
              </Text>
              {/*
                Shown even when the achievement is finished. "Road to Glory
                11 / 6" is a real row -- value can exceed target -- and the
                count is the only place that over-shoot is visible, so the
                meter clamps rather than the row hiding.
              */}
              {target > 0 && (
                <>
                  <Meter value={Math.min(value, target)} max={target} style={s.meter} />
                  <Text style={s.achievementMeta}>
                    {num(value)} / {num(target)}
                  </Text>
                </>
              )}
            </View>
          </View>
        );
      })}
    </Section>
  );
}

/**
 * Badges.
 *
 * The art is bundled from the fan kit and the CDN url is only the fallback,
 * which is the reverse of what this used to do. `iconUrls.large` points at
 * api-assets.clashroyale.com: a cold network request on every badge at best,
 * and a 403 on a filtered network, which is what left this section as a column
 * of empty boxes. See playerBadgeArt.
 *
 * A grid rather than a list because the badge *is* the content -- a player
 * carries twenty-odd of them and the art is what distinguishes one from the
 * next. The levelled progress still rides under each tile.
 */
function Badges({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const list = rows(player['badges']);
  if (!list.length) return null;

  return (
    <Section title="Badges" count={list.length}>
      <View style={s.badgeGrid}>
        {list.map((badge, i) => (
          <BadgeTile key={`${text(badge['name'])}-${i}`} badge={badge} />
        ))}
      </View>
    </Section>
  );
}

function BadgeTile({ badge }: { badge: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const progress = Number(badge['progress']) || 0;
  const target = Number(badge['target']) || 0;
  const level = badge['level'];
  const maxLevel = badge['maxLevel'];
  const bundled = playerBadgeArt(badge['name'], level);
  const maxed = level != null && maxLevel != null && Number(level) >= Number(maxLevel);

  return (
    <View style={s.badge}>
      <View style={s.badgeArt}>
        {bundled ? (
          <Image
            source={bundled}
            style={s.badgeIcon}
            resizeMode="contain"
            accessibilityLabel={modeLabel(badge['name'])}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <RemoteImage
            uri={url(record(badge['iconUrls'])['large'])}
            fallback={CR_ICONS.mastery}
            style={s.badgeIcon}
            accessibilityLabel={modeLabel(badge['name'])}
          />
        )}
      </View>
      <Text style={s.badgeName} numberOfLines={2}>
        {modeLabel(badge['name'])}
      </Text>
      {level != null && (
        <Text style={[s.badgeMeta, maxed && s.badgeMetaMax]}>
          {maxed ? 'Max' : `Level ${text(level)}`}
          {!maxed && maxLevel != null ? ` / ${text(maxLevel)}` : ''}
        </Text>
      )}
      {target > 0 && !maxed && (
        <>
          <Meter value={Math.min(progress, target)} max={target} style={s.badgeMeter} />
          <Text style={s.badgeMeta}>
            {num(progress)} / {num(target)}
          </Text>
        </>
      )}
    </View>
  );
}

/**
 * Arena art, falling back to a generic icon.
 *
 * A miss is expected rather than a bug: Merge Tactics and seasonal arenas are
 * absent from the upstream asset repo entirely, and the newest trophy arenas
 * postdate its last publish. assets-req.md tracks what is still outstanding.
 */
function ArenaArt({ id, fallback }: { id: unknown; fallback: 'trophy' | 'crown' }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const source = arenaBadgeArt(id);
  if (!source) return <CrIcon name={fallback} size={28} />;
  return (
    <Image
      source={source}
      style={s.arenaArt}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * Chest art.
 *
 * Keeps its box when the lookup misses so the cards on the rail stay the same
 * height -- Tower Troop Chest postdates the upstream asset repo, and a card
 * that silently loses 34px breaks the line the timeline is built on.
 */
function ChestArt({ name }: { name: unknown }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const source = chestArt(name);
  if (!source) return <View style={s.chestArt} />;
  return (
    <Image
      source={source}
      style={s.chestArt}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/** Path of Legend league badge, 1-10. */
function LeagueArt({ number }: { number: unknown }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const source = leagueBadgeArt(number);
  if (!source) return null;
  return (
    <Image
      source={source}
      style={s.leagueArt}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/** Rendered when a lookup came back empty. */
export function CrPlayerMissing({ tag }: { tag: string }) {
  return (
    <CrEmpty
      title="Player not found"
      body={`Nothing came back for ${tag}. Check the tag, or the player may have changed it.`}
    />
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.arena.hero,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.lg,
      paddingVertical: 18,
      paddingHorizontal: 12,
      ...t.shadow.panel,
    },
    bannerPortrait: { width: 68, height: 85, alignItems: 'center', justifyContent: 'center' },
    bannerBody: { flex: 1, minWidth: 0 },
    bannerEyebrow: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 15,
      color: t.arena.shine,
      marginBottom: 5,
    },
    bannerName: { fontFamily: t.fonts.display, fontSize: 22, lineHeight: 29, color: t.foreground },
    bannerArena: { width: 68, height: 76 },
    bannerClanRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    bannerClanBadge: { width: 18, height: 20, flexShrink: 0 },
    bannerClan: { fontFamily: t.fonts.sans, fontSize: 11, color: t.accent, flexShrink: 1 },
    bannerTag: { fontFamily: t.fonts.sans, fontSize: 10, marginTop: 5, color: t.arena.shine },
    bannerScore: { alignItems: 'center', gap: 3, minWidth: 58 },
    bannerScoreValue: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    bannerScoreLabel: { fontFamily: t.fonts.sans, fontSize: 9, color: t.arena.shine },

    // A column now, not a row: the label captions a grid of card tiles rather
    // than sitting opposite a line of names.
    towerBlock: {
      gap: 10,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    towerLabel: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },

    arenaCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      marginBottom: 8,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
    },
    arenaArt: { width: 40, height: 40, flexShrink: 0 },
    arenaBody: { flex: 1, minWidth: 0 },
    arenaLabel: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    arenaName: { fontFamily: t.fonts.display, fontSize: 14, marginTop: 4, color: t.cardForeground },
    arenaScoreBox: { alignItems: 'flex-end' },
    arenaTrophies: { fontFamily: t.fonts.display, fontSize: 15, color: t.primary },
    arenaBest: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground, marginTop: 3 },

    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 10,
      marginBottom: 6,
      backgroundColor: t.muted,
      borderRadius: t.radius.sm,
    },
    leagueArt: { width: 32, height: 32, flexShrink: 0 },
    modeBody: { flex: 1, minWidth: 0 },
    modeName: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    modeMeta: { fontFamily: t.fonts.sans, fontSize: 9, marginTop: 3, color: t.mutedForeground },
    modeScore: { fontFamily: t.fonts.display, fontSize: 12, color: t.accent },

    // flexGrow: 0 keeps the scroller from eating the page scroller's remaining
    // vertical space -- the same fix HGrid and ChipRow need.
    trackScroll: { flexGrow: 0 },
    track: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    trackCell: { flexDirection: 'row', alignItems: 'center' },
    // The rail runs *between* two cards, so it lives on the cell's leading edge
    // and the first chest has none.
    connector: { width: 28, alignItems: 'center', justifyContent: 'center' },
    rail: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: t.border },
    // A dashed rail is not available in React Native, so a skipped stretch is
    // marked by thinning the line and printing the count over it.
    railGap: { height: 1, backgroundColor: t.mutedForeground },
    railLabel: {
      fontFamily: t.fonts.display,
      fontSize: 8,
      color: t.mutedForeground,
      backgroundColor: t.background,
      paddingHorizontal: 2,
    },
    chestCard: {
      width: 92,
      alignItems: 'center',
      gap: 7,
      paddingVertical: 10,
      paddingHorizontal: 6,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
    },
    chestCardNext: { borderColor: t.primary, backgroundColor: t.muted },
    chestIndex: {
      minWidth: 44,
      paddingVertical: 4,
      paddingHorizontal: 6,
      alignItems: 'center',
      backgroundColor: t.arena.edge,
      borderRadius: t.radius.sm,
    },
    chestIndexNext: { backgroundColor: t.primary },
    chestIndexText: { fontFamily: t.fonts.display, fontSize: 10, color: t.arena.shine },
    chestIndexTextNext: { color: t.primaryForeground },
    chestArt: { width: 38, height: 38, flexShrink: 0 },
    chestName: {
      fontFamily: t.fonts.display,
      fontSize: 10,
      lineHeight: 14,
      textAlign: 'center',
      color: t.cardForeground,
    },
    trackNote: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 16,
      marginTop: 10,
      color: t.mutedForeground,
    },

    sectionNote: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      color: t.mutedForeground,
      marginTop: -6,
      marginBottom: 10,
    },
    achievement: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      marginBottom: 6,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    // Earned rows read differently without a second set of art: the tile gets
    // the gold frame the metric grid already uses for a completed figure.
    achievementRowDone: { borderColor: t.gold, backgroundColor: t.muted },
    achievementArt: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.sm,
      backgroundColor: t.muted,
    },
    achievementArtDone: { backgroundColor: t.arena.edge },
    achievementBody: { flex: 1, minWidth: 0 },
    achievementHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    achievementName: { flex: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    achievementStarRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    // No grayscale filter in React Native; dimming is how an unearned star
    // reads against both the card and muted backgrounds.
    starOff: { opacity: 0.25 },
    artDim: { opacity: 0.55 },
    achievementDone: { color: t.gold },
    achievementInfo: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
      color: t.mutedForeground,
    },
    achievementMeta: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      marginTop: 4,
      color: t.mutedForeground,
    },
    meter: { marginTop: 7 },

    badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // Three columns. Expressed as a basis for the same reason MetricGrid is:
    // Yoga has no `calc()`, so the column width is the share of the row minus
    // its share of the gaps, rounded down so three always fit.
    badge: {
      flexGrow: 1,
      flexBasis: '30%',
      maxWidth: '32%',
      minWidth: 0,
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.card,
    },
    badgeArt: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
    badgeIcon: { width: 52, height: 52 },
    badgeName: {
      fontFamily: t.fonts.display,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 6,
      textAlign: 'center',
      color: t.foreground,
    },
    badgeMeta: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      marginTop: 4,
      textAlign: 'center',
      color: t.mutedForeground,
    },
    badgeMetaMax: { color: t.gold },
    badgeMeter: { marginTop: 6, width: '100%' },
  });
