import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, text, type ApiRecord } from '@/api/game-api';
import {
  battleModes,
  battleStamp,
  battleSummary,
  modeLabel,
  modeRecords,
  normalizeBattle,
  outcomeOf,
  relativeTime,
  OUTCOME_LABELS,
  type BattleSide,
  type NormalBattle,
  type Outcome,
} from '@/lib/royale-battles';
import { Chevron } from '@/components/ui/Chevron';
import { ChipRow, type Chip } from '@/components/ui/ChipRow';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { clanBadgeArt } from '@/assets/royale';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { useHub } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  CrEmpty,
  CrLoading,
  CrownPair,
  CrownRecord,
  Metric,
  MetricGrid,
  PlayerPortrait,
  Section,
  modeIcon,
  num,
} from './CrBits';
import { CardGrid, useCardSheet } from './CrCards';

/**
 * The Battles section on the Clash Royale home screen.
 *
 * `/v1/players/{tag}/battlelog` is the only history the API has: roughly the
 * last 25-30 battles, no paging, no older window. Everything here therefore
 * describes *recent* play and says so -- the lifetime wins and losses live in
 * the Record section above, and conflating the two would be a quiet lie.
 *
 * Each row collapses to a result line and opens in place to the full detail:
 * both rosters, both eight-card decks with their levels and evolutions, tower
 * damage, elixir leaked and the trophy move. The per-mode record lives at the
 * bottom of this section because it is derived from exactly this data.
 */

const RESULTS: { id: string; label: string; match: (o: Outcome | null) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'victory', label: 'Wins', match: (o) => o === 'victory' },
  { id: 'defeat', label: 'Losses', match: (o) => o === 'defeat' },
  { id: 'draw', label: 'Draws', match: (o) => o === 'draw' },
];

