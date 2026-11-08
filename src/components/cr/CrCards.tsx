import { useMemo, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { record, text, type ApiRecord } from '@/api/game-api';
import { cardLevel, canEvolve, isEvolved, rarityOf, starLevel } from '@/lib/royale-cards';
import { COPY_TABLE, copyProgress } from '@/lib/royale-upgrades';
import { CR_ICONS, rarityTokenArt } from '@/assets/royale';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Meter } from '@/components/ui/Meter';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { Sheet } from '@/components/ui/Sheet';
import { CrArt, CrIcon, num, url } from './CrBits';

/**
 * The card grid and tile, ported from `.arena-grid` / `.arena-item`.
 *
 * Levels always go through `cardLevel()`, never `card.level` -- the API
 * reports levels relative to the rarity, so a Legendary's raw "3" is game
 * level 11.
 */

/** The rarity ring around a tile. */
function rarityColour(card: ApiRecord, t: Theme): string {
  return t.rarity[rarityOf(card)];
}

/**
 * `.royale-copy-bar` -- copies held against copies needed for the next level.
 *
 * The reference fills this with a repeating-linear-gradient hatch, which has
 * no React Native equivalent; a flat muted track reads the same at this size.
 */
export function CopyBar({ card }: { card: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const progress = copyProgress(card['level'], card['maxLevel'], card['count']);

  if (progress.kind === 'max') {
    return (
      <View style={[s.copyBar, s.copyBarMax]}>
        <Text style={[s.copyBarText, s.copyBarMaxText]}>Max</Text>
      </View>
    );
  }
  if (progress.kind === 'unknown') {
    return (
      <View style={s.copyBar}>
        <Text style={s.copyBarText}>{num(progress.owned)}</Text>
      </View>
    );
  }
  const pct = Math.min(100, (progress.owned / progress.needed) * 100);
  return (
    <View style={s.copyBar}>
      <View
        style={[s.copyFill, { width: `${pct}%` }, progress.ready ? s.copyFillReady : null]}
      />
      <Text style={s.copyBarText}>
        {num(progress.owned)}/{num(progress.needed)}
      </Text>
    </View>
  );
}

/** `.arena-item` -- one card. */
export function CardTile({
  card,
  width,
  locked = false,
  showCopies = true,
  showName = false,
  showLevel = true,
  onPress,
}: {
  card: ApiRecord;
  width: number;
  locked?: boolean;
  showCopies?: boolean;
  showName?: boolean;
  /**
   * The "Level N" badge. Off for grids narrow enough to truncate it to "Le…",
   * and for any grid where the level is not the reader's -- a sampled
   * opponent's card level says nothing about the card.
   */
  showLevel?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const level = cardLevel(card);
  const evolved = isEvolved(card);
  const name = text(card['name']);
  const icons = record(card['iconUrls']);

  const body = (
    <>
      <View
        style={[
          s.tileImage,
          { borderColor: rarityColour(card, theme), height: (width * 4) / 3 },
        ]}
      >
        <CrArt
          name={name}
          evolved={evolved}
          iconUrl={url(evolved ? icons['evolutionMedium'] ?? icons['medium'] : icons['medium'])}
          style={locked ? s.lockedArt : undefined}
        />
        {card['elixirCost'] != null && (
          <View style={s.elixir}>
            <Text style={s.elixirText}>{text(card['elixirCost'])}</Text>
          </View>
        )}
        {/* The Wild Shard rather than the word "EVO": it is the mark the game
            itself puts on an evolved card, and it survives being 18px wide,
            which three letters of a display face do not. */}
        {evolved && <CrIcon name="evolution" size={20} style={s.evolved} />}
        {showLevel && level !== null && (
          <View style={s.levelBadge}>
            <Text style={s.levelText} numberOfLines={1}>
              Level {level}
            </Text>
          </View>
        )}
        {locked && (
          <View style={s.lock}>
            {/*
              A word, not a picture. The fan kit has no padlock -- searching
              both indexes for /lock/i turns up a banner and an emote -- and the
              key that used to sit here reads as "unlock with a key", which is
              not how a card is found. Text has no platform-font lottery and
              says exactly one thing. See assets-req.md.
            */}
            <Text style={s.lockText}>LOCKED</Text>
          </View>
        )}
      </View>
      {showName && (
        <Text style={[s.tileName, locked && s.tileNameLocked]} numberOfLines={2}>
          {name}
        </Text>
      )}
      {showCopies && card['count'] != null && <CopyBar card={card} />}
    </>
  );

  if (!onPress) return <View style={[s.tile, { width }]}>{body}</View>;
  return (
    <Pressable
      style={({ pressed }) => [s.tile, { width }, pressed && s.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${name}${locked ? ' (locked)' : ''}`}
    >
      {body}
    </Pressable>
  );
}

/**
 * `.arena-grid` -- a wrapping grid of fixed columns.
 *
 * The width is measured rather than set as a percentage. Four tiles at `23%`
 * plus three 9px gaps overflows a narrow phone and silently reflows to three
 * per row, so the column width is computed from the container instead.
 */
export function CardGrid({
  cards,
  columns = 4,
  gap = 9,
  locked = false,
  showCopies = true,
  showName = false,
  showLevel = true,
  onPressCard,
  emptyLabel = 'No cards.',
  pageSize,
  pageKey = '',
}: {
  cards: ApiRecord[];
  columns?: number;
  gap?: number;
  locked?: boolean;
  showCopies?: boolean;
  showName?: boolean;
  /** Passed through to every tile. See CardTile. */
  showLevel?: boolean;
  onPressCard?: (card: ApiRecord) => void;
  emptyLabel?: string;
  /**
   * Page the grid rather than rendering every tile.
   *
   * Off by default: most grids are a deck of eight or a roster the caller has
   * already capped. The collection is the one that needs it -- 123 cards split
   * into two sections.
   */
  pageSize?: number;
  /** What collapses the grid back to one page: the search, sort and filter. */
  pageKey?: unknown;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const tileWidth = width ? Math.floor((width - gap * (columns - 1)) / columns) : 0;
  // Always called: hooks cannot be conditional. With no `pageSize` the whole
  // list is one page and `remaining` is zero, so LoadMore renders nothing.
  const paged = usePaged(cards, pageKey, pageSize ?? (cards.length || 1));

  if (!cards.length) return <Text style={s.empty}>{emptyLabel}</Text>;

  return (
    <>
      <View style={[s.grid, { columnGap: gap, rowGap: gap + 7 }]} onLayout={onLayout}>
        {tileWidth > 0 &&
          paged.shown.map((card, i) => (
            <CardTile
              key={`${text(card['id'])}-${i}`}
              card={card}
              width={tileWidth}
              locked={locked}
              showCopies={showCopies}
              showName={showName}
              showLevel={showLevel}
              onPress={onPressCard ? () => onPressCard(card) : undefined}
            />
          ))}
      </View>
      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        size={pageSize}
        noun="cards"
        style={s.more}
      />
    </>
  );
}

/**
 * The card detail body: a level walk-through built on `COPY_TABLE`.
 *
 * `/v1/cards` carries no hitpoints, damage, range or hit speed -- by decision,
 * there is no third-party fill -- so the one real progression dataset is the
 * copy requirement per level. That is what this shows, rather than a short
 * list of fields that would make the card page feel empty.
 */
export function CardDetail({ card }: { card: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const rarity = rarityOf(card);
  const apiLevel = typeof card['level'] === 'number' ? card['level'] : null;
  const maxLevel = typeof card['maxLevel'] === 'number' ? card['maxLevel'] : COPY_TABLE.length + 1;
  const owned = typeof card['count'] === 'number' ? card['count'] : 0;
  const icons = record(card['iconUrls']);
  const evolved = isEvolved(card);

  // One row per upgrade step. Index i is the API level, so COPY_TABLE[i - 1]
  // is what that level costs to leave -- the table is indexed by API level
  // precisely because levels are rarity-relative.
  const steps = Array.from({ length: Math.max(0, maxLevel - 1) }, (_, i) => {
    const from = i + 1;
    return { from, needed: COPY_TABLE[from - 1] ?? null };
  }).filter((step) => step.needed !== null);

  return (
    <View>
      <View style={s.detailArt}>
        <CrArt
          name={card['name']}
          evolved={evolved}
          iconUrl={url(icons['medium'])}
          style={s.detailArtImage}
        />
      </View>

      <View style={s.detailFields}>
        {/*
          Every field carries art. The rarity token is the real one for that
          rarity -- champion included, which only arrived with the fan kit --
          and the rest come from the shared icon table so a card's "Copies"
          reads as the same thing as a profile's "Cards found".
        */}
        <Field label="Rarity" value={rarity} art={rarityTokenArt(rarity)} s={s} />
        {card['elixirCost'] != null && (
          <Field label="Elixir" value={card['elixirCost']} art={CR_ICONS.elixir} s={s} />
        )}
        {/*
          The experience icon, not the king tower. Level here is the card's
          upgrade level, which is what XP buys -- the king tower is the
          account's own level and already has its own row on the profile, so
          sharing the art made two different things look like one.
          A locked card has no level, and so takes no icon.
        */}
        <Field
          label="Level"
          value={apiLevel === null ? 'Locked' : `${cardLevel(card)} of ${maxLevel + startOf(rarity) - 1}`}
          art={apiLevel === null ? undefined : CR_ICONS.experience}
          s={s}
        />
        <Field
          label="Copies"
          value={apiLevel === null ? '—' : num(owned)}
          art={CR_ICONS.cards}
          s={s}
        />
        {canEvolve(card) && (
          <Field
            label="Evolution"
            value={`${text(card['evolutionLevel'] ?? 0)} of ${text(card['maxEvolutionLevel'])}`}
            art={CR_ICONS.evolution}
            s={s}
          />
        )}
        {starLevel(card) > 0 && (
          <Field label="Star level" value={starLevel(card)} art={CR_ICONS.star} s={s} />
        )}
      </View>

      {apiLevel === null ? (
        <Text style={s.note}>
          You have not found this card yet, so there is no upgrade progress to show.
        </Text>
      ) : (
        <View style={s.ladder}>
          <View style={s.ladderHeadRow}>
            <CrIcon name="cards" size={20} />
            <Text style={s.ladderHead}>Copies per upgrade</Text>
          </View>
          {/*
            Every row carries a bar, so the ladder reads as one column you can
            scan rather than a list of numbers. Colour is the whole message:
            green is behind you, gold is ahead. The row that used to be a
            level label and a bare "✓" squeezed into 40px now gives the meter
            its own line, which is the only width at which it is readable.
          */}
          {steps.map((step) => {
            const here = step.from === apiLevel;
            const done = step.from < apiLevel;
            // Only the current step has real progress to show. A future step
            // is an empty gold track -- deliberately not a partial one, since
            // copies do not carry over past the upgrade you are saving for.
            const have = here ? Math.min(owned, step.needed ?? 0) : done ? (step.needed ?? 0) : 0;
            return (
              <View key={step.from} style={[s.step, here && s.stepHere]}>
                <View style={s.stepTop}>
                  <Text style={[s.stepLevel, here && s.stepLevelHere]}>
                    {gameLevelLabel(step.from, rarity)} → {gameLevelLabel(step.from + 1, rarity)}
                  </Text>
                  <Text style={[s.stepCost, done && s.stepDone, here && s.stepCostHere]}>
                    {done
                      ? '✓'
                      : here
                        ? `${num(owned)} / ${num(step.needed)}`
                        : num(step.needed)}
                  </Text>
                </View>
                {/*
                  The rim carries the colour as well as the fill. A step you
                  have not reached has nothing to fill, so with the default
                  grey track an empty bar would read as "disabled" rather than
                  as "ahead of you" -- the gold rim is what makes the whole
                  column below your level one colour.
                */}
                <Meter
                  value={have}
                  max={step.needed ?? 1}
                  fill={done ? theme.success : theme.gold}
                  style={[s.stepMeter, done ? s.stepMeterDone : s.stepMeterPending]}
                />
              </View>
            );
          })}
        </View>
      )}

    </View>
  );
}

/** Game level of a rarity-relative API level, as a label. */
function gameLevelLabel(apiLevel: number, rarity: string): string {
  return String(apiLevel + startOf(rarity) - 1);
}

function startOf(rarity: string): number {
  return { common: 1, rare: 3, epic: 6, legendary: 9, champion: 11 }[rarity] ?? 1;
}

function Field({
  label,
  value,
  art,
  s,
}: {
  label: string;
  value: unknown;
  /** Undefined only when the lookup misses; the row then falls back to text. */
  art?: ImageSourcePropType;
  s: ReturnType<typeof build>;
}) {
  return (
    <View style={s.field}>
      {art ? (
        <Image
          source={art}
          style={s.fieldIcon}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={s.fieldText}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Text style={s.fieldValue} numberOfLines={2}>
          {num(value)}
        </Text>
      </View>
    </View>
  );
}

/**
 * The card detail sheet, plus the state that opens it.
 *
 * A hook rather than a component so the three places that show cards -- the
 * collection, a mined deck, the current deck on Home -- all get the same sheet
 * without each re-declaring the state. Follows the rule the rest of the app
 * keeps: everything nested is tappable.
 */
export function useCardSheet() {
  const [card, setCard] = useState<ApiRecord | null>(null);
  const cardSheet = (
    <Sheet
      open={card !== null}
      variant="plain"
      onClose={() => setCard(null)}
      title={<CardSheetTitle card={card} />}
    >
      {card ? <CardSheetBody card={card} /> : null}
    </Sheet>
  );
  return { openCard: (next: ApiRecord) => setCard(next), cardSheet };
}

function CardSheetTitle({ card }: { card: ApiRecord | null }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <Text style={s.sheetTitle} numberOfLines={2}>
      {card ? text(card['name']) : ''}
    </Text>
  );
}

function CardSheetBody({ card }: { card: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <ScrollView
      style={s.sheetScroll}
      contentContainerStyle={s.sheetBody}
      keyboardShouldPersistTaps="handled"
    >
      <CardDetail card={card} />
    </ScrollView>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    tile: { gap: 7 },
    pressed: { opacity: 0.75 },
    tileImage: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      // A Royale-blue ground behind every card, as the game itself has.
      backgroundColor: t.royale.chip,
      borderWidth: 2,
      borderRadius: t.radius.lg,
      overflow: 'visible',
    },
    // No grayscale filter in React Native; dimming reads as "not yours"
    // against both the panel and the muted backgrounds this sits on.
    lockedArt: { opacity: 0.4 },
    elixir: {
      position: 'absolute',
      top: -5,
      left: -5,
      minWidth: 24,
      height: 26,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.secondary,
      borderWidth: 2,
      borderColor: t.royale.edge,
      borderRadius: t.radius.lg,
    },
    elixirText: { fontFamily: t.fonts.display, fontSize: 13, color: t.secondaryForeground },
    evolved: { position: 'absolute', top: -7, right: -5 },
    levelBadge: {
      position: 'absolute',
      bottom: 3,
      left: 3,
      right: 3,
      paddingVertical: 5,
      paddingHorizontal: 2,
      alignItems: 'center',
      // `edge`, not `chip`: this badge sits on the tile art, whose ground is
      // already `chip`, so it needs the darker Royale blue to separate.
      backgroundColor: t.royale.edge,
      borderRadius: t.radius.sm,
    },
    levelText: { fontFamily: t.fonts.display, fontSize: 10, color: t.royale.onChip },
    lock: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    // A pill rather than bare text: the tile art behind it is only dimmed, not
    // removed, so the word needs its own ground to stay legible on every card.
    lockText: {
      fontFamily: t.fonts.display,
      fontSize: 9,
      letterSpacing: 1,
      color: t.royale.onChip,
      backgroundColor: t.royale.edge,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: t.radius.sm,
      paddingVertical: 4,
      paddingHorizontal: 7,
      overflow: 'hidden',
    },
    more: { marginTop: 14, alignSelf: 'flex-start' },
    tileName: { fontFamily: t.fonts.display, fontSize: 10, lineHeight: 14, color: t.foreground },
    tileNameLocked: { color: t.mutedForeground },

    copyBar: {
      width: '100%',
      minHeight: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.royale.edge,
      borderRadius: t.radius.sm,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    /*
     * Three states, three colours, in order of how much they matter: blue
     * while the copies are accumulating, green once there are enough to
     * upgrade, gold when the card is finished for good. Gold is reserved for
     * the last of those -- it is the mark that should pop, and spending it on
     * every partial bar would leave nothing to mark the maxed card with.
     */
    copyBarMax: { backgroundColor: t.royale.highlight },
    copyFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: t.royale.chip },
    copyFillReady: { backgroundColor: t.success },
    copyBarText: { fontFamily: t.fonts.display, fontSize: 9, color: t.foreground },
    // On dark, `foreground` is near-white and would sit at about 1.6:1 on
    // gold. The maxed bar brings its own ink.
    copyBarMaxText: { color: t.royale.onHighlight },

    empty: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      color: t.mutedForeground,
      paddingVertical: 18,
      textAlign: 'center',
    },

    detailArt: {
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
      marginBottom: 16,
    },
    detailArtImage: { width: '60%', height: '100%' },
    detailFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    field: {
      flexGrow: 1,
      flexBasis: '46%',
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 10,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: t.radius.sm,
    },
    fieldIcon: { width: 26, height: 30, flexShrink: 0 },
    fieldText: { flex: 1, minWidth: 0 },
    fieldLabel: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    fieldValue: {
      fontFamily: t.fonts.display,
      fontSize: 15,
      marginTop: 6,
      color: t.foreground,
      textTransform: 'capitalize',
    },

    ladder: { marginTop: 20 },
    ladderHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    ladderHead: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    step: {
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    stepHere: { backgroundColor: t.muted, borderRadius: t.radius.sm },
    stepTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    stepLevel: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    stepLevelHere: { color: t.accent },
    stepCost: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    stepCostHere: { color: t.gold },
    stepDone: { color: t.success },
    // Slimmer than the default 10px bar: there is one per upgrade step and a
    // level-14 card stacks thirteen of them.
    stepMeter: { height: 6 },
    stepMeterDone: { borderColor: t.success },
    stepMeterPending: { borderColor: t.gold },

    note: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 17,
      marginTop: 18,
      color: t.mutedForeground,
    },

    sheetTitle: { flex: 1, minWidth: 0, color: t.primary, fontFamily: t.fonts.display, fontSize: 18 },
    sheetScroll: { flex: 1 },
    sheetBody: { padding: 14, paddingBottom: 32 },
    cardSection: { marginTop: 16 },
    cardSectionTitle: {
      fontFamily: t.fonts.display,
      fontSize: 13,
      color: t.foreground,
      marginBottom: 10,
    },
  });
