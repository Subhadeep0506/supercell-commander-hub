import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getGameData } from '@/api/client';
import { record, rows, text, type GameResult } from '@/api/game-api';
import { useLiveAccount } from '@/hooks/use-live-account';
import { useHub } from '@/state/HubProvider';
import { Button } from '@/components/ui/Button';
import { ClanFilters, type ClanFilterValues } from '@/components/ui/ClanFilters';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { Panel } from '@/components/ui/Panel';
import { SearchField } from '@/components/ui/SearchField';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, Source } from './CocBits';
import { CocPlayer } from './CocPlayer';
import { WarTabs } from './war/WarTabs';
import { ClanCard } from './clan/ClanCard';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';

type LookupView = 'player' | 'war' | 'clan';

/**
 * Ported from the `CocLookup` component in frontend/src/components/coc-mobile.tsx.
 *
 * Four states share one screen: the search form, a loading line, a list of
 * clan-name matches, and the resolved account. The clan view always shows the
 * form because it accepts a name as well as a tag.
 */
type LookupProps = { view?: LookupView; initialTag?: string };

/**
 * Remounts the whole lookup when the active passport changes.
 *
 * Switching accounts on the Passport screen used to leave every game screen
 * showing the previous one. The stack keeps screens mounted, so nothing ever
 * cleared `useLiveAccount`'s search override -- and `target = override ||
 * savedTag` means a tag searched once wins over the saved tag forever. The
 * clan-name matches, the text in the search box and the `searched` ref had the
 * same lifetime problem.
 *
 * Keying on `passport.id` rather than on the tag resets all four at once, and
 * catches an *edit* to the active passport's tag as well as a switch to a
 * different one. The screens' own `key={tag}` still handles arriving from a
 * roster row, which is a different question: whose profile to show, not which
 * account is mine.
 */
export function CocLookup(props: LookupProps) {
  const { passport } = useHub();
  return <CocLookupView key={passport.id} {...props} />;
}

