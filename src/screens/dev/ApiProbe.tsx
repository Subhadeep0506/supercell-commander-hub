import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MISSING_KEYS } from '@/config/keys';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type GameResult } from '@/api/game-api';
import { COC_ART, GAME_LOGOS, UI_ART, townHallArt } from '@/assets/art';
import { BOOK_ITEMS, itemArt } from '@/lib/clash-book';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Diagnostic screen for the API layer. Not part of the real app -- it exists
 * so the Stage 1 gate ("a real tag returns live data in Chrome") can actually
 * be checked, and so a later 403 can be told apart from a bundler problem.
 */
export function ApiProbe() {
  const theme = useTheme();
  const [tag, setTag] = useState('');
  const [lookup, setLookup] = useState('');

  const board = useQuery(gameQuery({ game: 'coc', resource: 'leaderboard' }));
  const player = useQuery({
    ...gameQuery({ game: 'coc', resource: 'player', tag: lookup }),
    enabled: Boolean(lookup),
  });

  const s = styles(theme);
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Text style={s.kicker}>API LAYER</Text>
      <Text style={s.title}>Stage 1 probe</Text>

      <Row label="Tokens in .env">
        {MISSING_KEYS.length === 0 ? (
          <Text style={s.ok}>all three present</Text>
        ) : (
          <Text style={s.bad}>missing: {MISSING_KEYS.join(', ')}</Text>
        )}
      </Row>

      <Text style={s.heading}>Assets</Text>
      <Text style={s.muted}>
        {BOOK_ITEMS.length} catalog items · this line is Clash Regular, the headings are Clash
        Display
      </Text>
      <View style={s.strip}>
        {[
          COC_ART['Barbarian King'],
          townHallArt(17),
          COC_ART['Rage Spell'],
          itemArt(BOOK_ITEMS.find((i) => i.id === 'home/army-camp')!)?.source,
          UI_ART.search,
          GAME_LOGOS.coc,
        ].map((source, i) =>
          source ? <Image key={i} source={source} style={s.thumb} resizeMode="contain" /> : null,
        )}
      </View>

      <Text style={s.heading}>Global leaderboard</Text>
      <Outcome busy={board.isFetching} result={board.data} theme={theme}>
        {(data) => (
          <View>
            {rows(record(data)['items'])
              .slice(0, 5)
              .map((p, i) => (
                <Text key={i} style={s.row}>
                  {text(p['rank'])}. {text(p['name'])} — {text(p['trophies'])}
                </Text>
              ))}
          </View>
        )}
      </Outcome>

      <Text style={s.heading}>Player lookup</Text>
      <View style={s.formRow}>
        <TextInput
          style={s.input}
          value={tag}
          onChangeText={(v) => setTag(v.toUpperCase())}
          placeholder="#2PP"
          placeholderTextColor={theme.mutedForeground}
          autoCapitalize="characters"
          onSubmitEditing={() => setLookup(tag)}
        />
        <Pressable style={s.button} onPress={() => setLookup(tag)}>
          <Text style={s.buttonText}>Look up</Text>
        </Pressable>
      </View>
      {lookup ? (
        <Outcome busy={player.isFetching} result={player.data} theme={theme}>
          {(data) => {
            const p = record(data);
            return (
              <View>
                <Text style={s.row}>
                  {text(p['name'])} · {text(p['tag'])}
                </Text>
                <Text style={s.row}>Town Hall {text(p['townHallLevel'])}</Text>
                <Text style={s.row}>
                  {text(p['trophies'])} trophies · {rows(p['heroes']).length} heroes ·{' '}
                  {rows(p['troops']).length} troops
                </Text>
              </View>
            );
          }}
        </Outcome>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  const s = styles(theme);
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Outcome({
  busy,
  result,
  theme,
  children,
}: {
  busy: boolean;
  result: GameResult | undefined;
  theme: ReturnType<typeof useTheme>;
  children: (data: unknown) => React.ReactNode;
}) {
  const s = styles(theme);
  if (busy) return <ActivityIndicator color={theme.primary} style={s.spinner} />;
  if (!result) return <Text style={s.muted}>No request made yet.</Text>;
  if (!result.ok) {
    return (
      <View style={s.errorBox}>
        <Text style={s.bad}>Game service error · {result.status}</Text>
        <Text style={s.muted}>{result.error.slice(0, 400)}</Text>
      </View>
    );
  }
  return (
    <View>
      {children(JSON.parse(result.data))}
      <Text style={s.source}>Fetched {result.fetchedAt}</Text>
    </View>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: t.background },
    content: { padding: 20, paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },
    kicker: { color: t.accent, fontFamily: t.fonts.display, fontSize: 12, letterSpacing: 1 },
    title: { color: t.primary, fontFamily: t.fonts.display, fontSize: 28, marginTop: 6 },
    heading: { color: t.foreground, fontFamily: t.fonts.display, fontSize: 16, marginTop: 28, marginBottom: 10 },
    kv: { marginTop: 18, gap: 4 },
    kvLabel: { color: t.mutedForeground, fontSize: 11, fontFamily: t.fonts.sans },
    ok: { color: t.success, fontFamily: t.fonts.display, fontSize: 14 },
    bad: { color: t.destructive, fontFamily: t.fonts.display, fontSize: 14 },
    muted: { color: t.mutedForeground, fontFamily: t.fonts.sans, fontSize: 12, marginTop: 4 },
    row: { color: t.foreground, fontFamily: t.fonts.sans, fontSize: 13, paddingVertical: 3 },
    source: { color: t.mutedForeground, fontSize: 10, marginTop: 10 },
    errorBox: { borderLeftWidth: 2, borderLeftColor: t.destructive, paddingLeft: 10 },
    spinner: { alignSelf: 'flex-start', marginVertical: 8 },
    strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    thumb: {
      width: 56,
      height: 56,
      backgroundColor: t.muted,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.border,
    },
    formRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      minWidth: 0,
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: t.input,
      color: t.foreground,
      borderRadius: t.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: t.fonts.sans,
    },
    button: {
      backgroundColor: t.primary,
      borderRadius: t.radius.md,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    buttonText: { color: t.primaryForeground, fontFamily: t.fonts.display, fontSize: 14 },
  });
