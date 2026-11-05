import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { resourceArt } from '@/assets/art';
import { raidMedalArt } from '@/assets/capital';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord, type GameResult } from '@/api/game-api';
import {
  compactNumber,
  dateRange,
  formatDuration,
  groupedNumber,
  nextCursor,
  raidCountdown,
  raidSummary,
  raidTotals,
  shortDate,
} from '@/lib/clan';
import { useCountdown } from '@/hooks/use-countdown';
import { Meter } from '@/components/ui/Meter';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Source } from '../CocBits';
import { EmptyState, StatCell, StatStrip } from './ClanBits';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { RaidLog } from './RaidLog';

/** One page of raid weekends. Ten is roughly a season's worth. */
const PAGE = 10;

/**
 * Parses one page, as a React Query `select`.
 *
 * It has to be `select` rather than a `useMemo` over the query results:
 * `useQueries` returns a fresh array every render, so a memo keyed on it would
 * re-parse on each one -- and with the attack and defence logs included a page
 * is close to two megabytes of JSON. React Query memoises `select` per query,
 * so this runs only when the underlying data actually changes.
 *
 * The original result is carried through so the footer can still report a
 * service error.
 */
function selectRaids(result: GameResult) {
  if (!result.ok) return { seasons: [] as ApiRecord[], after: undefined, result };
  try {
    const parsed = JSON.parse(result.data);
    return { seasons: rows(record(parsed)['items']), after: nextCursor(parsed), result };
  } catch {
    return { seasons: [] as ApiRecord[], after: undefined, result };
  }
}

/**
 * Capital raid weekends.
 *
 * Every figure on this screen is summed or divided from what
 * `capitalraidseasons` returns for the selected weekend -- loot per attack,
 * medals, attack completion -- so nothing is estimated. The only value the API
 * does not supply is when the *next* weekend opens, which is a fixed schedule
 * (see `raidCountdown`) and is only computed when no weekend is running.
 *
 * Older weekends arrive through the API's own `after` cursor, one page at a
 * time, rather than by asking for a large limit up front.
 */
