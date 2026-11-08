import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { record, text, type ApiRecord } from '@/api/game-api';
import { useLiveAccount } from '@/hooks/use-live-account';
import { useHub } from '@/state/HubProvider';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/SearchField';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { arenaImages } from '@/assets/registry.arena';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { BsEmpty, Source } from './BsBits';

/**
 * Account resolution for the Brawl Stars screens.
 *
 * Mirrors CrLookup, minus its entire clan half: **Brawl Stars has no club
 * search endpoint**, and `gameRequestSchema` rejects `clanSearch` for `bs`
 * outright. So there is no name-search path here, no filter row, and no match
 * list -- a club is reached by being in it, by tapping a roster row, or from
 * a battle opponent's profile.
 *
 * The `club` view therefore has no search box at all: it either resolves your
 * club off the saved player or explains that it cannot.
 */
type LookupProps = {
  view: 'player' | 'clan';
  initialTag?: string;
  /** Rendered with the resolved record once it loads. */
  children: (data: ApiRecord, tag: string) => ReactNode;
};

/**
 * Remounts the whole lookup when the active passport changes.
 *
 * See the note on `CocLookup`: without this, switching accounts leaves the
 * screen showing the previous one, because `useLiveAccount`'s search override
 * outlives the switch and beats the saved tag.
 */
export function BsLookup(props: LookupProps) {
  const { passport } = useHub();
  return <BsLookupView key={passport.id} {...props} />;
}

function BsLookupView({ view, initialTag = '', children }: LookupProps) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const { passport, setPassport } = useHub();
  const account = useLiveAccount('bs', view, initialTag);
  const [query, setQuery] = useState('');
  const searched = useRef(false);

  const result = account.result;

  /**
   * Adopt a searched player tag as the saved account.
   *
   * Stats and Club both resolve from it -- Club reads `club.tag` off the saved
   * player -- so without this, searching a tag on Home leaves the other two
   * tabs empty with nothing on screen explaining why.
   */
  useEffect(() => {
    if (view !== 'player' || !searched.current || !result?.ok) return;
    const found = text(record(JSON.parse(result.data))['tag']);
    if (!found || found === '—') return;
    searched.current = false;
    if (passport.bs !== found) setPassport({ ...passport, bs: found });
  }, [view, result, passport, setPassport]);

  function load() {
    const value = query.trim();
    if (!value) return;
    searched.current = true;
    account.load(value);
  }

  const data = result?.ok ? record(JSON.parse(result.data)) : null;
  // The search box is the empty state only; switching accounts is the
  // Passport screen's job, exactly as on the Royale side.
  const needsTag = !account.target;

  return (
    <View style={s.stack}>
      {view === 'player' && needsTag ? (
        <View style={s.connect}>
          <View style={s.connectHead}>
            <Image source={arenaImages.bsicon} style={s.connectIcon} resizeMode="contain" />
            <View style={s.connectText}>
              <Text style={s.connectTitle}>Your account</Text>
              <Text style={s.connectHint}>Player tag</Text>
            </View>
          </View>
          <View style={s.form}>
            <SearchField
              style={s.formField}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={load}
              placeholder="#Q8R0UP09R"
              accessibilityLabel="Player tag"
              autoCapitalize="characters"
            />
            <Button disabled={account.busy} onPress={load}>
              {account.busy ? 'Loading…' : 'Search'}
            </Button>
          </View>
        </View>
      ) : null}

      {account.busy && !data ? <SkeletonRows rows={4} /> : null}

      {!account.busy && !account.target && view === 'clan' ? (
        <BsEmpty
          title="No club yet"
          body="Save a player tag on the Home tab and your club appears here."
        />
      ) : null}

      {/*
        An error is reported through Source rather than swallowed: a 404 on a
        club tag read off your own profile means you have left the club, which
        is a different thing from the service being down.
      */}
      {!account.busy && account.target && result && !result.ok ? (
        <BsEmpty
          title={view === 'clan' ? 'Club unavailable' : 'Player unavailable'}
          body={
            result.status === 404
              ? 'The service does not know that tag.'
              : 'The Brawl Stars service could not be reached.'
          }
        />
      ) : null}

      {data ? children(data, account.target) : null}
      {result ? <Source result={result} /> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 12 },
    connect: {
      padding: 14,
      gap: 12,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.chrome.bs.rim,
      borderRadius: t.radius.md,
    },
    connectHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    connectIcon: { width: 44, height: 44, borderRadius: t.radius.lg },
    connectText: { flex: 1, minWidth: 0 },
    connectTitle: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground },
    connectHint: { fontFamily: t.fonts.sans, fontSize: 11, marginTop: 5, color: t.mutedForeground },
    form: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
    formField: { flex: 1, minWidth: 0 },
  });
