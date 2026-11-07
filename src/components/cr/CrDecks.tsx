import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { rows, text, type ApiRecord } from '@/api/game-api';
import { splitCollection, sortCards, rarityCounts, type CardSort } from '@/lib/royale-cards';
import { deckLink, deckStats, generateDeck, myDecks } from '@/lib/royale-decks';
import { readJson, writeJson } from '@/state/storage';
import { Button } from '@/components/ui/Button';
import { ChipRow, type Chip } from '@/components/ui/ChipRow';
import { PAGE_SIZE } from '@/components/ui/Paged';
import { SearchField } from '@/components/ui/SearchField';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  CrEmpty,
  CrLoading,
  CrownRecord,
  Metric,
  MetricGrid,
  Section,
  Source,
} from './CrBits';
import { CardGrid, useCardSheet } from './CrCards';
import { CrMeta } from './CrMeta';

/**
 * The Decks tab: the decks you have played, your whole collection, and a
 * builder.
 *
 * The numbered deck tabs are mined from the battle log. `/v1/players/{tag}`
 * returns exactly one deck -- `currentDeck` -- and there is no deck-slot
 * endpoint, so the log is the only place more than one deck exists.
 */

type DeckTab = 'played' | 'cards' | 'builder';

const TABS: Tab<DeckTab>[] = [
  { id: 'played', label: 'My decks' },
  { id: 'cards', label: 'All cards' },
  { id: 'builder', label: 'Builder' },
];

export function CrDecks({ player, tag }: { player: ApiRecord; tag: string }) {
  const [tab, setTab] = useState<DeckTab>('played');
  const battles = useQuery({
    ...gameQuery({ game: 'cr', resource: 'battles', tag }),
    enabled: Boolean(tag),
  });
  const catalog = useQuery(gameQuery({ game: 'cr', resource: 'catalog' }));

  const log = battles.data?.ok ? rows(JSON.parse(battles.data.data)) : [];
  const catalogData = catalog.data?.ok ? JSON.parse(catalog.data.data) : null;

  return (
    <View>
      <Tabs tone="cr" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'played' && (
        <PlayedDecks player={player} tag={tag} battles={log} loading={battles.isFetching} />
      )}
      {tab === 'cards' && (
        <Collection
          player={player}
          catalog={catalogData}
          loading={catalog.isFetching}
          result={catalog.data}
        />
      )}
      {tab === 'builder' && <Builder player={player} tag={tag} battles={log} />}
      {battles.data && !battles.data.ok ? <Source result={battles.data} /> : null}
    </View>
  );
}