export function ClanCapitalRaids({ tag }: { tag: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<string>();

  // One query per page. Keeping them separate means a loaded page stays cached
  // and is never refetched just because a newer one arrived.
  const pages = useQueries({
    queries: [undefined, ...cursors].map((after) => ({
      ...gameQuery({ game: 'coc', resource: 'capitalRaids', tag, limit: PAGE, after }),
      select: selectRaids,
    })),
  });

  // Cheap: the expensive parse already happened inside `select`.
  const seasons = useMemo(() => pages.flatMap((p) => p.data?.seasons ?? []), [pages]);
  const summary = useMemo(() => raidSummary(seasons), [seasons]);

  const after = pages[pages.length - 1]?.data?.after;
  const countdown = useMemo(() => raidCountdown(seasons), [seasons]);
  const remaining = useCountdown(countdown?.target);

  const loading = pages.some((p) => p.isFetching);
  const failed = pages.find((p) => p.data && !p.data.result.ok)?.data?.result;

  // Above the empty-state return below, because a hook cannot sit after one.
  // Keyed on the selected weekend so stepping to an older one starts at the top
  // of its roster rather than four pages into the previous one's.
  const members = useMemo(() => {
    const week = seasons[Math.min(selected, Math.max(0, seasons.length - 1))];
    return week
      ? [...rows(week['members'])].sort(
          (a, b) =>
            (Number(b['capitalResourcesLooted']) || 0) -
            (Number(a['capitalResourcesLooted']) || 0),
        )
      : [];
  }, [seasons, selected]);
  const pagedMembers = usePaged(members, selected);

  if (!loading && !seasons.length) {
    return failed ? (
      <View>
        <EmptyState
          title="No raid data"
          body="The game service did not return any raid weekends for this clan."
        />
        <Source result={failed} />
      </View>
    ) : (
      <EmptyState
        title="No raid weekends yet"
        body="This clan has not finished a Capital raid weekend. Once it does, every weekend shows up here."
      />
    );
  }

  const season = seasons[Math.min(selected, Math.max(0, seasons.length - 1))];
  const totals = season ? raidTotals(season) : undefined;
  const previous = seasons[selected + 1];
  const delta =
    totals && previous
      ? (totals.loot - raidTotals(previous).loot) / Math.max(1, raidTotals(previous).loot)
      : undefined;

  const gold = resourceArt('Capital Gold');
  const medal = raidMedalArt();

  return (
    <View style={s.stack}>
      <Panel>
        <View style={s.head}>
          {gold ? <Image source={gold} style={s.headIcon} resizeMode="contain" /> : null}
          <View style={s.headText}>
            <Text style={s.title}>Raid Weekends</Text>
            {countdown ? (
              <Text style={s.countdown}>
                {countdown.label} {formatDuration(remaining)}
              </Text>
            ) : null}
          </View>
        </View>

        {summary ? (
          <StatStrip style={s.strip}>
            <StatCell value={compactNumber(summary.avgLoot)} label="Avg. loot" icon={gold} />
            <View style={s.divider} />
            <StatCell value={compactNumber(summary.bestLoot)} label="Best weekend" icon={gold} />
            <View style={s.divider} />
            <StatCell
              value={Math.round(summary.avgMedals)}
              label="Avg. medals"
              icon={medal}
              glyph="🎖"
            />
          </StatStrip>
        ) : null}
      </Panel>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.stripScroll}
        contentContainerStyle={s.stripTrack}
        accessibilityLabel="Raid weekends"
      >
        {seasons.map((item, i) => {
          const loot = raidTotals(item).loot;
          const share = summary?.bestLoot ? loot / summary.bestLoot : 0;
          const on = i === selected;
          return (
            <Pressable
              key={text(item['startTime']) + i}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Weekend of ${shortDate(item['startTime'])}`}
              style={[s.weekend, on && s.weekendOn]}
              onPress={() => {
                setSelected(i);
                setExpanded(undefined);
              }}
            >
              <Text style={[s.weekendDate, on && s.weekendDateOn]}>
                {shortDate(item['startTime'])}
              </Text>
              <Text style={s.weekendLoot}>
                {gold ? null : '🪙 '}
                {compactNumber(loot)}
              </Text>
              <View style={s.weekendBar}>
                <View style={[s.weekendBarFill, on && s.weekendBarFillOn, { flexGrow: share }]} />
                <View style={{ flexGrow: Math.max(0, 1 - share) }} />
              </View>
            </Pressable>
          );
        })}

        {after ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Load older weekends"
            style={[s.weekend, s.loadMore]}
            onPress={() => setCursors((c) => [...c, after])}
          >
            <Text style={s.loadMoreText}>Load{'\n'}older ›</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {season && totals ? (
        <Panel>
          <View style={s.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Newer weekend"
              disabled={selected === 0}
              onPress={() => {
                setSelected((i) => Math.max(0, i - 1));
                setExpanded(undefined);
              }}
            >
              <Text style={[s.arrow, selected === 0 && s.arrowOff]}>‹</Text>
            </Pressable>
            <Text style={s.range}>{dateRange(season['startTime'], season['endTime'])}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Older weekend"
              disabled={selected >= seasons.length - 1}
              onPress={() => {
                setSelected((i) => Math.min(seasons.length - 1, i + 1));
                setExpanded(undefined);
              }}
            >
              <Text style={[s.arrow, selected >= seasons.length - 1 && s.arrowOff]}>›</Text>
            </Pressable>
          </View>

          {delta === undefined ? null : (
            <View style={[s.delta, delta >= 0 ? s.deltaUp : s.deltaDown]}>
              <Text style={[s.deltaText, delta >= 0 ? s.deltaTextUp : s.deltaTextDown]}>
                {delta >= 0 ? '↗' : '↘'} {delta >= 0 ? '+' : ''}
                {Math.round(delta * 100)}% vs previous weekend
              </Text>
            </View>
          )}

          <View style={s.lootRow}>
            {gold ? <Image source={gold} style={s.lootIcon} resizeMode="contain" /> : null}
            <View>
              <Text style={s.loot}>{groupedNumber(totals.loot)}</Text>
              <Text style={s.perAttack}>{compactNumber(totals.perAttack)} per attack</Text>
            </View>
          </View>

          <View style={s.attackHead}>
            <Text style={s.attackLabel}>Attacks</Text>
            <Text style={s.attackValue}>
              {totals.attacks} / {totals.attackLimit}
            </Text>
          </View>
          <Meter value={totals.attacks} max={totals.attackLimit} style={s.attackMeter} />

          <StatStrip style={s.strip}>
            <StatCell value={totals.districts} label="Districts" />
            <View style={s.divider} />
            <StatCell value={totals.raids} label="Raids" />
            <View style={s.divider} />
            <StatCell value={totals.medals} label="Medals" icon={medal} glyph="🎖" />
          </StatStrip>

          <Text style={s.split}>
            {totals.offense} offense · {totals.defense} defense
          </Text>
        </Panel>
      ) : null}

      {members.length ? (
        <Panel>
          <View style={s.membersHead}>
            <Text style={s.title}>Members</Text>
            <Text style={s.count}>{members.length}</Text>
          </View>

          {pagedMembers.shown.map((member, i) => {
            const key = text(member['tag']) + i;
            const limit =
              (Number(member['attackLimit']) || 0) + (Number(member['bonusAttackLimit']) || 0);
            const used = Number(member['attacks']) || 0;
            const looted = Number(member['capitalResourcesLooted']) || 0;
            const open = expanded === key;

            return (
              <View key={key} style={[s.memberRow, i > 0 && s.memberDivider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${text(member['name'])} looted ${groupedNumber(looted)} capital gold`}
                  style={s.memberMain}
                  onPress={() => setExpanded(open ? undefined : key)}
                >
                  <View style={[s.medal, i < 3 && s[`medal${i}` as 'medal0']]}>
                    <Text style={s.medalText}>{i + 1}</Text>
                  </View>

                  <View style={s.memberText}>
                    <Text style={s.memberName} numberOfLines={1}>
                      {text(member['name'])}
                    </Text>
                    <View style={s.pips}>
                      {Array.from({ length: limit }, (_, p) => (
                        <View key={p} style={[s.pip, p < used && s.pipOn]} />
                      ))}
                    </View>
                  </View>

                  <Text style={s.memberLoot}>{groupedNumber(looted)}</Text>
                  <Text style={s.chevron}>{open ? '⌄' : '›'}</Text>
                </Pressable>

                {open ? (
                  <View style={s.detail}>
                    <DetailRow
                      label="Attacks"
                      value={`${used} / ${limit}${
                        Number(member['bonusAttackLimit']) > 0 ? ' (incl. bonus)' : ''
                      }`}
                      theme={theme}
                    />
                    <DetailRow
                      label="Looted"
                      value={`${groupedNumber(looted)} capital gold`}
                      theme={theme}
                    />
                    <DetailRow
                      label="Average"
                      value={used > 0 ? `${groupedNumber(looted / used)} per attack` : '—'}
                      theme={theme}
                    />
                    {/* A sibling of the row's own Pressable, never a child --
                        on web a nested one would also re-collapse the row. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View ${text(member['name'])}`}
                      onPress={() => openPlayer(text(member['tag']), 'coc')}
                    >
                      <Text style={s.profileLink}>View profile ›</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

          <LoadMore
            remaining={pagedMembers.remaining}
            onPress={pagedMembers.loadMore}
            noun="raiders"
            style={s.moreMembers}
          />
        </Panel>
      ) : null}

      {/* Both logs belong to the selected weekend, so they sit below its
          member list rather than beside the weekend strip. */}
      {season ? (
        <>
          <RaidLog log={rows(season['attackLog'])} title="Attacks" side="attack" />
          <RaidLog log={rows(season['defenseLog'])} title="Defences" side="defense" />
        </>
      ) : null}

      {loading ? <Text style={s.loading}>Loading raid weekends…</Text> : null}
      {failed ? <Source result={failed} /> : null}
    </View>
  );
}

function DetailRow({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 14 },
    moreMembers: { marginTop: 12, alignSelf: 'flex-start' },

    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headIcon: { width: 44, height: 44 },
    headText: { flex: 1, minWidth: 0 },
    title: { fontFamily: t.fonts.display, fontSize: 17, color: t.foreground },
    countdown: { marginTop: 4, fontSize: 12, color: t.primary, fontFamily: t.fonts.sans },

    strip: { marginTop: 16 },
    divider: { width: 1, backgroundColor: t.border },

    stripScroll: { flexGrow: 0 },
    stripTrack: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    weekend: {
      width: 104,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    weekendOn: { borderColor: t.cocHighlight, borderWidth: 2 },
    weekendDate: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    weekendDateOn: { color: t.cocHighlight },
    weekendLoot: { marginTop: 5, fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    weekendBar: {
      flexDirection: 'row',
      height: 4,
      marginTop: 8,
      borderRadius: 999,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    weekendBarFill: { flexBasis: 0, backgroundColor: t.mutedForeground },
    weekendBarFillOn: { backgroundColor: t.cocHighlight },
    loadMore: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
    loadMoreText: {
      textAlign: 'center',
      fontFamily: t.fonts.display,
      fontSize: 12,
      lineHeight: 17,
      color: t.primary,
    },

    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    arrow: { fontSize: 24, color: t.primary, paddingHorizontal: 8 },
    arrowOff: { color: t.border },
    range: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 15, color: t.foreground },

    delta: {
      alignSelf: 'center',
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
    },
    deltaUp: { backgroundColor: `${t.success}26` },
    deltaDown: { backgroundColor: `${t.destructive}26` },
    deltaText: { fontFamily: t.fonts.display, fontSize: 11 },
    deltaTextUp: { color: t.success },
    deltaTextDown: { color: t.destructive },

    lootRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
    lootIcon: { width: 42, height: 42 },
    loot: { fontFamily: t.fonts.display, fontSize: 26, color: t.foreground },
    perAttack: { marginTop: 2, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    attackHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 18,
      marginBottom: 8,
    },
    attackLabel: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    attackValue: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    attackMeter: { height: 8 },

    split: { marginTop: 12, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    membersHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
    count: { fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },

    memberRow: { paddingVertical: 4 },
    memberDivider: { borderTopWidth: 1, borderTopColor: t.border },
    memberMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    medal: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: t.muted,
    },
    medal0: { backgroundColor: t.cocHighlight },
    medal1: { backgroundColor: t.mutedForeground },
    medal2: { backgroundColor: t.rarity.rare },
    medalText: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },

    memberText: { flex: 1, minWidth: 0 },
    memberName: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    pips: { flexDirection: 'row', gap: 3, marginTop: 5 },
    pip: { width: 12, height: 4, borderRadius: 2, backgroundColor: t.border },
    pipOn: { backgroundColor: t.cocHighlight },
    memberLoot: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    chevron: { width: 14, textAlign: 'center', fontSize: 13, color: t.primary },

    detail: { paddingLeft: 36, paddingBottom: 10, gap: 5 },
    profileLink: { marginTop: 4, fontFamily: t.fonts.display, fontSize: 11, color: t.primary },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    detailLabel: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    detailValue: { fontSize: 11, color: t.foreground, fontFamily: t.fonts.sans },

    loading: {
      paddingVertical: 18,
      textAlign: 'center',
      fontSize: 13,
      color: t.primary,
      fontFamily: t.fonts.sans,
    },
  });