function CocLookupView({ view = 'player', initialTag = '' }: LookupProps) {
  const theme = useTheme();
  const navigation = useNavigation();
  const s = useMemo(() => build(theme), [theme]);

  const { passport, setPassport } = useHub();
  const { openClan } = useDetailSheet();
  const account = useLiveAccount('coc', view, initialTag);
  const [tag, setTag] = useState('');
  const [matches, setMatches] = useState<GameResult>();
  const [finding, setFinding] = useState(false);
  const [filters, setFilters] = useState<ClanFilterValues>({});

  async function load() {
    // A typed clan tag goes straight to the profile sheet -- that is the clan
    // view now, so there is nothing to resolve into the page behind it.
    if (view === 'clan' && tag.trim().startsWith('#')) {
      openClan(tag.trim(), 'coc');
      setMatches(undefined);
      return;
    }
    // A clan query without a leading # is treated as a name search.
    if (view === 'clan' && !tag.trim().startsWith('#')) {
      setFinding(true);
      try {
        setMatches(
          await getGameData({
            game: 'coc',
            resource: 'clanSearch',
            name: tag.trim(),
            // Filters go to the service, not to the result list: the response
            // is one capped page, so narrowing it here would hide matches
            // rather than find them.
            ...filters,
          }),
        );
      } catch {
        setMatches({
          ok: false,
          status: 400,
          error: 'Enter a clan name with at least 3 characters, or a tag starting with #.',
        });
      } finally {
        setFinding(false);
      }
    } else {
      // Only a tag the user typed here is worth adopting as their account.
      searched.current = true;
      account.load(tag);
      setMatches(undefined);
    }
  }

  const result = account.result;

  /**
   * Adopt a successfully searched player tag as the saved passport account.
   *
   * Without this the clan, war and builder screens have nothing to resolve
   * from -- they read the saved tag, fetch that player, and take the clan tag
   * off it. Searching on this screen used to be a one-off override, so those
   * screens stayed empty with no indication why. The reference app had the
   * same gap and simply expected you to visit Passport first.
   *
   * Deliberately gated on `searched`: arriving here from a clan member row or
   * a leaderboard link passes a tag too, and looking someone else up must not
   * overwrite your own account.
   */
  const searched = useRef(false);
  useEffect(() => {
    if (view !== 'player' || !searched.current || !result?.ok) return;
    const found = text(record(JSON.parse(result.data))['tag']);
    if (!found || found === '—') return;
    searched.current = false;
    if (found !== passport.coc) setPassport({ ...passport, coc: found });
  }, [view, result, passport, setPassport]);

  const showForm = view === 'clan' || (!account.target && !account.busy);
  const matchRows = matches?.ok ? rows(record(JSON.parse(matches.data))['items']) : [];

  return (
    <View style={s.stack}>
      {/*
        The search box is the empty state only. The row that used to sit here
        when an account *was* resolved -- "Saved account · #TAG" with Change
        and Refresh -- is gone: switching account is the Passport screen's job
        now that it holds several, and an inline field could only overwrite
        one of them.
      */}
      {showForm ? (
        <View style={s.form}>
          <SearchField
            style={s.formField}
            value={tag}
            onChangeText={setTag}
            onSubmitEditing={() => void load()}
            autoCapitalize="characters"
            accessibilityLabel={
              view === 'player' ? 'Player tag' : view === 'clan' ? 'Clan name or tag' : 'Clan tag'
            }
            placeholder={
              view === 'clan' ? 'Clan name or #tag' : view === 'player' ? 'Player tag #…' : 'Clan tag #…'
            }
          />
          <Button disabled={account.busy || finding} onPress={() => void load()}>
            Search
          </Button>
        </View>
      ) : null}

      {/* Clan search only: a player tag is exact, so there is nothing to narrow. */}
      {showForm && view === 'clan' ? (
        <ClanFilters game="coc" value={filters} onChange={setFilters} />
      ) : null}

      {account.busy || finding ? (
        <SkeletonRows
          rows={finding ? 5 : 3}
          avatar
          label={`Loading ${
            finding
              ? 'clans'
              : view === 'player'
                ? 'your village'
                : view === 'war'
                  ? 'current war'
                  : 'your clan'
          }`}
        />
      ) : null}

      {matches?.ok ? (
        <View>
          <Text style={s.matchHeading}>Clans · {matchRows.length}</Text>
          <View style={s.matchList}>
            {matchRows.map((clan, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                style={s.matchRow}
                onPress={() => openClan(text(clan['tag']), 'coc')}
              >
                <Art name="war" size={32} />
                <View style={s.matchText}>
                  <Text style={s.matchName} numberOfLines={1}>
                    {text(clan['name'])}
                  </Text>
                  <Text style={s.matchMeta} numberOfLines={1}>
                    {text(clan['tag'])} · Level {text(clan['clanLevel'])} · {text(clan['members'])}/50
                  </Text>
                </View>
                <Text style={s.matchPoints}>{text(clan['clanPoints'])}</Text>
              </Pressable>
            ))}
          </View>
          {matchRows.length === 0 ? <Text style={s.empty}>No clans found.</Text> : null}
        </View>
      ) : null}
      {matches && !matches.ok ? <Source result={matches} /> : null}

      {/*
        War is gated on having a clan tag rather than on a successful war
        response: `currentwar` answers 403 for a private war log and
        `notInWar` throughout a league season, and in both cases the War
        League tab still has something to show. WarTabs owns its own errors
        and its own Source footer for that reason.
      */}
      {view === 'war' ? (
        account.target && !matches ? (
          <WarTabs key={account.target} tag={account.target} warResult={result} />
        ) : null
      ) : result?.ok && !matches ? (
        view === 'player' ? (
          <CocPlayer player={record(JSON.parse(result.data))} />
        ) : (
          // The clan view resolves the saved account's clan and offers it as a
          // card; the profile itself lives in the sheet.
          <ClanCard clan={record(JSON.parse(result.data))} />
        )
      ) : null}

      {!result && !account.busy && !matches ? (
        <Panel style={s.placeholder}>
          <Art name={view === 'player' ? 'Barbarian King' : 'war'} size={112} />
          <Text style={s.placeholderTitle}>
            {view === 'player' ? 'Your village' : view === 'war' ? 'Your clan’s war' : 'Find a clan'}
          </Text>
          <Text style={s.placeholderBody}>
            {view === 'player'
              ? 'No village selected'
              : view === 'war'
                ? 'No clan selected'
                : 'Search by clan name or tag'}
          </Text>
          <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Passport')}>
            <Text style={s.placeholderLink}>Saved accounts ›</Text>
          </Pressable>
        </Panel>
      ) : null}

      {account.error ? (
        <Text accessibilityRole="alert" style={s.error}>
          Unable to load this account. Check its tag and try again.
        </Text>
      ) : null}
      {result && !matches && view !== 'war' ? <Source result={result} /> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 16 },
    form: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
    formField: { flex: 1, minWidth: 0 },

    error: { fontSize: 13, color: t.destructive, fontFamily: t.fonts.sans },
    empty: { paddingVertical: 24, textAlign: 'center', fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },

    matchHeading: { marginBottom: 12, fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    matchList: { gap: 8 },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 64,
      paddingVertical: 12,
      paddingHorizontal: 10,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
    },
    matchText: { flex: 1, minWidth: 0 },
    matchName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    matchMeta: { marginTop: 2, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    matchPoints: { fontFamily: t.fonts.display, fontSize: 12, color: t.primary },

    placeholder: { alignItems: 'center' },
    placeholderTitle: { marginTop: 16, fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    placeholderBody: { marginTop: 12, fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },
    placeholderLink: { marginTop: 20, fontFamily: t.fonts.display, fontSize: 12, color: t.primary },
  });
