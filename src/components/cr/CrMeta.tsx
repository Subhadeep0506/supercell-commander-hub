import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { rows, text, type ApiRecord } from '@/api/game-api';
import { deckLink } from '@/lib/royale-decks';
import { playerBracketId, type BracketStats, type MetaDeck } from '@/lib/royale-meta';
import { deckFit, fitScore, type DeckFit } from '@/lib/royale-meta-fit';
import { DEFAULT_BUDGET } from '@/lib/royale-meta-sample';
import { useCrMeta } from '@/hooks/use-cr-meta';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { Meter } from '@/components/ui/Meter';
import { Select, type SelectOption } from '@/components/ui/Select';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CrEmpty, CrownRecord, DerivedNote, Metric, MetricGrid, Section } from './CrBits';
import { CardGrid, useCardSheet } from './CrCards';

/**
 * The current meta, computed on this device.
 *
 * Replaces the four hardcoded archetypes that used to sit here under a note
 * saying the API publishes no usage statistics. It does not -- but it does
 * return both players' decks and the result of every battle, so the meta can
 * be counted instead of looked up.
 *
 * Nothing runs on mount. A hundred battle-log downloads is a real cost on
 * mobile data, so the section starts as a button and the result is cached for
 * a week.
 */
export function CrMeta({
  player,
  tag,
  ownBattles,
}: {
  player: ApiRecord;
  tag: string;
  ownBattles: ApiRecord[];
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const meta = useCrMeta({ tag, player, ownBattles });
  const { openCard, cardSheet } = useCardSheet();
  const owned = useMemo(() => rows(player['cards']), [player]);

  const [bracketId, setBracketId] = useState<string>();
  const [playableOnly, setPlayableOnly] = useState(false);

  const brackets = meta.snapshot?.brackets ?? [];
  const mine = playerBracketId(player);
  // The player's own bracket if it was sampled, else the hardest one that was.
  const active =
    brackets.find((b) => b.bracket.id === bracketId) ??
    brackets.find((b) => b.bracket.id === mine) ??
    brackets[0];

  const options: SelectOption[] = brackets.map((b) => ({
    id: b.bracket.id,
    // The match count is on the label on purpose: a bracket with eleven
    // observations behind it must not look like one with nine hundred.
    label: `${b.bracket.label}${b.bracket.id === mine ? ' · yours' : ''} (${b.observations})`,
  }));

  return (
    <>
      <Section
        title="Current meta"
        count={active?.decks.length}
        right={
          meta.snapshot && !meta.running ? (
            <Button
              accessibilityLabel="Refresh the meta sample"
              variant="outline"
              size="sm"
              onPress={meta.run}
            >
              Refresh
            </Button>
          ) : undefined
        }
      >
        {meta.running ? (
          <View style={s.progress} accessibilityLabel="Sampling battle logs">
            <Text style={s.progressText}>
              Reading battle logs… {Math.round(meta.progress * 100)}%
            </Text>
            <Meter value={meta.progress * 100} />
            <Button
              accessibilityLabel="Cancel sampling"
              variant="ghost"
              size="sm"
              style={s.cancel}
              onPress={meta.cancel}
            >
              Cancel
            </Button>
          </View>
        ) : null}

        {!meta.running && !meta.snapshot ? (
          <View style={s.start}>
            <Text style={s.startBody}>
              There is no meta endpoint, but every battle log carries both players' decks and who
              won. This reads about {DEFAULT_BUDGET} of them — your recent opponents, your
              clanmates and the top of the ranked ladder — and counts what wins. It takes a
              moment, and the result is kept for a week.
            </Text>
            <Button
              accessibilityLabel="Find the current meta"
              onPress={meta.run}
              disabled={meta.loading}
            >
              Find the current meta
            </Button>
          </View>
        ) : null}

        {meta.error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {meta.error}
          </Text>
        ) : null}

        {meta.snapshot && !meta.running ? (
          <>
            {options.length > 1 ? (
              <View style={s.pickerRow}>
                <Text style={s.pickerLabel}>League or arena</Text>
                <Select
                  options={options}
                  value={active?.bracket.id ?? ''}
                  onChange={setBracketId}
                  accessibilityLabel="Choose a league or arena"
                  title="Choose a league or arena"
                />
              </View>
            ) : null}

            {active ? (
              <BracketBody
                stats={active}
                owned={owned}
                playableOnly={playableOnly}
                onPlayableOnly={setPlayableOnly}
                onPressCard={openCard}
              />
            ) : (
              <CrEmpty
                title="Nothing to rank yet"
                body="The sampled logs held no competitive battles — only friendlies and party modes. Try again later, when the accounts sampled have played ranked."
              />
            )}

            <DerivedNote>
              Counted from {meta.sampled} battle{meta.sampled === 1 ? '' : 's'} log
              {meta.sampled === 1 ? '' : 's'} ({meta.seeds?.opponents ?? 0} recent opponents,{' '}
              {meta.seeds?.clanmates ?? 0} clanmates, {meta.seeds?.topLadder ?? 0} from the ranked
              ladder){meta.failed > 0 ? `, ${meta.failed} unreachable` : ''} —{' '}
              {meta.snapshot.battles} competitive battles, {meta.snapshot.skipped} skipped as
              friendlies or party modes. Ranked order blends how often a deck is played with the
              lower bound of its win rate, so a deck seen a handful of times cannot top the list.
              {meta.stale ? ' This sample is over a week old — press Refresh.' : ''}
            </DerivedNote>
          </>
        ) : null}
      </Section>
      {cardSheet}
    </>
  );
}

