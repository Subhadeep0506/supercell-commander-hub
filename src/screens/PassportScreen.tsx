import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageTitle } from '@/components/PageTitle';
import { CocLookup } from '@/components/coc/CocLookup';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { noFocusRing } from '@/components/ui/noFocusRing';
import { useHub, type Passport } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** Supercell tags use a restricted alphabet; same test as the reference. */
const valid = (t: string) => /^#[0289PYLQGRJCUV]{3,12}$/.test(t);

type Status = { kind: 'ok' | 'error'; message: string } | undefined;

/**
 * Ported from frontend/src/routes/passport.tsx.
 *
 * All three tags are saveable, as in the reference. Only the Clash of Clans
 * live-lookup section is rendered -- the Royale and Brawl sections arrive with
 * their screens.
 *
 * The reference raises a sonner toast on save; this shows an inline status
 * line instead, since the project has no toast layer and a modal Alert would
 * be heavier than the interaction warrants.
 */
export function PassportScreen() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { passport, setPassport, ready } = useHub();
  const [draft, setDraft] = useState(passport);
  const [status, setStatus] = useState<Status>();

  // The passport is read from storage asynchronously, so the first render
  // sees the empty default. Copy it into the form once it arrives -- guarded
  // by a ref so a later passport change never clobbers what is being typed.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!ready || hydrated.current) return;
    hydrated.current = true;
    setDraft(passport);
  }, [ready, passport]);

  const field = (key: keyof Passport, label: string) => {
    const invalid = key !== 'name' && Boolean(draft[key]) && !valid(draft[key]);
    return (
      <View style={s.field}>
        <Text style={s.label}>{label}</Text>
        <TextInput
          style={[s.input, invalid && s.inputInvalid]}
          value={draft[key]}
          accessibilityLabel={label}
          autoCapitalize={key === 'name' ? 'words' : 'characters'}
          autoCorrect={false}
          placeholderTextColor={theme.mutedForeground}
          placeholder={key === 'name' ? 'Guest Chief' : '#XXXXXX'}
          onChangeText={(v) =>
            setDraft({ ...draft, [key]: key === 'name' ? v : v.toUpperCase() })
          }
        />
      </View>
    );
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <PageTitle kicker="One identity · three games" title="Supercell Passport">
        Tags use the characters 0289PYLQGRJCUV and start with #.
      </PageTitle>

      <Panel style={s.card}>
        {field('name', 'Display name')}
        {field('coc', 'Clash of Clans tag')}
        {field('cr', 'Clash Royale tag')}
        {field('bs', 'Brawl Stars tag')}
        <Button
          onPress={() => {
            if (![draft.coc, draft.cr, draft.bs].every((tag) => !tag || valid(tag))) {
              setStatus({ kind: 'error', message: "One of the tags isn't valid" });
              return;
            }
            setPassport(draft);
            setStatus({ kind: 'ok', message: 'Passport saved!' });
          }}
        >
          Save Passport
        </Button>
        {status ? (
          <Text
            accessibilityRole="alert"
            style={[s.status, status.kind === 'ok' ? s.statusOk : s.statusError]}
          >
            {status.message}
          </Text>
        ) : null}
      </Panel>

      <Text style={s.note}>
        Saved on this device only. Tags are not verified account ownership.
      </Text>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Clash of Clans</Text>
        <CocLookup />
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Clash Royale · Brawl Stars</Text>
        <Text style={s.sectionBody}>
          Their tags save here now, but the live lookups arrive with the Royale and Brawl screens.
        </Text>
      </View>
    </ScrollView>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingTop: 16,
      paddingBottom: 120,
    },
    card: { gap: 12 },
    field: { gap: 4 },
    label: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    input: {
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: t.input,
      color: t.foreground,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: t.fonts.sans,
      fontSize: 14,
      ...noFocusRing,
    },
    inputInvalid: { borderColor: t.destructive },
    status: { fontFamily: t.fonts.display, fontSize: 13 },
    statusOk: { color: t.success },
    statusError: { color: t.destructive },
    note: { marginTop: 16, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    section: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: t.border },
    sectionTitle: { marginBottom: 16, fontFamily: t.fonts.display, fontSize: 20, color: t.primary },
    sectionBody: { fontSize: 13, lineHeight: 19, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