export function CrBattles({
  battles,
  tag,
  loading,
}: {
  battles: ApiRecord[];
  tag: string;
  loading: boolean;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [result, setResult] = useState('all');
  const [mode, setMode] = useState('all');
  const { openCard, cardSheet } = useCardSheet();

  const summary = useMemo(() => battleSummary(battles, tag), [battles, tag]);
  const records = useMemo(() => modeRecords(battles, tag), [battles, tag]);

  const resultChips: Chip[] = RESULTS.map((r) => ({
    id: r.id,
    label: r.label,
    count: battles.filter((b) => r.match(outcomeOf(b, tag))).length,
  }));
  const modeChips: Chip[] = [
    { id: 'all', label: 'All modes', count: battles.length },
    ...battleModes(battles).map((m) => ({
      id: m,
      label: modeLabel(m),
      count: battles.filter((b) => text(record(b['gameMode'])['name']) === m).length,
    })),
  ];

  const matcher = RESULTS.find((r) => r.id === result) ?? RESULTS[0]!;
  const filtered = useMemo(
    () =>
      battles.filter(
        (b) =>
          matcher.match(outcomeOf(b, tag)) &&
          (mode === 'all' || text(record(b['gameMode'])['name']) === mode),
      ),
    [battles, matcher, mode, tag],
  );
  const paged = usePaged(filtered, `${result}:${mode}`);

  if (loading && !battles.length) {
    return (
      <Section title="Battles">
        <CrLoading label="Reading the battle log…" />
      </Section>
    );
  }
  if (!battles.length) {
    return (
      <Section title="Battles">
        <CrEmpty
          title="No battles yet"
          body="The battle log came back empty."
        />
      </Section>
    );
  }

  return (
    <Section title="Battles" count={battles.length}>
      <MetricGrid>
        <Metric
          label="Recent record"
          value={
            <CrownRecord wins={summary.wins} losses={summary.losses} draws={summary.draws} />
          }
        />
        <Metric
          label="Recent win rate"
          value={summary.winRate === null ? '—' : `${summary.winRate.toFixed(0)}%`}
          icon="target"
        />
        <Metric
          label="Crowns for / against"
          value={<CrownPair mine={summary.crownsFor} theirs={summary.crownsAgainst} />}
        />
        <Metric
          label="Net trophies"
          value={
            summary.trophyChange === null
              ? '—'
              : `${summary.trophyChange > 0 ? '+' : ''}${num(summary.trophyChange)}`
          }
          icon="trophy"
        />
        <Metric
          label="Average elixir leaked"
          value={summary.elixirLeaked === null ? '—' : summary.elixirLeaked.toFixed(2)}
          icon="elixir"
        />
        <Metric label="Battles in the log" value={battles.length} icon="battle" />
      </MetricGrid>

      <ChipRow
        chips={resultChips}
        value={result}
        onChange={setResult}
        accessibilityLabel="Filter battles by result"
      />
      {modeChips.length > 2 && (
        <ChipRow
          chips={modeChips}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Filter battles by game mode"
        />
      )}

      {paged.shown.length === 0 ? (
        <CrEmpty body="No battles in the log match these filters." />
      ) : (
        <View style={s.list}>
          {paged.shown.map((raw, i) => (
            <BattleRow
              key={`${text(raw['battleTime'])}-${i}`}
              battle={normalizeBattle(raw, tag)}
              onPressCard={openCard}
            />
          ))}
        </View>
      )}

      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        noun="battles"
        style={s.more}
      />

      {records.length > 0 && (
        <>
          <Text style={s.subHead}>Recent record by mode</Text>
          {records.map((r) => (
            <View key={r.mode} style={s.modeRow}>
              {/*
                Mode art, shared with the ladder chips: these rows name the same
                modes the leaderboard does and had no reason to be the only
                place in the section without a picture.
              */}
              <Image
                source={modeIcon(r.label)}
                style={s.modeArt}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <View style={s.modeBody}>
                <Text style={s.modeName} numberOfLines={2}>
                  {r.label}
                </Text>
                <Text style={s.modeMeta}>
                  {r.battles} battle{r.battles === 1 ? '' : 's'}
                </Text>
                <View style={s.modeCrowns}>
                  <CrownPair mine={r.crownsFor} theirs={r.crownsAgainst} size={12} />
                </View>
              </View>
              <CrownRecord wins={r.wins} losses={r.losses} draws={r.draws} size={13} />
            </View>
          ))}
        </>
      )}

      {cardSheet}
    </Section>
  );
}

/** One battle: a result line that opens in place to the full detail. */
function BattleRow({
  battle,
  onPressCard,
}: {
  battle: NormalBattle;
  onPressCard: (card: ApiRecord) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { click } = useHub();
  const [open, setOpen] = useState(false);

  const opponents = battle.theirRoster.map((p) => p.name).join(' & ') || '—';
  const tone =
    battle.outcome === 'victory'
      ? s.toneWin
      : battle.outcome === 'defeat'
        ? s.toneLoss
        : s.toneDraw;
  // The word, not an initial. "W" and "L" are the scoreboard shorthand of a
  // different sport; the game itself says Victory and Defeat, and a chip has
  // room for it where the old 30px square did not.
  const label = battle.outcome ? OUTCOME_LABELS[battle.outcome] : 'Unknown';

  const meta = [
    battle.modeLabel !== '—' ? battle.modeLabel : battle.typeLabel,
    battle.arena !== '—' ? battle.arena : null,
    battle.time ? relativeTime(battle.time) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <View style={s.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${
          battle.outcome ? OUTCOME_LABELS[battle.outcome] : 'Battle'
        } against ${opponents}, ${open ? 'hide' : 'show'} details`}
        onPress={() => {
          click();
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [s.rowHead, pressed && s.pressed]}
      >
        <View style={[s.badge, tone]}>
          <Text style={s.badgeText} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={s.rowBody}>
          <Text style={s.rowTitle} numberOfLines={1}>
            vs {opponents}
          </Text>
          <Text style={s.rowMeta} numberOfLines={2}>
            {meta}
          </Text>
        </View>
        <View style={s.rowScore}>
          <CrownPair mine={battle.myCrowns} theirs={battle.theirCrowns} size={13} />
          {battle.trophyChange !== null && (
            <Text style={[s.trophy, battle.trophyChange < 0 ? s.trophyDown : s.trophyUp]}>
              {battle.trophyChange > 0 ? '+' : ''}
              {battle.trophyChange}
            </Text>
          )}
        </View>
        <Chevron open={open} size={18} />
      </Pressable>

      {open ? <BattleDetail battle={battle} onPressCard={onPressCard} /> : null}
    </View>
  );
}

/** Both rosters, both decks, every stat the log carries about the battle. */
function BattleDetail({
  battle,
  onPressCard,
}: {
  battle: NormalBattle;
  onPressCard: (card: ApiRecord) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const footer = [
    battle.typeLabel !== '—' ? `Type ${battle.typeLabel}` : null,
    battle.deckSelection
      ? battle.deckSelection === 'collection'
        ? 'Your own deck'
        : `Deck: ${modeLabel(battle.deckSelection)}`
      : null,
    battle.eventTag ? `Event ${battle.eventTag}` : null,
    battle.leagueNumber !== null ? `League ${battle.leagueNumber}` : null,
    battle.isLadderTournament ? 'Ladder tournament' : null,
    battle.isHostedMatch ? 'Hosted match' : null,
    battle.time ? battleStamp(battle.time) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <View style={s.detail}>
      {battle.myRoster.map((side, i) => (
        <SideBlock
          key={`${side.tag}-${i}`}
          side={side}
          label={battle.teamSize > 1 ? `Your side · ${side.name}` : 'You'}
          onPressCard={onPressCard}
        />
      ))}
      <View style={s.versus}>
        <View style={s.versusRule} />
        <Text style={s.versusText}>VS</Text>
        <View style={s.versusRule} />
      </View>
      {battle.theirRoster.map((side, i) => (
        <SideBlock
          key={`${side.tag}-${i}`}
          side={side}
          label={battle.teamSize > 1 ? `Opponent · ${side.name}` : 'Opponent'}
          onPressCard={onPressCard}
        />
      ))}
      {footer.length > 0 && (
        <Text style={s.footer} numberOfLines={3}>
          {footer.join(' · ')}
        </Text>
      )}
    </View>
  );
}

/**
 * A battle participant's portrait, from their own profile.
 *
 * The battle log carries nothing picturable about a player -- `{tag, name,
 * clan, crowns, startingTrophies, cards}` and no arena, league or badge -- so
 * the art has to be fetched. Only the sides of an *expanded* battle render,
 * which is two requests for a 1v1 and four for a 2v2, and react-query dedupes
 * against the profile sheet, so tapping through to one costs nothing.
 *
 * The clan badge id comes off the log rather than the profile, so the crest
 * fallback is right even while the request is still in flight.
 */
function SideArt({ tag, badgeId }: { tag: string; badgeId: unknown }) {
  const { data } = useQuery({
    ...gameQuery({ game: 'cr', resource: 'player', tag }),
    enabled: Boolean(tag) && tag !== '—',
  });
  const player = data?.ok ? record(JSON.parse(data.data)) : null;
  return <PlayerPortrait player={player ?? {}} badgeId={badgeId} size={42} />;
}

/** One participant: identity, their eight cards, and their stat line. */
function SideBlock({
  side,
  label,
  onPressCard,
}: {
  side: BattleSide;
  label: string;
  onPressCard: (card: ApiRecord) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer, openClan } = useDetailSheet();
  const badge = clanBadgeArt(side.clanBadgeId);

  const trophies =
    side.startingTrophies !== null
      ? side.trophyChange !== null
        ? `${num(side.startingTrophies)} → ${num(side.startingTrophies + side.trophyChange)}`
        : num(side.startingTrophies)
      : null;

  // Tower damage, read out of what survived. "3 crowns conceded" is the
  // opponent's crowns; what the API only tells you this way is which towers.
  const towers = side.kingDown
    ? 'King tower destroyed'
    : `King ${num(side.kingTowerHitPoints ?? 0)} HP · ${side.princessTowers.length} of 2 princess towers standing`;

  const crowns = (n: number) => `${n} crown${n === 1 ? '' : 's'}`;
  const stats = [
    side.crowns !== null ? `${crowns(side.crowns)} taken` : null,
    `${crowns(side.towersLost)} conceded`,
    trophies ? `${trophies} trophies` : null,
    side.averageElixir !== null ? `${side.averageElixir.toFixed(1)} avg elixir` : null,
    side.averageLevel !== null ? `level ${side.averageLevel.toFixed(1)} avg` : null,
    side.elixirLeaked !== null ? `${side.elixirLeaked.toFixed(2)} elixir leaked` : null,
    side.globalRank !== null ? `global rank ${num(side.globalRank)}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <View style={s.side}>
      <Text style={s.sideLabel}>{label.toUpperCase()}</Text>
      <View style={s.sideHead}>
        <SideArt tag={side.tag} badgeId={side.clanBadgeId} />
        <View style={s.sideHeadBody}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${side.name}`}
            onPress={() => openPlayer(side.tag, 'cr')}
            style={({ pressed }) => [s.sideNameRow, pressed && s.pressed]}
          >
            <Text style={s.sideName} numberOfLines={1}>
              {side.name} ›
            </Text>
            <Text style={s.sideTag}>{side.tag}</Text>
          </Pressable>

          {side.clanTag ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${side.clanName ?? side.clanTag}`}
              onPress={() => openClan(side.clanTag ?? '', 'cr')}
              style={({ pressed }) => [s.clanRow, pressed && s.pressed]}
            >
              {badge ? (
                <Image
                  source={badge}
                  style={s.clanBadge}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <Text style={s.clanName} numberOfLines={1}>
                {side.clanName ?? side.clanTag} ›
              </Text>
            </Pressable>
          ) : (
            <Text style={s.noClan}>No clan</Text>
          )}
        </View>
      </View>

      <CardGrid
        cards={side.cards}
        showCopies={false}
        onPressCard={onPressCard}
        emptyLabel="The log carried no deck for this player."
      />
      {side.supportCards.length > 0 && (
        <Text style={s.tower} numberOfLines={2}>
          Tower troop · {side.supportCards.map((c) => text(c['name'])).join(', ')}
        </Text>
      )}

      <Text style={s.towers}>{towers}</Text>
      {stats.length > 0 && (
        <Text style={s.stats} numberOfLines={4}>
          {stats.join(' · ')}
        </Text>
      )}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    list: { gap: 8 },
    more: { marginTop: 12, alignSelf: 'flex-start' },
    pressed: { opacity: 0.75 },

    row: {
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
      overflow: 'hidden',
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 10,
    },
    // A chip wide enough for the word. Fixed width rather than hugging its
    // text, so "Victory" and "Draw" rows still line their titles up.
    badge: {
      width: 62,
      paddingVertical: 6,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.sm,
      flexShrink: 0,
    },
    badgeText: { fontFamily: t.fonts.display, fontSize: 10, color: t.primaryForeground },
    toneWin: { backgroundColor: t.success },
    toneLoss: { backgroundColor: t.destructive },
    toneDraw: { backgroundColor: t.muted },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.cardForeground },
    rowMeta: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 4,
      color: t.mutedForeground,
    },
    rowScore: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    trophy: { fontFamily: t.fonts.display, fontSize: 10 },
    trophyUp: { color: t.success },
    trophyDown: { color: t.destructive },
    chevron: { fontFamily: t.fonts.sans, fontSize: 13, color: t.accent, flexShrink: 0 },

    detail: {
      paddingHorizontal: 10,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    side: { paddingTop: 14 },
    sideLabel: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      letterSpacing: 0.6,
      color: t.mutedForeground,
    },
    // Portrait beside the name and clan, which is also what replaced the accent
    // rule down the player's own half -- the YOU / OPPONENT labels already say
    // whose side a block is, and the rule only added a colour to read.
    sideHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    sideHeadBody: { flex: 1, minWidth: 0 },
    sideNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
    sideName: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground, flexShrink: 1 },
    sideTag: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    clanRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 10 },
    clanBadge: { width: 16, height: 18, flexShrink: 0 },
    clanName: { fontFamily: t.fonts.sans, fontSize: 10, color: t.accent, flexShrink: 1 },
    noClan: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      marginTop: 4,
      marginBottom: 10,
      color: t.mutedForeground,
    },
    tower: { fontFamily: t.fonts.sans, fontSize: 10, marginTop: 10, color: t.mutedForeground },
    towers: { fontFamily: t.fonts.sans, fontSize: 10, marginTop: 8, color: t.foreground },
    stats: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 16,
      marginTop: 4,
      color: t.mutedForeground,
    },

    versus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
    versusRule: { flex: 1, height: 1, backgroundColor: t.border },
    versusText: { fontFamily: t.fonts.display, fontSize: 11, color: t.mutedForeground },

    footer: {
      fontFamily: t.fonts.sans,
      fontSize: 9,
      lineHeight: 15,
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
      color: t.mutedForeground,
    },

    subHead: {
      fontFamily: t.fonts.display,
      fontSize: 13,
      color: t.foreground,
      marginTop: 22,
      marginBottom: 8,
    },
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
    modeArt: { width: 26, height: 26, flexShrink: 0 },
    modeBody: { flex: 1, minWidth: 0 },
    modeName: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    modeMeta: { fontFamily: t.fonts.sans, fontSize: 9, marginTop: 3, color: t.mutedForeground },
    modeCrowns: { marginTop: 4 },
  });
