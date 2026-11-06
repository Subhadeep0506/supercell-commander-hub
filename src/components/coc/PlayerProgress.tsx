import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { bookArtAt, townHallArt } from '@/assets/art';
import type { CollectionSection } from '@/lib/player-collection';
import { playerProgress, type PlayerContext, type ProgressRow } from '@/lib/player-progress';
import { Collapsible } from '@/components/ui/Collapsible';
import { Meter } from '@/components/ui/Meter';
import { Panel } from '@/components/ui/Panel';
import { Ring } from '@/components/ui/Ring';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art } from './CocBits';
import { UnitGrid } from './UnitGrid';

/**
 * How far through its hall an account is, and whether it got there honestly.
 *
 * The Builder Plan has shown this for your own village since it was written,
 * but only ever for yours -- it is driven by a pasted export. This is the same
 * question answered from the player endpoint, which means it works for every
 * clan member, war opponent and leaderboard row as well.
 *
 * **It is army-only, and the footnote says so.** The service publishes no
 * building levels, so these percentages and the Builder Plan's will disagree
 * on the same account. Pretending otherwise would be the worse option.
 */
export function PlayerProgress({
  sections,
  hallLevel,
  village,
  onVillage,
  context,
}: {
  sections: CollectionSection[];
  hallLevel: number;
  village: 'home' | 'builderBase';
  onVillage: (v: 'home' | 'builderBase') => void;
  context: PlayerContext;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const base = village === 'builderBase' ? 'builder' : 'home';

  const progress = useMemo(
    () => playerProgress(sections, hallLevel, base),
    [sections, hallLevel, base],
  );

  const hallArt =
    base === 'home'
      ? (townHallArt(hallLevel) ?? bookArtAt('home/town-hall', hallLevel)?.source)
      : bookArtAt('builder/builder-hall', hallLevel)?.source;

  const headline = progress.rows.filter((r) => r.inHeadline);
  const extras = progress.rows.filter((r) => !r.inHeadline);

  return (
    <Panel>
      {/*
        The village switch lives here rather than in the Army panel below,
        because it now governs both and a control has to sit above what it
        changes -- switched from inside the Army panel, the card it retitles
        was off the top of the screen.
      */}
      <Tabs
        value={village}
        onChange={onVillage}
        tabs={[
          { id: 'home', label: 'Home Village' },
          { id: 'builderBase', label: 'Builder Base' },
        ]}
      />

      {/* A label that does not move with the hall level, so the browser
          checks have something stable to scroll to. */}
      <View style={s.head} accessibilityLabel="Hall progress">
        <Text style={s.title}>{progress.hallName} progress</Text>
        {hallArt ? (
          <Image source={hallArt} resizeMode="contain" style={s.hallArt} accessibilityLabel="" />
        ) : null}
      </View>

      <View style={s.summary}>
        <Ring
          pct={progress.pct}
          label={`${Math.round(progress.pct)} percent complete for ${progress.hallLabel}`}
        />
        <View style={s.summaryText}>
          {progress.rushed ? (
            <View style={s.rushedPill}>
              <Text style={s.rushedText}>⚠ Rushed · {Math.round(progress.rushedPct)}%</Text>
            </View>
          ) : null}
          <Text style={s.levels}>
            {Math.round(progress.have).toLocaleString('en-US')} /{' '}
            {progress.total.toLocaleString('en-US')} levels
          </Text>
        </View>
      </View>

      {headline.map((row) => (
        <Row key={row.id} row={row} hallLabel={progress.hallLabel} context={context} />
      ))}

      {extras.length > 0 ? <View style={s.divider} /> : null}
      {extras.map((row) => (
        <Row key={row.id} row={row} hallLabel={progress.hallLabel} context={context} />
      ))}

      {/* The list is built from the rows actually on screen: the Builder Base
          has no spells and no siege machines, and naming them there would be
          describing a measurement that never happened. */}
      <Text style={s.note}>
        Measured over {list(headline.map((r) => r.name.toLowerCase()))} against what this hall
        allows. The game service publishes no building levels, so defenses and buildings are not
        counted.
        {progress.rushed
          ? ' "Rushed" is how far short of the previous hall the army still is.'
          : ''}
      </Text>
    </Panel>
  );
}

/** "heroes, troops and spells" -- an Oxford-free list for the footnote. */
function list(names: string[]): string {
  if (names.length === 0) return 'nothing';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** One category: a bar, a warning count, and what is left behind a chevron. */
function Row({
  row,
  hallLabel,
  context,
}: {
  row: ProgressRow;
  hallLabel: string;
  context: PlayerContext;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  return (
    <View style={s.row}>
      <Collapsible
        accessibilityLabel={`${row.name}, ${Math.round(row.pct)} percent`}
        summary={() => (
          <View style={s.rowSummary}>
            <View style={s.rowTop}>
              <Art name={row.icon} size={34} />
              <Text style={s.rowName} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={s.rowPct}>{Math.round(row.pct)}%</Text>
              {/*
                `> 0`, never a bare `row.behind &&`: a zero renders as a text
                node inside a View, which the browser only warns about and
                Android crashes on.
              */}
              {row.behind > 0 ? (
                <Text
                  style={s.behind}
                  accessibilityLabel={`${row.behind} behind the previous hall`}
                >
                  ⚠ {row.behind}
                </Text>
              ) : null}
            </View>
            <Meter value={row.pct} style={s.rowMeter} />
          </View>
        )}
      >
        {row.left.length > 0 ? (
          <>
            <Text style={s.leftTitle}>Left to upgrade for {hallLabel}</Text>
            {/*
              Not just `row.name`: the Army panel below has a grid labelled
              "Spells" too, and an unscoped lookup -- a screen reader's, or a
              check script's -- would find whichever came first in the DOM.
            */}
            <UnitGrid
              entries={row.left}
              label={`${row.name} left to upgrade`}
              remaining
              context={context}
            />
          </>
        ) : (
          <Text style={s.leftTitle}>Everything this hall allows is maxed.</Text>
        )}
      </Collapsible>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    hallArt: { width: 46, height: 46, flexShrink: 0 },

    summary: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
    summaryText: { flex: 1, minWidth: 0, gap: 8 },
    rushedPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: `${t.destructive}33`,
    },
    rushedText: { color: t.destructive, fontFamily: t.fonts.display, fontSize: 12 },
    levels: { fontFamily: t.fonts.display, fontSize: 14, color: t.mutedForeground },

    row: { marginTop: 18 },
    // A column inside Collapsible's row-shaped summary slot, so the bar runs
    // the width of the row and the chevron stays pinned right.
    rowSummary: { flex: 1, minWidth: 0 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowName: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    rowPct: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    behind: {
      color: t.destructive,
      fontFamily: t.fonts.display,
      fontSize: 12,
    },
    rowMeter: { marginTop: 8 },

    divider: { height: 1, marginTop: 18, backgroundColor: t.border },

    leftTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },

    note: { marginTop: 18, fontSize: 10, lineHeight: 16, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
