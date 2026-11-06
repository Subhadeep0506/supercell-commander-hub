import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { COC_ART, bookArt, hasLevelArt, resourceArt, townHallArt } from '@/assets/art';
import { StatIcon, STAT_ICON_FOR, type StatIconName } from '@/components/ui/StatIcon';
import {
  BOOK_ITEMS,
  bookCategory,
  bookLevels,
  fieldLabel,
  flattenBook,
  itemArt,
  levelSections,
  playerLevelIndex,
  relatedItems,
  superchargeLevels,
  type BookItem,
  type BookRecord,
} from '@/lib/clash-book';
import { formatDuration } from '@/lib/clan';
import { remainingUpgradeCost, type PlayerContext } from '@/lib/player-progress';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { Sheet } from '@/components/ui/Sheet';
import { Slider } from '@/components/ui/Slider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type Field = { label: string; value: string | number; max?: number; currency?: string };

/**
 * Descriptive, level-independent attributes promoted out of "More information"
 * into their own grid -- these are what a player actually looks up, and the
 * reference app buried them behind a collapsed summary.
 */
const DETAIL_KEYS = [
  'preferredTarget',
  'favoriteTarget',
  'attackType',
  'damageType',
  'unitType',
  'movementSpeed',
  'attackSpeed',
  'range',
  'searchRadius',
  'housingSpace',
  'trainingTime',
  'size',
  'specialAbility',
] as const;

type GridCell = {
  label: string;
  value: string | number;
  icon?: StatIconName;
  art?: ImageSourcePropType;
};

/**
 * Artwork for a "Needs" row: the building that gates the upgrade.
 *
 * Town Hall is special-cased to its own per-level render where one exists
 * (TH9-18), so "Town Hall Required 18" shows the actual TH18.
 */
function requirementArt(key: string, level: number): ImageSourcePropType | undefined {
  if (/townHall/i.test(key)) return townHallArt(level) ?? bookArt('home/town-hall')?.source;
  const map: Record<string, string> = {
    laboratoryRequired: 'home/laboratory',
    heroHallLevelRequired: 'home/hero-hall',
    blacksmithLevelRequired: 'home/blacksmith',
    builderHallRequired: 'builder/builder-hall',
    builderHallLevelRequired: 'builder/builder-hall',
    petHouseLevelRequired: 'home/pet-house',
    starLabRequired: 'builder/star-laboratory',
  };
  const id = map[key];
  return id ? bookArt(id)?.source : undefined;
}