function BracketBody({
  stats,
  owned,
  playableOnly,
  onPlayableOnly,
  onPressCard,
}: {
  stats: BracketStats;
  owned: ApiRecord[];
  playableOnly: boolean;
  onPlayableOnly: (v: boolean) => void;
  onPressCard: (card: ApiRecord) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const ranked = useMemo(() => {
    const scored = stats.decks.map((deck) => {
      const fit = deckFit(deck, owned);
      return { deck, fit, score: fitScore(deck, fit) };
    });
    return scored
      .filter((entry) => !playableOnly || entry.fit.playable)
      .sort((a, b) => b.score - a.score);
  }, [stats, owned, playableOnly]);

  const playableCount = useMemo(
    () => stats.decks.filter((d) => deckFit(d, owned).playable).length,
    [stats, owned],
  );

  return (
    <View>
      <View style={s.filterRow}>
        <Button
          accessibilityLabel="Only decks you can field"
          variant={playableOnly ? 'default' : 'outline'}
          size="sm"
          onPress={() => onPlayableOnly(!playableOnly)}
        >
          {playableOnly ? 'Showing decks you can field' : `Only decks you can field (${playableCount})`}
        </Button>
      </View>

      {stats.popularCards.length > 0 ? (
        <View style={s.popular}>
          <Text style={s.popularTitle}>Most played here</Text>
          {/*
            The reliable half of the sample. Per-card usage rests on thousands
            of observations where a single deck row may rest on eight, so this
            is the part of the screen to trust most -- and it is what the
            matchup rows below are measured against.
          */}
          <CardGrid
            cards={stats.popularCards.map((p) => p.card)}
            columns={6}
            showCopies={false}
            showLevel={false}
            onPressCard={onPressCard}
          />
          <Text style={s.popularMeta}>
            {stats.popularCards
              .map((p) => `${text(p.card['name'])} ${Math.round(p.share * 100)}%`)
              .join(' · ')}
          </Text>
        </View>
      ) : null}

      {ranked.length === 0 ? (
        <CrEmpty
          body={
            playableOnly
              ? 'No deck in this bracket is one you can field with your current collection.'
              : 'No deck in this bracket was seen enough times to rank.'
          }
        />
      ) : null}

      {ranked.map((entry, i) => (
        <DeckRow
          key={entry.deck.key}
          rank={i + 1}
          deck={entry.deck}
          fit={entry.fit}
          popular={stats.popularCards}
          onPressCard={onPressCard}
        />
      ))}
    </View>
  );
}

function DeckRow({
  rank,
  deck,
  fit,
  popular,
  onPressCard,
}: {
  rank: number;
  deck: MetaDeck;
  fit: DeckFit;
  popular: BracketStats['popularCards'];
  onPressCard: (card: ApiRecord) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const link = deckLink(deck.cards);
  const gap = fit.levelGap;

  return (
    <View style={s.deck}>
      <Collapsible
        accessibilityLabel={`Meta deck ${rank}, ${Math.round(deck.winRate)} percent win rate`}
        summary={() => (
          <View style={s.deckSummary}>
            <View style={s.deckTop}>
              <Text style={s.deckRank}>#{rank}</Text>
              <Text style={s.deckWin}>{Math.round(deck.winRate)}%</Text>
              <Text style={s.deckMeta}>
                {deck.matches} match{deck.matches === 1 ? '' : 'es'}
              </Text>
              {/* `> 0`, never a bare `fit.missing &&`: a zero would render as a
                  text node inside a View -- a warning in the browser, a crash
                  on Android. */}
              {fit.missing > 0 ? (
                <Text style={s.deckMissing}>{fit.missing} locked</Text>
              ) : null}
            </View>
            {/*
              No `onPressCard` here, and that is load-bearing rather than an
              omission. Collapsible's summary is itself a Pressable, which
              react-native-web renders as a <button>, and a pressable card tile
              inside it nests a button in a button -- invalid HTML and a React
              DOM error on every row. Without the handler CardTile renders a
              plain View, so the preview survives, the whole row stays one tap
              target, and the cards are tappable in the body below.
            */}
            <CardGrid cards={deck.cards} columns={8} gap={4} showCopies={false} showLevel={false} />
          </View>
        )}
      >
        <CardGrid
          cards={deck.cards}
          columns={4}
          showCopies={false}
          showLevel={false}
          onPressCard={onPressCard}
        />
        <MetricGrid>
          <Metric
            label="Record"
            value={<CrownRecord wins={deck.wins} losses={deck.losses} draws={deck.draws} />}
          />
          <Metric label="Average elixir" value={deck.averageElixir?.toFixed(1) ?? '—'} icon="elixir" />
          <Metric
            label="Share of this bracket"
            value={`${(deck.usage * 100).toFixed(1)}%`}
            icon="cards"
          />
          <Metric
            label="Your card levels"
            value={
              gap === null
                ? 'Unknown'
                : gap <= 0
                  ? 'At or above'
                  : `${gap.toFixed(1)} behind`
            }
            icon="star"
          />
        </MetricGrid>

        {deck.towerCard ? (
          <View style={s.tower}>
            <Text style={s.towerLabel}>Usual tower troop</Text>
            <CardGrid
              cards={[deck.towerCard]}
              columns={6}
              showCopies={false}
              showLevel={false}
              onPressCard={onPressCard}
            />
          </View>
        ) : null}

        {fit.missing > 0 ? (
          <Text style={s.lockedList}>
            You do not have:{' '}
            {fit.cards
              .filter((c) => !c.owned)
              .map((c) => text(c.card['name']))
              .join(', ')}
          </Text>
        ) : null}

        {popular.length > 0 ? (
          <View style={s.counters}>
            <Text style={s.countersTitle}>Against the cards played most here</Text>
            {popular.map((p) => {
              const id = text(p.card['id']);
              const versus = deck.counters[id];
              return (
                <View key={id} style={s.counterRow}>
                  <Text style={s.counterName} numberOfLines={1}>
                    {text(p.card['name'])}
                  </Text>
                  <Text style={s.counterValue}>
                    {versus && versus.matches > 0
                      ? `${Math.round((versus.wins / versus.matches) * 100)}% of ${versus.matches}`
                      : 'Not faced'}
                  </Text>
                </View>
              );
            })}
            <Text style={s.countersNote}>
              Matchup counts are a slice of an already small sample — read them beside the match
              count, not instead of it.
            </Text>
          </View>
        ) : null}

        {link ? (
          <Button
            accessibilityLabel={`Copy meta deck ${rank} to the game`}
            variant="outline"
            size="sm"
            style={s.copy}
            onPress={() => void Linking.openURL(link)}
          >
            Copy to game
          </Button>
        ) : null}
      </Collapsible>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    start: { gap: 12 },
    startBody: { fontSize: 12, lineHeight: 19, color: t.mutedForeground, fontFamily: t.fonts.sans },

    progress: { gap: 10 },
    progressText: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    cancel: { alignSelf: 'flex-start' },

    error: { marginTop: 10, fontSize: 12, color: t.destructive, fontFamily: t.fonts.sans },

    pickerRow: { marginBottom: 14, gap: 6 },
    pickerLabel: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    filterRow: { marginBottom: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    popular: { marginBottom: 18, gap: 8 },
    popularTitle: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    popularMeta: { fontSize: 10, lineHeight: 16, color: t.mutedForeground, fontFamily: t.fonts.sans },

    deck: { marginBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.border },
    // A column inside Collapsible's row-shaped summary slot.
    deckSummary: { flex: 1, minWidth: 0, gap: 8 },
    deckTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    deckRank: { fontFamily: t.fonts.display, fontSize: 14, color: t.primary },
    deckWin: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    deckMeta: { flex: 1, minWidth: 0, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    deckMissing: { fontSize: 11, color: t.destructive, fontFamily: t.fonts.display },

    tower: { marginTop: 12, gap: 6 },
    towerLabel: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    lockedList: { marginTop: 12, fontSize: 11, lineHeight: 17, color: t.destructive, fontFamily: t.fonts.sans },

    counters: { marginTop: 14, gap: 6 },
    countersTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    counterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    counterName: { flex: 1, minWidth: 0, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    counterValue: { fontSize: 11, color: t.foreground, fontFamily: t.fonts.display },
    countersNote: { marginTop: 4, fontSize: 10, lineHeight: 15, color: t.mutedForeground, fontFamily: t.fonts.sans },

    copy: { marginTop: 14, alignSelf: 'flex-start' },
  });
