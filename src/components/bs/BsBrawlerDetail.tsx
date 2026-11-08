import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { Spinner } from '@/components/ui/Shimmer';
import { BS_STAT, kitArt, portraitArt } from '@/assets/brawl';
import { classLabel, rarityLabel, RARITY_COLOR, type CollectionEntry } from '@/lib/bs-brawlers';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BsEmpty, Chip, Metric, MetricGrid, Section, nameTint, num } from './BsBits';

/**
 * One brawler, in full.
 *
 * Shows **everything that exists** for the brawler with yours highlighted and
 * the rest greyed -- the same owned/locked treatment the collection grid uses
 * for brawlers themselves. The catalog is already loaded for the grid, so the
 * locked half costs nothing extra.
 *
 * A **body**, not a sheet. It used to own a `Sheet` of its own, which made it
 * unreachable from anyone else's profile: React Native will not stack a second
 * Modal over the detail sheet, so the grid there had to render its tiles as
 * inert views. It is now a `brawler` layer in the shared back-stack
 * (`DetailSheetProvider`), which gives it the back arrow, the scrolling and the
 * padding for free and makes one code path serve both entry points.
 */
export function BsBrawlerBody({
  entry,
  playerTag,
}: {
  entry: CollectionEntry;
  playerTag: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  /*
   * The per-brawler global ladder: "the best Shelly in the world".
   *
   * Fetched only while the sheet is open. Finding *your own* position is not
   * possible in general -- the ladder pages from the top and you may be
   * thousands of rows down or absent entirely -- so this reports whether you
   * appear in the first page rather than pretending to a precise rank.
   */
  const ladder = useQuery({
    ...gameQuery({ game: 'bs', resource: 'brawlerRankings', brawlerId: entry.id, limit: 25 }),
    staleTime: 300000,
  });
  const ladderRows = ladder.data?.ok ? rows(record(JSON.parse(ladder.data.data))['items']) : [];
  const mine = ladderRows.find((r) => text(r['tag']) === playerTag);

  const owned = entry.owned;
  const art = portraitArt(entry.id);
  const rarityColor = RARITY_COLOR[entry.rarity] ?? theme.border;

  /** Owned ids for one kit slot, for the highlight test. */
  const ownedIds = (items: ApiRecord[]) =>
    new Set(items.map((i) => (typeof i.id === 'number' ? i.id : -1)));

  return (
    <View style={s.stack}>
      <View style={s.header}>
        {art ? (
          <View style={s.portraitFrame}>
            <Image source={art} style={s.portrait} resizeMode="cover" />
          </View>
        ) : null}
        <View style={s.headerChips}>
          <Chip label={rarityLabel(entry.rarity)} color={rarityColor} />
          <Chip label={classLabel(entry.className)} tone="muted" />
        </View>
      </View>

      {owned ? (
        <Section title="Your stats">
          <MetricGrid>
            <Metric label="Trophies" value={num(owned.trophies)} icon={BS_STAT.trophy} />
            <Metric
              label="Personal best"
              value={num(owned.highestTrophies)}
              icon={BS_STAT.trophy}
            />
            <Metric label="Power" value={num(owned.power)} icon={BS_STAT.power} />
            <Metric label="Rank" value={num(owned.rank)} icon={BS_STAT.brawler} />
            <Metric
              label="Win streak"
              value={num(owned.currentWinStreak)}
              hint={`best ${owned.maxWinStreak}`}
              icon={BS_STAT.champion}
            />
            <Metric label="Prestige" value={num(owned.prestigeLevel)} icon={BS_STAT.prestige} />
          </MetricGrid>
          {owned.skinName ? <Text style={s.skin}>Skin · {owned.skinName}</Text> : null}
        </Section>
      ) : (
        <BsEmpty title="Not unlocked" body="Below is what this brawler comes with." />
      )}

      <Section title="Gadgets">
        <KitGrid
          catalog={entry.catalog.gadgets}
          owned={ownedIds(owned?.gadgets ?? [])}
          unlocked={Boolean(owned)}
        />
      </Section>

      <Section title="Star Powers">
        <KitGrid
          catalog={entry.catalog.starPowers}
          owned={ownedIds(owned?.starPowers ?? [])}
          unlocked={Boolean(owned)}
        />
      </Section>

      <Section title="Hypercharge">
        <KitGrid
          catalog={entry.catalog.hyperCharges}
          owned={ownedIds(owned?.hyperCharges ?? [])}
          unlocked={Boolean(owned)}
          /*
           * No artwork, by necessity. Brawlify has no hypercharge directory
           * at all and the official fan kit carries art for eight of the 106
           * that exist, so a per-item icon here would be blank for 92% of
           * brawlers. The name is the information; see src/assets/brawl.ts.
           */
          noArt
        />
      </Section>

      <Section
        title="Gears"
        right={
          owned ? (
            <Chip label={`${owned.gears.length}/${entry.catalog.gears.length}`} tone="muted" />
          ) : undefined
        }
      >
        <KitGrid
          catalog={entry.catalog.gears}
          owned={ownedIds(owned?.gears ?? [])}
          unlocked={Boolean(owned)}
          levels={new Map(
            (owned?.gears ?? []).map((g) => [
              typeof g.id === 'number' ? g.id : -1,
              typeof g.level === 'number' ? g.level : 0,
            ]),
          )}
        />
      </Section>

      {/*
        Your own place on the ladder is a chip rather than the sentence it used
        to be. It is only ever present when your tag happens to fall inside the
        first page -- the ladder pages from the top and there is no "find me"
        -- so the absent case needs no explaining, it just has no chip.
      */}
      <Section
        title="Global ladder"
        right={mine ? <Chip label={`You · ${num(mine['rank'])}`} /> : undefined}
      >
        {ladder.isFetching && !ladderRows.length ? (
          <Spinner />
        ) : ladderRows.length ? (
          <View style={s.ladder}>
            {ladderRows.slice(0, 5).map((row) => {
              const tint = nameTint(row['nameColor']);
              const isMine = text(row['tag']) === playerTag;
              return (
                <View key={text(row['tag'])} style={[s.ladderRow, isMine && s.ladderMine]}>
                  <Text style={s.ladderRank}>{num(row['rank'])}</Text>
                  <Text style={[s.ladderName, tint ? { color: tint } : null]} numberOfLines={1}>
                    {text(row['name'])}
                  </Text>
                  <Text style={s.ladderScore}>{num(row['trophies'])}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <BsEmpty body="No ladder for this brawler." />
        )}
      </Section>
    </View>
  );
}

/**
 * One kit slot: everything that exists, yours lit and the rest greyed.
 *
 * A grid rather than the list this used to be, and the same grid "Your stats"
 * uses -- three to a row, art over name. The sheet previously ran four stacked
 * single-file lists below one grid, so the page changed shape halfway down for
 * no reason the reader could see.
 *
 * Deliberately built on the `metric` geometry from BsBits rather than a second
 * grid of its own, so the two halves of the sheet stay the same size and the
 * same rhythm if either is ever retuned.
 */
function KitGrid({
  catalog,
  owned,
  unlocked,
  noArt,
  levels,
}: {
  catalog: ApiRecord[];
  owned: Set<number>;
  unlocked: boolean;
  noArt?: boolean;
  levels?: Map<number, number>;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  if (!catalog.length) {
    return <Text style={s.kitNone}>This brawler has none.</Text>;
  }

  return (
    <View style={s.kitGrid}>
      {catalog.map((item) => {
        const id = typeof item.id === 'number' ? item.id : -1;
        const has = owned.has(id);
        const art = noArt ? undefined : kitArt(id);
        const level = levels?.get(id);
        return (
          <View key={id} style={[s.kitTile, !has && s.kitTileOff]}>
            {art ? (
              <Image source={art} style={[s.kitArt, !has && s.kitArtOff]} resizeMode="contain" />
            ) : (
              // Hypercharge only. Brawlify has no hypercharge art at all and
              // the fan kit has eight of 106, so this is the common case
              // there rather than a fallback -- it stands in for the art and
              // takes its footprint so the tiles in a row stay level.
              <View style={s.kitDotSlot}>
                <View style={[s.kitDot, has && { backgroundColor: theme.brawl.highlight }]} />
              </View>
            )}
            <Text style={[s.kitName, !has && s.kitNameOff]} numberOfLines={2}>
              {text(item.name)}
            </Text>
            {/*
              A gear's level replaces the state word rather than joining it:
              "Lv 2" already says you own it, and two lines of metadata under a
              92px tile is more than the tile can hold.
            */}
            {level ? (
              <Text style={s.kitLevel}>Lv {level}</Text>
            ) : (
              <Text style={[s.kitMark, has && s.kitMarkOn]}>
                {has ? 'Owned' : unlocked ? 'Locked' : '—'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 12 },
    header: { alignItems: 'center', gap: 8 },
    /*
      A frame the artwork fills, rather than a frame the artwork sits inside.

      Portrait renders are opaque rectangles, so the one square-cornered
      element on the page sat under a sheet whose every other surface is
      rounded. Rounding alone was not enough: at `contain` across the full
      width the art letterboxed to about 175pt and kept its own hard corners
      *inside* a rounded frame, which looked like a bug rather than a fix. It
      is sized to the art and cropped to fit instead, so the radius clips real
      pixels.

      212x170 is roughly 1.25:1, near the middle of the range the portraits
      actually use -- they are a uniform 384 wide but 220 to 345 tall, so no
      single ratio fits them all. `cover` therefore trims a little from every
      brawler; a few pt off a head-and-shoulders render that is already
      centred, which is why it is preferred to the letterbox.

      `overflow: hidden` on the parent is what does the clipping: a
      borderRadius set on an Image is honoured by the web but not reliably by
      Android's own image view.
    */
    portraitFrame: {
      width: 212,
      height: 170,
      alignSelf: 'center',
      borderRadius: t.radius.xl,
      overflow: 'hidden',
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    portrait: { width: '100%', height: '100%' },
    headerChips: { flexDirection: 'row', gap: 6 },
    skin: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    // Mirrors `metricGrid`/`metric` in BsBits, so a kit tile and a stat tile
    // are the same object at the same size.
    kitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kitTile: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 92,
      alignItems: 'center',
      gap: 3,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: t.radius.lg,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    /*
      0.72, not 0.5.

      A locked tile still has to be readable -- it names a gadget you can go and
      unlock. At half opacity on this background the icon and the name both
      dropped close to the fill, which is what made the sheet look like it was
      missing art rather than showing it greyed.
    */
    kitTileOff: { opacity: 0.72 },
    kitArt: { width: 36, height: 36, borderRadius: t.radius.sm },
    kitArtOff: { opacity: 0.65 },
    // Keeps the art's footprint so a dotted tile lines up with a drawn one.
    kitDotSlot: { height: 36, justifyContent: 'center' },
    kitDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.border },
    kitName: {
      fontFamily: t.fonts.display,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: t.foreground,
    },
    kitNameOff: { color: t.mutedForeground },
    kitLevel: { fontFamily: t.fonts.sans, fontSize: 10, color: t.brawl.heading },
    kitMark: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    kitMarkOn: { color: t.brawl.heading },
    kitNone: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    ladder: { gap: 4 },
    ladderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
      paddingHorizontal: 9,
      borderRadius: t.radius.md,
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
    },
    ladderMine: { backgroundColor: t.brawl.chip },
    ladderRank: { width: 24, fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    ladderName: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    ladderScore: { fontFamily: t.fonts.display, fontSize: 12, color: t.brawl.highlight },
  });