function PlayedDecks({
  player,
  tag,
  battles,
  loading,
}: {
  player: ApiRecord;
  tag: string;
  battles: ApiRecord[];
  loading: boolean;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const decks = useMemo(
    () =>
      myDecks(
        battles,
        tag,
        rows(player['currentDeck']),
        rows(player['currentDeckSupportCards']),
      ),
    [battles, tag, player],
  );
  const [index, setIndex] = useState(0);
  const { openCard, cardSheet } = useCardSheet();
  const deck = decks[Math.min(index, decks.length - 1)];

  if (loading && !decks.length) return <CrLoading label="Reading the battle log…" />;
  if (!deck) {
    return (
      <CrEmpty
        title="No decks yet"
        body="Nothing in the returned battle log, and no current deck on the account."
      />
    );
  }

  const numbered: Chip[] = decks.map((d, i) => ({
    id: String(i),
    label: `Deck ${i + 1}${d.isCurrent ? ' ★' : ''}`,
    count: d.plays || undefined,
  }));

  const link = deckLink(deck.cards);

  return (
    <View>
      <ChipRow
        chips={numbered}
        value={String(Math.min(index, decks.length - 1))}
        onChange={(id) => setIndex(Number(id))}
        accessibilityLabel="Choose a deck"
      />

      <Section title={deck.isCurrent ? 'Current deck' : `Deck ${index + 1}`} count={deck.cards.length}>
        <CardGrid cards={deck.cards} showCopies={false} onPressCard={openCard} />
        {deck.supportCards.length > 0 && (
          /* Same treatment as the Home tab: cards render as cards, not names. */
          <View style={s.towerBlock}>
            <Text style={s.tower}>Tower troop</Text>
            <CardGrid cards={deck.supportCards} showCopies={false} onPressCard={openCard} />
          </View>
        )}

        <MetricGrid>
          <Metric label="Times played" value={deck.plays} icon="battle" />
          <Metric label="Average elixir" value={deck.averageElixir?.toFixed(1) ?? '—'} icon="elixir" />
          <Metric label="Average level" value={deck.averageLevel?.toFixed(1) ?? '—'} icon="star" />
          <Metric
            label="Record"
            value={<CrownRecord wins={deck.wins} losses={deck.losses} draws={deck.draws} />}
          />
        </MetricGrid>

        {deck.winRate !== null && (
          <Text style={s.winRate}>{deck.winRate.toFixed(0)}% win rate over these battles</Text>
        )}
        {link && (
          <Button variant="outline" size="sm" style={s.copy} onPress={() => void Linking.openURL(link)}>
            Copy to game
          </Button>
        )}
        <Text style={s.copyNote}>
          The copy link carries the eight cards. Tower troops are not part of the link format, so
          the deck arrives with whichever you last used.
        </Text>
      </Section>
      {cardSheet}
    </View>
  );
}

const SORTS: Chip[] = [
  { id: 'name', label: 'A–Z' },
  { id: 'level', label: 'Level' },
  { id: 'elixir', label: 'Elixir' },
  { id: 'rarity', label: 'Rarity' },
];

function Collection({
  player,
  catalog,
  loading,
  result,
}: {
  player: ApiRecord;
  catalog: unknown;
  loading: boolean;
  result: Parameters<typeof Source>[0]['result'] | undefined;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CardSort>('name');
  const [rarity, setRarity] = useState('all');
  const { openCard, cardSheet } = useCardSheet();

  const split = useMemo(() => splitCollection(catalog, player), [catalog, player]);

  const filter = (list: ApiRecord[]) =>
    sortCards(
      list.filter(
        (c) =>
          text(c['name']).toLowerCase().includes(query.toLowerCase()) &&
          (rarity === 'all' || text(c['rarity']).toLowerCase() === rarity),
      ),
      sort,
    );

  if (loading && !split.cards.unlocked.length && !split.cards.locked.length) {
    return <CrLoading label="Loading the card list…" />;
  }

  const counts = rarityCounts([...split.cards.unlocked, ...split.cards.locked]);
  const rarityChips: Chip[] = [
    { id: 'all', label: 'All', count: split.cards.unlocked.length + split.cards.locked.length },
    ...(['common', 'rare', 'epic', 'legendary', 'champion'] as const)
      .filter((r) => counts[r] > 0)
      .map((r) => ({ id: r, label: r[0]!.toUpperCase() + r.slice(1), count: counts[r] })),
  ];

  const unlocked = filter(split.cards.unlocked);
  const locked = filter(split.cards.locked);
  const supportUnlocked = filter(split.support.unlocked);
  const supportLocked = filter(split.support.locked);

  return (
    <View>
      <View style={s.searchRow}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Find a card…"
          accessibilityLabel="Search cards"
        />
      </View>
      <ChipRow
        chips={rarityChips}
        value={rarity}
        onChange={setRarity}
        accessibilityLabel="Filter by rarity"
      />
      <ChipRow
        chips={SORTS}
        value={sort}
        onChange={(id) => setSort(id as CardSort)}
        accessibilityLabel="Sort cards"
      />

      {/*
        Paged: the collection is 123 cards and this tab used to render every
        one. The section counts still report the whole split, which is the
        headline figure -- it is the grid under them that grows a page at a
        time. `pageKey` collapses it when the search, rarity or sort changes.
      */}
      <Section title="Unlocked" count={unlocked.length}>
        <CardGrid
          cards={unlocked}
          onPressCard={openCard}
          emptyLabel="No unlocked cards match."
          pageSize={PAGE_SIZE}
          pageKey={`${query}:${rarity}:${sort}`}
        />
      </Section>

      <Section title="Locked" count={locked.length}>
        <CardGrid
          cards={locked}
          locked
          showCopies={false}
          onPressCard={openCard}
          emptyLabel={
            split.cards.locked.length
              ? 'No locked cards match.'
              : 'You have found every card.'
          }
          pageSize={PAGE_SIZE}
          pageKey={`${query}:${rarity}:${sort}`}
        />
      </Section>

      {(supportUnlocked.length > 0 || supportLocked.length > 0) && (
        <Section title="Tower troops" count={supportUnlocked.length + supportLocked.length}>
          <Text style={s.subLabel}>Unlocked · {supportUnlocked.length}</Text>
          <CardGrid cards={supportUnlocked} onPressCard={openCard} emptyLabel="None unlocked." />
          <Text style={s.subLabel}>Locked · {supportLocked.length}</Text>
          <CardGrid cards={supportLocked} locked showCopies={false} onPressCard={openCard} emptyLabel="None locked." />
        </Section>
      )}

      {result && !result.ok ? <Source result={result} /> : null}
      {cardSheet}
    </View>
  );
}

const STYLES: SelectOption[] = [
  { id: 'cycle', label: 'Cycle' },
  { id: 'bait', label: 'Bait' },
  { id: 'beatdown', label: 'Beatdown' },
  { id: 'bridge', label: 'Bridge spam' },
  { id: 'balanced', label: 'Balanced' },
];

type SavedDeck = { name: string; ids: string[] };

function Builder({
  player,
  tag,
  battles,
}: {
  player: ApiRecord;
  tag: string;
  battles: ApiRecord[];
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const owned = rows(player['cards']);
  const [style, setStyle] = useState('cycle');
  const [variation, setVariation] = useState(0);
  const [deck, setDeck] = useState<ApiRecord[]>(() => rows(player['currentDeck']));
  const [saved, setSaved] = useState<SavedDeck[]>([]);
  const [notice, setNotice] = useState('');
  const { openCard, cardSheet } = useCardSheet();

  const key = `royale-decks:${tag}`;

  useEffect(() => {
    setDeck(rows(player['currentDeck']));
    setNotice('');
    let live = true;
    void readJson<SavedDeck[]>(key).then((value) => {
      if (!live) return;
      setSaved(
        Array.isArray(value)
          ? value.filter(
              (d): d is SavedDeck =>
                typeof d?.name === 'string' &&
                Array.isArray(d?.ids) &&
                d.ids.every((id) => typeof id === 'string'),
            )
          : [],
      );
    });
    return () => {
      live = false;
    };
  }, [player, key]);

  const stats = deckStats(deck, battles);
  const link = deckLink(deck);

  const save = async () => {
    if (deck.length !== 8) return;
    const next = [...saved, { name: `Deck ${saved.length + 1}`, ids: deck.map((c) => text(c['id'])) }];
    setSaved(next);
    await writeJson(key, next);
    setNotice('Saved on this device.');
  };

  const remove = async (i: number) => {
    const next = saved.filter((_, n) => n !== i);
    setSaved(next);
    await writeJson(key, next);
  };

  if (!owned.length) {
    return <CrEmpty body="No cards on this account, so there is nothing to build with." />;
  }

  return (
    <View>
      <Section title="Build a deck">
        {/*
          A form, not a filter. The five playstyles were a chip row -- the
          control the rest of the app uses to *narrow a list you can see* --
          with the button that acts on the choice stranded on the line below. A
          labelled field and its submit button on one row say what the block
          does: pick a style, press Generate.
        */}
        <View style={s.form}>
          <View style={s.formField}>
            <Text style={s.formLabel}>Playstyle</Text>
            <Select
              options={STYLES}
              value={style}
              onChange={setStyle}
              accessibilityLabel="Playstyle"
              title="Choose a playstyle"
            />
          </View>
          <Button
            style={s.formSubmit}
            onPress={() => {
              setDeck(generateDeck(owned, '', style, variation));
              setVariation((v) => v + 1);
              setNotice('');
            }}
          >
            Generate
          </Button>
        </View>

        <CardGrid cards={deck} showCopies={false} onPressCard={openCard} emptyLabel="No deck yet — generate one." />

        <MetricGrid>
          <Metric label="Average elixir" value={stats.average?.toFixed(1) ?? '—'} icon="elixir" />
          <Metric label="Average level" value={stats.averageLevel?.toFixed(1) ?? '—'} icon="star" />
          <Metric
            label="Exact-deck record"
            value={<CrownRecord wins={stats.wins} losses={stats.losses} draws={stats.draws} />}
          />
          <Metric
            label="Win rate"
            value={stats.winRate === null ? 'No matches' : `${stats.winRate.toFixed(0)}%`}
            icon="target"
          />
        </MetricGrid>

        <View style={s.builderActions}>
          <Button size="sm" disabled={deck.length !== 8} onPress={() => void save()}>
            Save deck
          </Button>
          {link && (
            <Button variant="outline" size="sm" onPress={() => void Linking.openURL(link)}>
              Copy to game
            </Button>
          )}
        </View>
        {notice ? (
          <Text accessibilityRole="alert" style={s.notice}>
            {notice}
          </Text>
        ) : null}
      </Section>

      {/*
        Was a list of four hardcoded archetypes under a note saying the API
        publishes no deck or usage statistics. True of any single endpoint, and
        beside the point: the battle log returns both players' decks and the
        result, so the meta is countable. `ARCHETYPES` stays as the Builder's
        generator templates above -- it is what "Generate" walks.
      */}
      <CrMeta player={player} tag={tag} ownBattles={battles} />

      <Section title="Saved decks" count={saved.length}>
        {!saved.length && <CrEmpty body="No saved decks on this device." />}
        {saved.map((entry, i) => {
          const cards = entry.ids
            .map((id) => owned.find((c) => text(c['id']) === id))
            .filter((c): c is ApiRecord => Boolean(c));
          return (
            <View key={`${entry.name}-${i}`} style={s.archetype}>
              <Text style={s.archetypeName}>{entry.name}</Text>
              <CardGrid cards={cards} showCopies={false} onPressCard={openCard} emptyLabel="Cards no longer owned." />
              <View style={s.builderActions}>
                <Button variant="outline" size="sm" onPress={() => setDeck(cards)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onPress={() => void remove(i)}>
                  Delete
                </Button>
              </View>
            </View>
          );
        })}
      </Section>
      {cardSheet}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    towerBlock: { gap: 10, marginTop: 14 },
    tower: {
      fontFamily: t.fonts.sans,
      fontSize: 11,
      color: t.mutedForeground,
    },
    winRate: {
      fontFamily: t.fonts.display,
      fontSize: 13,
      marginTop: 14,
      color: t.accent,
    },
    copy: { marginTop: 16, alignSelf: 'flex-start' },
    copyNote: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 17,
      marginTop: 8,
      color: t.mutedForeground,
    },
    searchRow: { marginTop: 16, marginBottom: 12 },
    subLabel: {
      fontFamily: t.fonts.display,
      fontSize: 12,
      marginTop: 14,
      marginBottom: 8,
      color: t.mutedForeground,
    },
    generate: { marginTop: 12, marginBottom: 16, alignSelf: 'flex-start' },
    // The field stretches and the button hugs its label. `alignItems: flex-end`
    // lines the two up on their *bottoms*, so the trigger sits level with the
    // button rather than with the caption above it.
    form: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 18 },
    formField: { flex: 1, minWidth: 0 },
    formLabel: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      marginBottom: 6,
      color: t.mutedForeground,
    },
    formSubmit: { flexShrink: 0 },
    builderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    notice: { fontFamily: t.fonts.sans, fontSize: 11, marginTop: 10, color: t.success },
    archetype: {
      paddingVertical: 20,
      borderBottomWidth: 2,
      borderBottomColor: t.border,
    },
    archetypeName: { fontFamily: t.fonts.display, fontSize: 15, color: t.foreground },
    archetypeMeta: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 16,
      marginTop: 6,
      marginBottom: 12,
      color: t.mutedForeground,
    },
  });
