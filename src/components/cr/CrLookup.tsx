import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getGameData } from '@/api/client';
import { record, rows, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { useLiveAccount } from '@/hooks/use-live-account';
import { useHub } from '@/state/HubProvider';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/SearchField';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { clanBadgeArt } from '@/assets/royale';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CrEmpty, CrIcon, CrList, CrLoading, RankRow, Source, num } from './CrBits';

/**
 * Account resolution for the Clash Royale screens.
 *
 * Mirrors CocLookup: the saved passport tag resolves the account, a tag typed
 * *here* adopts it, and a tag arriving as a route param does not -- opening
 * someone else from a roster row must not overwrite your own account.
 *
 * The `clan` view differs from Clash of Clans': it renders the resolved clan
 * inline rather than only offering a search box, because the Royale Clan tab
 * is your clan. Other clans still open in the sheet.
 */
export function CrLookup({
  view,
  initialTag = '',
  children,
}: {
  view: 'player' | 'clan';
  initialTag?: string;
  /** Rendered with the resolved record once it loads. */
  children: (data: ApiRecord, tag: string) => ReactNode;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const { passport, setPassport } = useHub();
  const { openClan } = useDetailSheet();
  const account = useLiveAccount('cr', view, initialTag);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<GameResult>();
  const [finding, setFinding] = useState(false);
  const searched = useRef(false);

  const result = account.result;

  /**
   * Adopt a searched player tag as the saved account.
   *
   * Clan and Decks both resolve from it -- Clan reads the clan tag off the
   * saved player -- so without this they sit empty with nothing explaining
   * why.
   */
  useEffect(() => {
    if (view !== 'player' || !searched.current || !result?.ok) return;
    const found = text(record(JSON.parse(result.data))['tag']);
    if (!found || found === '—') return;
    searched.current = false;
    if (passport.cr !== found) setPassport({ ...passport, cr: found });
  }, [view, result, passport, setPassport]);

  async function load() {
    const value = query.trim();
    if (!value) return;
    // In the clan view a leading # is a tag and goes straight to the sheet;
    // anything else is a name search.
    if (view === 'clan') {
      if (value.startsWith('#')) {
        openClan(value, 'cr');
        setMatches(undefined);
        return;
      }
      setFinding(true);
      try {
        setMatches(await getGameData({ game: 'cr', resource: 'clanSearch', name: value }));
      } catch {
        setMatches({
          ok: false,
          status: 400,
          error: 'Enter a clan name of at least 3 characters, or a tag starting with #.',
        });
      } finally {
        setFinding(false);
      }
      return;
    }
    searched.current = true;
    account.load(value);
  }

  const data = result?.ok ? record(JSON.parse(result.data)) : null;
  // The search box is the empty state only. Changing the account you are
  // signed in as is the Passport screen's job now -- it holds several, and an
  // inline field could only ever overwrite one of them.
  const needsTag = !account.target;
  const found = matches?.ok ? rows(record(JSON.parse(matches.data))['items']) : [];

  return (
    <View>
      {(needsTag || view === 'clan') && (
        <View style={s.connect}>
          <View style={s.connectHead}>
            <CrIcon name={view === 'clan' ? 'clan' : 'king'} size={44} />
            <View style={s.connectText}>
              <Text style={s.connectTitle}>
                {view === 'clan' ? 'Find a clan' : 'Your account'}
              </Text>
              <Text style={s.connectHint}>
                {view === 'clan' ? 'Clan name or #tag' : 'Player tag'}
              </Text>
            </View>
          </View>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void load()}
            placeholder={view === 'clan' ? 'Explore clans by name or #tag…' : '#L8YV8P2CL'}
            accessibilityLabel={view === 'clan' ? 'Clan name or tag' : 'Player tag'}
            autoCapitalize="characters"
          />
          <Button size="sm" style={s.searchBtn} disabled={finding} onPress={() => void load()}>
            {finding ? 'Searching…' : 'Search'}
          </Button>
        </View>
      )}

      {matches && !matches.ok && <Source result={matches} />}
      {matches?.ok && !found.length && <CrEmpty body="No clans matched that name." />}
      {found.length > 0 && (
        <View style={s.matches}>
          <CrList>
            {found.map((clan) => (
              <RankRow
                key={text(clan['tag'])}
                art={clanBadgeArt(clan['badgeId'])}
                title={text(clan['name'])}
                subtitle={`${text(clan['tag'])} · ${num(clan['members'])}/50 members · ${text(
                  record(clan['location'])['name'],
                )}`}
                score={clan['clanScore']}
                onPress={() => {
                  openClan(text(clan['tag']), 'cr');
                  setMatches(undefined);
                }}
              />
            ))}
          </CrList>
        </View>
      )}

      {account.busy && !data && <CrLoading label="Loading your Royale account…" />}
      {!account.busy && !account.target && view === 'clan' && (
        <CrEmpty
          title="No clan yet"
          body="Save a player tag on the Home tab and your clan appears here, or search for one above."
        />
      )}
      {data ? children(data, account.target) : null}
      {result ? <Source result={result} /> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    connect: {
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderColor: t.border,
      paddingVertical: 20,
      gap: 12,
    },
    connectHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    connectText: { flex: 1, minWidth: 0 },
    connectTitle: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground },
    connectHint: { fontFamily: t.fonts.sans, fontSize: 11, marginTop: 5, color: t.mutedForeground },
    searchBtn: { alignSelf: 'flex-start' },
    matches: { marginTop: 16 },
  });
