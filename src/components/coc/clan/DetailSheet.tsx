import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { Sheet } from '@/components/ui/Sheet';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CocPlayer } from '../CocPlayer';
import { Source } from '../CocBits';
import { EmptyState } from './ClanBits';
import { ClanOverview } from './ClanOverview';
import { ClanCapitalRaids } from './ClanCapitalRaids';
import { ClanWarLog } from './ClanWarLog';
import { useDetailSheet, type SheetEntry } from './DetailSheetProvider';

/**
 * The navigable detail sheet: a clan profile, a player profile, or one of the
 * clan's sub-views, over whatever screen the user was on.
 *
 * Every entry in the stack stays mounted, with all but the top hidden. The
 * alternative -- rendering only the top -- resets each layer's local state,
 * so stepping from the capital raids page into an attacker's profile and
 * back would lose the selected weekend and every expanded row, which is
 * precisely the journey the stack exists to support.
 */
export function DetailSheet({
  stack,
  onBack,
  onClose,
}: {
  stack: SheetEntry[];
  onBack: () => void;
  onClose: () => void;
}) {
  const top = stack[stack.length - 1]!;

  return (
    <Sheet
      open
      variant="plain"
      title={<SheetTitle entry={top} />}
      onClose={onClose}
      onBack={stack.length > 1 ? onBack : undefined}
    >
      {stack.map((entry, i) => (
        <Layer key={`${entry.kind}-${entry.tag}-${i}`} hidden={i !== stack.length - 1}>
          {entry.kind === 'player' ? <PlayerEntry tag={entry.tag} /> : <ClanEntry entry={entry} />}
        </Layer>
      ))}
    </Sheet>
  );
}

/** A stack layer. `display: none` keeps it mounted but out of the way. */
function Layer({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View
      style={[s.layer, hidden && s.hidden]}
      pointerEvents={hidden ? 'none' : 'auto'}
      // `display: none` already drops a layer out of the browser's
      // accessibility tree, but not reliably out of Android's, so the layers
      // underneath are hidden explicitly as well.
      aria-hidden={hidden}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Header text for the entry on top, read from its own cached record. */
function SheetTitle({ entry }: { entry: SheetEntry }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const resource = entry.kind === 'player' ? 'player' : 'clan';
  // Already in the cache by the time the title renders -- the layer below
  // fetched it. No request is made here.
  const { data } = useQuery(gameQuery({ game: 'coc', resource, tag: entry.tag }));
  const record_ = parsed(data);
  const name = record_ ? text(record_['name']) : entry.tag;
  const title =
    entry.kind === 'capital'
      ? `Capital raids · ${name}`
      : entry.kind === 'warLog'
        ? `War history · ${name}`
        : name;
  return (
    <Text style={s.title} numberOfLines={2}>
      {title}
    </Text>
  );
}

function ClanEntry({ entry }: { entry: SheetEntry }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { pushView, close } = useDetailSheet();
  const { data: result, isFetching } = useQuery(
    gameQuery({ game: 'coc', resource: 'clan', tag: entry.tag }),
  );
  const clan = parsed(result);

  if (isFetching && !clan) return <Text style={s.loading}>Loading clan…</Text>;
  if (!clan) {
    return (
      <View style={s.fill}>
        <EmptyState
          title="Clan not found"
          body={`Nothing came back for ${entry.tag}. Check the tag, or try again in a moment.`}
        />
        {result ? <Source result={result} /> : null}
      </View>
    );
  }

  if (entry.kind === 'capital') return <ClanCapitalRaids tag={entry.tag} />;
  if (entry.kind === 'warLog') return <ClanWarLog clan={clan} tag={entry.tag} />;

  return (
    <>
      <ClanOverview
        clan={clan}
        onOpenCapital={() => pushView({ kind: 'capital', tag: entry.tag })}
        onOpenWarLog={() => pushView({ kind: 'warLog', tag: entry.tag })}
        onClose={close}
      />
      {result ? <Source result={result} /> : null}
    </>
  );
}

function PlayerEntry({ tag }: { tag: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { data: result, isFetching } = useQuery(gameQuery({ game: 'coc', resource: 'player', tag }));
  const player = parsed(result);

  if (isFetching && !player) return <Text style={s.loading}>Loading village…</Text>;
  if (!player) {
    return (
      <View style={s.fill}>
        <EmptyState
          title="Village not found"
          body={`Nothing came back for ${tag}. The player may have changed their tag.`}
        />
        {result ? <Source result={result} /> : null}
      </View>
    );
  }

  return (
    <>
      <CocPlayer player={player} />
      {result ? <Source result={result} /> : null}
    </>
  );
}

/** A successful body as a record, or undefined for an error or bad JSON. */
function parsed(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

const build = (t: Theme) =>
  StyleSheet.create({
    // Layers stack on top of each other rather than flowing, so the hidden
    // ones take no space and the visible one fills the sheet.
    layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    hidden: { display: 'none' },
    scroll: { flex: 1 },
    // flexGrow lets a short view (an empty state) fill the sheet and centre
    // itself, while a long one still scrolls normally.
    content: { flexGrow: 1, padding: 12, paddingBottom: 32 },
    fill: { flex: 1 },
    title: { flex: 1, minWidth: 0, color: t.primary, fontFamily: t.fonts.display, fontSize: 18 },
    loading: {
      paddingVertical: 48,
      textAlign: 'center',
      fontSize: 13,
      color: t.primary,
      fontFamily: t.fonts.sans,
    },
  });