/** Two-column grid for the short, level-independent rows. */
function FieldGrid({ cells }: { cells: GridCell[] }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.grid}>
      {cells.map((cell, i) => (
        <View key={i} style={s.cell}>
          <View style={s.cellIcon}>
            {cell.art ? (
              <Image source={cell.art} style={s.cellArt} resizeMode="contain" />
            ) : cell.icon ? (
              <StatIcon name={cell.icon} size={22} />
            ) : null}
          </View>
          <View style={s.cellText}>
            <Text style={s.cellLabel} numberOfLines={2}>
              {cell.label}
            </Text>
            <Text style={s.cellValue} numberOfLines={1}>
              {typeof cell.value === 'number' ? cell.value.toLocaleString('en-US') : cell.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Resolves the icon for a field row. */
function iconFor(field: Field) {
  // A cost row folded in from its sibling "… Resource" row.
  if (field.currency) return resourceArt(field.currency);
  // Resource rows name their currency in the value ("Dark Elixir").
  if (/resource/i.test(field.label) && typeof field.value === 'string') {
    return resourceArt(field.value);
  }
  // Hero equipment upgrades cost ores: upgradeShinyOre -> "Upgrade Shiny Ore".
  const ore = /\b(shiny|glowing|starry)\s+ore\b/i.exec(field.label);
  if (ore) return resourceArt(`${ore[1][0]!.toUpperCase()}${ore[1].slice(1).toLowerCase()} Ore`);
  if (/time/i.test(field.label)) return COC_ART['clock'];
  return undefined;
}

/**
 * Folds "Build Cost Resource: Elixir" into "Build Cost: 26,000,000" so the
 * amount carries its own currency icon instead of occupying a separate row.
 */
function mergeCostRows(fields: Field[]): Field[] {
  const resources = new Map<string, string>();
  for (const f of fields) {
    const m = /^(.*)\sResource$/i.exec(f.label);
    if (m && typeof f.value === 'string') resources.set(m[1]!, f.value);
  }
  return fields
    .filter((f) => !/\sResource$/i.test(f.label))
    .map((f) => {
      const currency = resources.get(f.label);
      return currency ? { ...f, label: `${f.label} · ${currency}`, currency } : f;
    });
}

/** `.book-fields` -- a label/value grid with currency, time and progress. */
function Fields({ values }: { values: Field[] }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.fields}>
      {values.map((field, i) => {
        const icon = iconFor(field);
        const showBar =
          typeof field.value === 'number' && typeof field.max === 'number' && field.max > 0;
        const pct = showBar
          ? Math.max(0, Math.min(100, ((field.value as number) / field.max!) * 100))
          : 0;
        return (
          <View key={i} style={s.field}>
            <View style={s.fieldTop}>
              <View style={s.fieldLabelRow}>
                {icon ? <Image source={icon} style={s.fieldIcon} resizeMode="contain" /> : null}
                <Text style={s.fieldLabel}>{field.label}</Text>
              </View>
              <Text style={s.fieldValue}>
                {typeof field.value === 'number' ? field.value.toLocaleString('en-US') : field.value}
                {showBar && field.max !== field.value ? (
                  <Text style={s.fieldMax}> / {field.max!.toLocaleString('en-US')}</Text>
                ) : null}
              </Text>
            </View>
            {showBar ? (
              <View style={s.bar}>
                <View style={[s.barFill, { width: `${pct}%` }]} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Ported from frontend/src/components/book-item-modal.tsx, then extended.
 *
 * `initialLevel` is set when the modal is opened from a player's unit tile; it
 * selects that level and adds the "Next upgrade" section. Opened from the book
 * itself it is undefined, and the max level is shown.
 */
export function BookItemModal({
  item,
  initialLevel,
  startLevel,
  context,
  open,
  onClose,
}: {
  item: BookItem;
  initialLevel?: number;
  /**
   * Opens on this level without claiming the player has one.
   *
   * A locked or not-yet-built entry opens at level 1 so the card shows what
   * unlocking it costs. `initialLevel` cannot do that job: it is what adds the
   * "Your player level" line and the "Next upgrade" section.
   */
  startLevel?: number;
  /**
   * The village this card was opened from.
   *
   * Every player-facing section below is gated on it, so the Clash Book screen
   * -- which browses the catalog with no player in sight -- renders exactly
   * the card it rendered before.
   */
  context?: PlayerContext;
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [stack, setStack] = useState<Layer[]>(() => [layerFor(item, initialLevel, startLevel)]);

  const top = stack[stack.length - 1]!;
  const topRow = bookLevels(top.item)[top.index];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      // Only the top card is interactive, so a back arrow appears exactly when
      // there is something underneath it.
      onBack={stack.length > 1 ? () => setStack((st) => st.slice(0, -1)) : undefined}
      title={
        <Text style={s.title} numberOfLines={2}>
          {top.item.name}
          {topRow ? <Text style={s.titleLevel}> · Level {String(topRow['level'])}</Text> : null}
        </Text>
      }
    >
      {stack.map((layer, i) => (
        <BookItemCard
          key={`${layer.item.id}-${i}`}
          layer={layer}
          context={context}
          hidden={i !== stack.length - 1}
          onIndex={(index) =>
            setStack((st) => st.map((l, n) => (n === st.length - 1 ? { ...l, index } : l)))
          }
          // A pushed layer inherits the player's own level where there is one,
          // so stepping from an equipment card to the hero wearing it opens on
          // that hero's level rather than on the game maximum.
          onOpen={(next) => setStack((st) => [...st, layerFor(next, context?.levelOf(next.id))])}
        />
      ))}
    </Sheet>
  );
}

/**
 * One entry in the modal's own stack.
 *
 * The selected level lives here rather than inside the card so that popping
 * back restores the level the player was looking at, and so the sheet header
 * can show it. Same reasoning as the clan DetailSheet's layer stack.
 */
type Layer = { item: BookItem; initialLevel?: number; index: number };

function layerFor(item: BookItem, initialLevel?: number, startLevel?: number): Layer {
  const levels = bookLevels(item);
  const at = initialLevel ?? startLevel;
  return {
    item,
    initialLevel,
    index: at === undefined ? Math.max(0, levels.length - 1) : playerLevelIndex(item, at),
  };
}

function BookItemCard({
  layer,
  context,
  hidden,
  onIndex,
  onOpen,
}: {
  layer: Layer;
  context?: PlayerContext;
  hidden: boolean;
  onIndex: (index: number) => void;
  onOpen: (item: BookItem) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { item, initialLevel, index } = layer;
  const levels = bookLevels(item);
  const setIndex = (next: number | ((i: number) => number)) =>
    onIndex(typeof next === 'function' ? next(index) : next);

  const [expanded, setExpanded] = useState(false);
  const related = relatedItems(item);
  const supercharge = superchargeLevels(item);

  const row = levels[index];
  const sections = row ? levelSections(row) : undefined;
  // Keyed off the selected row, so moving the slider changes the picture and
  // not just the numbers. Items with no per-level art fall back to their one
  // image inside `itemArt` -- see the source note at the foot of this card.
  const image = itemArt(item, row ? Number(row['level']) : undefined);
  const nextRow = initialLevel !== undefined && index >= 0 ? levels[index + 1] : undefined;
  const nextSections = nextRow ? levelSections(nextRow) : undefined;

  // Each stat is paired with the same stat at the item's highest level, so a
  // bare "Hit points 1,520" becomes "1,520 / 7,200" with a bar. Matching by
  // label works because both rows are flattened the same way.
  const maxByLabel = useMemo(() => {
    const top = levels[levels.length - 1];
    const m = new Map<string, number>();
    if (!top) return m;
    for (const f of levelSections(top).stats) {
      if (typeof f.value === 'number') m.set(f.label, f.value);
    }
    return m;
  }, [levels]);

  // Hero equipment nests its numbers under a `stats` object, which flattens to
  // "Stats · Ability Duration". The prefix carries no information once the row
  // is already inside the "At level N" section.
  const stats: Field[] = (sections?.stats ?? []).map((f) => ({
    ...f,
    max: maxByLabel.get(f.label),
    label: f.label.replace(/^Stats\s·\s/, ''),
  }));

  const details: GridCell[] = useMemo(() => {
    const picked: BookRecord = {};
    for (const key of DETAIL_KEYS) {
      if (item[key] !== undefined && item[key] !== null) picked[key] = item[key];
    }
    return Object.entries(picked).map(([k, v]) => ({
      label: fieldLabel(k),
      value: typeof v === 'number' ? v : String(v),
      icon: STAT_ICON_FOR[k],
    }));
  }, [item]);

  // Built from the raw level row rather than levelSections, because the icon
  // depends on which building gates the upgrade -- information the humanised
  // label has already lost.
  const needs: GridCell[] = useMemo(() => {
    if (!row) return [];
    return Object.entries(row)
      .filter(([k]) => /required|requirement/i.test(k))
      .map(([k, v]) => ({
        label: fieldLabel(k).replace(/\s*(Level\s*)?Required$/i, ''),
        value: typeof v === 'number' || typeof v === 'string' ? v : String(v),
        art: requirementArt(k, Number(v)),
      }));
  }, [row]);

  const general = Object.fromEntries(
    Object.entries(item).filter(
      ([key]) =>
        ![
          'id',
          'dataId',
          'base',
          'category',
          'name',
          'description',
          'levels',
          'sourcePath',
          'availablePerTownHall',
          'availablePerBuilderHall',
          // Rendered by their own sections, and far too large to flatten into
          // a label/value list.
          'modules',
          'baseItemId',
          'imagePath',
          'noArtwork',
          ...DETAIL_KEYS,
        ].includes(key),
    ),
  );

  const gameMax = levels.length ? Number(levels[levels.length - 1]!['level']) : undefined;

  /*
   * What this account can actually reach, and what the rest of the way costs.
   *
   * The service's own `maxLevel` is the *game* maximum -- a Town Hall 13
   * Barbarian comes back 9/13 when 9 is all that hall allows -- so the ceiling
   * that matters comes from the catalog's requirement rows instead. Crafted
   * defenses are excluded: they have no single level, three module tracks
   * carry the levels.
   */
  const hallMax = context && !item.modules?.length ? context.hallMaxOf(item.id) : 0;
  const owned = initialLevel ?? 0;
  const rollUp = useMemo(
    () =>
      context && hallMax > owned ? remainingUpgradeCost(item, owned, hallMax) : undefined,
    [context, hallMax, owned, item],
  );
  // Hero equipment names the hero it is worn by. Deliberately not folded into
  // `relatedItems`, which resolves both ways -- a Barbarian King card would
  // then list every one of the 43 equipment pieces.
  const wornBy = useMemo(() => {
    const hero = item['hero'];
    if (!context || typeof hero !== 'string') return undefined;
    return BOOK_ITEMS.find((i) => i.id === `${item.base}/${hero}`);
  }, [context, item]);

  const base =
    item.base === 'builder' ? 'Builder Base' : item.base === 'magic-items' ? 'Magic Items' : 'Home Village';

  return (
    <View
      style={[s.layer, hidden && s.hiddenLayer]}
      pointerEvents={hidden ? 'none' : 'auto'}
      // `display: none` drops a layer out of the browser's accessibility tree
      // but not reliably out of Android's, so it is hidden explicitly too.
      aria-hidden={hidden}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.intro}>
          <View style={s.stage}>
            {image ? (
              <Image
                source={image.source}
                accessibilityLabel={item.name}
                resizeMode="contain"
                style={s.stageImage}
              />
            ) : (
              <Text style={s.stageFallback}>{item.name}</Text>
            )}
          </View>
          <View style={s.introText}>
            {/* The hall-cap block below prints its own "Game max", two lines
                down, so this one would be the same number twice. */}
            <Text style={s.meta}>
              {bookCategory(item.category)} · {base}
              {gameMax && hallMax === 0 ? ` · Game max ${gameMax}` : ''}
            </Text>
            <Text style={s.description} numberOfLines={expanded ? undefined : 3}>
              {item.description || 'No description is included in this reference.'}
            </Text>
            {(item.description?.length ?? 0) > 160 ? (
              <Button variant="link" size="sm" onPress={() => setExpanded(!expanded)} sound={false}>
                {expanded ? 'Show less' : 'Show more'}
              </Button>
            ) : null}
          </View>
        </View>

        {related.length > 0 ? (
          <View style={s.related}>
            <Text style={s.relatedLabel}>Related</Text>
            <View style={s.relatedRow}>
              {related.map((entry) => {
                const art = itemArt(entry);
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    // Deliberately not "View X": the book grid behind the
                    // sheet labels its own tiles that way, and the two would
                    // be indistinguishable to both a screen reader and the
                    // click-path checks.
                    accessibilityLabel={`Open related ${entry.name}`}
                    style={s.relatedTile}
                    onPress={() => onOpen(entry)}
                  >
                    {art ? (
                      <Image source={art.source} resizeMode="contain" style={s.relatedArt} />
                    ) : null}
                    <Text style={s.relatedName} numberOfLines={2}>
                      {entry.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/*
          A crafted defense has no level of its own -- its three module tracks
          below carry the levels -- so none of this applies to it.

          With a village in hand the bare "Your player level: 14" becomes the
          figure a player is actually asking for: 14 of the 18 this Town Hall
          allows, against a game maximum of 27 they cannot touch yet.
        */}
        {context && hallMax > 0 && !item.modules?.length ? (
          <View style={s.hallProgress}>
            <Text style={s.hallLine}>
              Level <Text style={s.hallLevel}>{initialLevel ?? 0}</Text> / {hallMax} for{' '}
              {context.hallLabel}
            </Text>
            <View style={s.bar}>
              <View
                style={[
                  s.barFill,
                  { width: `${Math.min(100, ((initialLevel ?? 0) / hallMax) * 100)}%` },
                ]}
              />
            </View>
            {gameMax ? <Text style={s.hallGameMax}>Game max: {gameMax}</Text> : null}
          </View>
        ) : initialLevel !== undefined && !item.modules?.length ? (
          <Text style={s.playerLevel}>Your player level: {initialLevel}</Text>
        ) : null}
        {!row && initialLevel !== undefined && !item.modules?.length ? (
          <Text style={s.missingLevel}>
            Level {initialLevel} is not included in this community reference. No estimated stats are
            shown.
          </Text>
        ) : null}

        {row ? (
          <View style={s.levelControl} accessibilityLabel="Item level">
            <View style={s.levelRow}>
              <Button
                variant="outline"
                size="icon"
                accessibilityLabel="Previous level"
                disabled={index === 0}
                textStyle={s.stepper}
                onPress={() => setIndex((i) => i - 1)}
              >
                −
              </Button>
              <View style={s.levelText}>
                <Text style={s.levelHeading}>Level {String(row['level'])}</Text>
                <Text style={s.levelCaption}>
                  {index === levels.length - 1 ? 'Max level' : `${levels.length} levels`}
                </Text>
              </View>
              <Button
                variant="outline"
                size="icon"
                accessibilityLabel="Next level"
                disabled={index === levels.length - 1}
                textStyle={s.stepper}
                onPress={() => setIndex((i) => i + 1)}
              >
                +
              </Button>
            </View>
            <Slider
              accessibilityLabel="Select item level"
              value={index}
              max={Math.max(0, levels.length - 1)}
              onChange={setIndex}
            />
          </View>
        ) : null}

        {item.modules?.length ? <ModuleTracks modules={item.modules} /> : null}

        {nextSections ? (
          <Section title={`Next upgrade · Level ${String(nextRow?.['level'])}`}>
            <Fields values={mergeCostRows(nextSections.costs)} />
          </Section>
        ) : null}

        {/*
          The whole rest of the way, in one figure.

          Run through the same flatten -> merge -> Fields pipeline as every
          other cost block, which is what gets it the ore, resource and clock
          artwork without a second copy of that mapping. Time is appended
          rather than summed in: it is an object in the data, so adding numeric
          fields would never have found it -- and for hero equipment, which
          costs ore and no time at all, it correctly does not appear.
        */}
        {rollUp && context ? (
          <Section
            title={`To reach the ${context.hallLabel} max · ${rollUp.levels} ${
              rollUp.levels === 1 ? 'level' : 'levels'
            } to go`}
          >
            <Fields
              values={[
                ...mergeCostRows(flattenBook(rollUp.costs)),
                ...(rollUp.seconds > 0
                  ? [{ label: 'Total time', value: formatDuration(rollUp.seconds * 1000) }]
                  : []),
              ]}
            />
          </Section>
        ) : null}

        {wornBy ? (
          <Section title="Worn by">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${wornBy.name}`}
              style={s.relatedTile}
              onPress={() => onOpen(wornBy)}
            >
              {itemArt(wornBy, context?.levelOf(wornBy.id)) ? (
                <Image
                  source={itemArt(wornBy, context?.levelOf(wornBy.id))!.source}
                  resizeMode="contain"
                  style={s.relatedArt}
                />
              ) : null}
              <Text style={s.relatedName} numberOfLines={2}>
                {wornBy.name}
              </Text>
              {context?.levelOf(wornBy.id) !== undefined ? (
                <Text style={s.wornLevel}>{context.levelOf(wornBy.id)}</Text>
              ) : null}
            </Pressable>
          </Section>
        ) : null}
        {stats.length > 0 ? (
          <Section title={`At level ${String(row?.['level'])}`}>
            <Fields values={stats} />
          </Section>
        ) : null}
        {sections && sections.costs.length > 0 ? (
          <Section title={`To reach level ${String(row?.['level'])}`}>
            <Fields values={mergeCostRows(sections.costs)} />
          </Section>
        ) : null}
        {needs.length > 0 ? (
          <Section title="Needs">
            <FieldGrid cells={needs} />
          </Section>
        ) : null}

        {/*
          Supercharge is a second upgrade track on top of a maxed building,
          numbered from 1 again. It is kept out of the level slider above --
          mixing the two made the card read "14 levels" under "Game max 12" --
          but it is real data, so it gets its own section rather than being
          dropped on the floor.
        */}
        {supercharge.length > 0 ? (
          <Section title={`Supercharge · ${supercharge.length} levels`}>
            {supercharge.map((row, i) => (
              <View key={i} style={s.supercharge}>
                <Text style={s.superchargeLevel}>Supercharge {String(row['level'])}</Text>
                <Fields values={mergeCostRows(levelSections(row).costs)} />
              </View>
            ))}
          </Section>
        ) : null}
        {details.length > 0 ? (
          <Section title="Details">
            <FieldGrid cells={details} />
          </Section>
        ) : null}

        {Object.keys(general).length > 0 ? (
          <View style={s.section}>
            <Collapsible summary={() => <Text style={s.sectionTitle}>More information</Text>}>
              <Fields values={flattenBook(general)} />
            </Collapsible>
          </View>
        ) : null}

        <Text style={s.sourceNote}>
          Community reference · clash-of-clans-data 0.19.1 · Clash of Clans Wiki (CC BY-SA).
          Snapshot November 2, 2026; balance changes may differ. Artwork is official Supercell
          fan-kit where available, otherwise from the community dataset.
          {hasLevelArt(item.id)
            ? ' The picture changes with the level above.'
            : ' This item is rendered once rather than per level, so the picture stays the same as the level changes.'}
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * Crafted defenses have no single level: each upgrades three modules
 * independently, so a Bomb Hive is "HP 4 · Damage 2 · Range 1" rather than
 * "level 4". The catalog carries them as `modules` with no `levels` at all,
 * which is why these twelve items showed a description and nothing else.
 *
 * One track per module, each with its own slider over its ten upgrades.
 */
function ModuleTracks({ modules }: { modules: NonNullable<BookItem['modules']> }) {
  return (
    <>
      {modules.map((module) => (
        <ModuleTrack key={module.name} module={module} />
      ))}
    </>
  );
}

function ModuleTrack({ module }: { module: NonNullable<BookItem['modules']>[number] }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const upgrades = module.upgrades ?? [];
  const [index, setIndex] = useState(0);
  const row = upgrades[index];
  if (!row) return null;

  // The module's own name is a better label for its stat than the raw key,
  // which is just "stat" for every track.
  const sections = levelSections(row);
  const stats = sections.stats.map((f) =>
    f.label === 'Stat' ? { ...f, label: module.controls || module.name } : f,
  );

  return (
    <View style={s.section}>
      <View style={s.moduleHeading}>
        <Text style={s.sectionTitle}>{module.name}</Text>
        <Text style={s.moduleLevel}>
          Level {String(row['level'])} / {upgrades.length}
        </Text>
      </View>
      <Slider
        accessibilityLabel={`Select ${module.name} level`}
        value={index}
        max={Math.max(0, upgrades.length - 1)}
        onChange={setIndex}
      />
      {stats.length > 0 ? <Fields values={stats} /> : null}
      {sections.costs.length > 0 ? <Fields values={mergeCostRows(sections.costs)} /> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    // A definite height, not flex:1 -- Yoga reads flexBasis:0 as a literal
    // 0px against the sheet body, which collapses the card to nothing on
    // Android while the browser renders it correctly.
    layer: { width: '100%', height: '100%' },
    hiddenLayer: { display: 'none' },

    scroll: { padding: 14 },
    title: { color: t.bookFrameText, fontFamily: t.fonts.display, fontSize: 16 },
    titleLevel: { color: t.cocHighlight },

    related: { marginTop: 14 },
    relatedLabel: {
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: t.mutedForeground,
      marginBottom: 8,
    },
    relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    relatedTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
    },
    relatedArt: { width: 28, height: 28 },
    relatedName: {
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: t.foreground,
      maxWidth: 140,
    },

    supercharge: { marginBottom: 10 },
    superchargeLevel: {
      marginBottom: 6,
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: t.cocHighlight,
    },

    moduleHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    moduleLevel: { fontFamily: t.fonts.sans, fontSize: 12, color: t.mutedForeground },

    intro: { gap: 16 },
    stage: {
      height: 155,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      overflow: 'hidden',
    },
    stageImage: { width: '100%', height: '100%' },
    stageFallback: { fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    introText: { flexShrink: 1, minWidth: 0 },
    meta: { fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    description: { marginTop: 10, fontSize: 12, lineHeight: 19, color: t.foreground, fontFamily: t.fonts.sans },

    playerLevel: { marginTop: 16, fontSize: 12, color: t.primary, fontFamily: t.fonts.sans },
    hallProgress: { marginTop: 16 },
    hallLine: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground, marginBottom: 7 },
    hallLevel: { color: t.primary },
    hallGameMax: { marginTop: 6, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    wornLevel: {
      marginLeft: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: t.card,
      color: t.cocHighlight,
      fontFamily: t.fonts.display,
      fontSize: 12,
    },
    missingLevel: { marginTop: 16, fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },

    levelControl: {
      marginTop: 18,
      marginBottom: 4,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: t.border,
    },
    levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    levelText: { alignItems: 'center' },
    levelHeading: { fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    levelCaption: { marginTop: 2, fontSize: 11, color: t.primary, fontFamily: t.fonts.sans },
    stepper: { fontFamily: t.fonts.symbol, fontSize: 22, lineHeight: 24 },

    section: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.border },
    sectionTitle: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground, marginBottom: 8 },

    // Two columns, so short rows stop stretching across the whole sheet.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    cell: {
      flexBasis: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      minWidth: 0,
      backgroundColor: t.muted,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 4,
    },
    cellIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cellArt: { width: 26, height: 26 },
    cellText: { flexShrink: 1, minWidth: 0 },
    cellLabel: { fontSize: 10, lineHeight: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },
    cellValue: { marginTop: 2, fontSize: 13, color: t.foreground, fontFamily: t.fonts.display },

    fields: { gap: 6 },
    field: { backgroundColor: t.muted, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 4 },
    fieldTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    fieldLabelRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
    fieldIcon: { width: 24, height: 24, flexShrink: 0 },
    fieldLabel: { flexShrink: 1, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    fieldValue: { textAlign: 'right', fontSize: 12, color: t.foreground, fontFamily: t.fonts.display },
    fieldMax: { color: t.mutedForeground, fontSize: 11 },
    bar: { marginTop: 7, height: 4, borderRadius: 999, backgroundColor: t.border, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: t.primary },

    sourceNote: { marginTop: 18, fontSize: 10, lineHeight: 16, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
