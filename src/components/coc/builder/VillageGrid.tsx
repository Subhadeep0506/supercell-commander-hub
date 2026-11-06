import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { VillageSide } from '@/lib/village-export';
import { SECTIONS, completion, ownedOf, sectionItems, wallsLeft } from '@/lib/village-plan';
import { ChipRow } from '@/components/ui/ChipRow';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ItemTile, SectionBar } from './BuilderBits';

/**
 * Everything the village owns, grouped the way the game groups it.
 *
 * Section percentages use the same level-weighted formula as the headline
 * figure, so they always sum consistently with it. Tapping any card opens the
 * Clash Book entry at the owned level.
 */
export function VillageGrid({
  side,
  onOpenItem,
}: {
  side: VillageSide;
  onOpenItem: (catalogId: string, level: number) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [filter, setFilter] = useState<string>('all');

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        items: sectionItems(side, section.categories),
        progress: completion(side, section.categories),
      })).filter((section) => section.items.length > 0),
    [side],
  );

  const total = sections.reduce((n, section) => n + section.items.length, 0);
  const shown = filter === 'all' ? sections : sections.filter((section) => section.id === filter);

  return (
    <Panel>
      <Text style={s.title}>Your village</Text>

      <ChipRow
        accessibilityLabel="Village filter"
        value={filter}
        onChange={setFilter}
        chips={[
          { id: 'all', label: 'All', count: total },
          ...sections.map((section) => ({
            id: section.id,
            label: section.label,
            count: section.items.length,
          })),
        ]}
      />

      {shown.map((section) => (
        <View key={section.id} style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>{section.label}</Text>
            <Text style={s.sectionPct}>{Math.round(section.progress.pct)}%</Text>
          </View>
          <SectionBar pct={section.progress.pct} />

          {section.id === 'walls' ? (
            <Walls side={side} theme={theme} onOpenItem={onOpenItem} />
          ) : (
            <View style={s.grid}>
              {section.items.map((entry) => (
                <ItemTile
                  key={entry.item.id}
                  catalogId={entry.item.id}
                  level={entry.level}
                  count={entry.count}
                  size={62}
                  maxed={entry.maxed}
                  gameMaxed={entry.gameMaxed}
                  progress={entry.maxLevel > 0 ? entry.level / entry.maxLevel : 0}
                  onPress={() => onOpenItem(entry.item.id, entry.level)}
                  // A crafted defense has no single level, so its three module
                  // levels are named here rather than hidden behind one number.
                  accessibilityLabel={
                    entry.owned?.modules?.length
                      ? `View ${entry.item.name} · ${entry.owned.modules
                          .map((m) => `${m.name} ${m.level}`)
                          .join(' · ')}`
                      : `View ${entry.item.name}`
                  }
                />
              ))}
            </View>
          )}
        </View>
      ))}
    </Panel>
  );
}

/** Walls are a count, not a grid -- hundreds of identical tiles say nothing. */
function Walls({
  side,
  theme,
  onOpenItem,
}: {
  side: VillageSide;
  theme: Theme;
  onOpenItem: (catalogId: string, level: number) => void;
}) {
  const s = useMemo(() => build(theme), [theme]);
  const id = side.base === 'home' ? 'home/wall' : 'builder/wall';
  const owned = ownedOf(side, id);
  const left = wallsLeft(side);
  if (!owned) return null;

  return (
    <View style={s.walls}>
      <ItemTile
        catalogId={id}
        level={owned.level}
        size={44}
        onPress={() => onOpenItem(id, owned.level)}
        accessibilityLabel="View Wall"
      />
      <View style={s.wallsText}>
        <Text style={s.wallsCount}>{owned.count} walls</Text>
        <View style={s.wallsLevels}>
          {owned.byLevel.map((bucket, i) => (
            <Text key={i} style={s.wallsChip}>
              Lv {bucket.level} x{bucket.count}
            </Text>
          ))}
        </View>
      </View>
      <Text style={s.wallsLeft}>{Math.max(0, left.total - left.have)} to go</Text>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    title: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    section: { marginTop: 16 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    sectionPct: { fontFamily: t.fonts.display, fontSize: 12, color: t.primary },
    // 6px read as one solid block of artwork. 10 still fits five 62px tiles
    // across a 372px panel, so no column is lost to the extra breathing room.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },

    walls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    wallsText: { flex: 1, minWidth: 0 },
    wallsCount: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    wallsLevels: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
    wallsChip: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: t.muted,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
      fontSize: 10,
    },
    wallsLeft: { fontFamily: t.fonts.display, fontSize: 11, color: t.mutedForeground },
  });
