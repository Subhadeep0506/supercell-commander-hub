import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageTitle } from '@/components/PageTitle';
import { DeleteConfirm, PassportList } from '@/components/PassportList';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Sheet } from '@/components/ui/Sheet';
import { noFocusRing } from '@/components/ui/noFocusRing';
import { useHub, type Passport } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** Supercell tags use a restricted alphabet; same test as the reference. */
const valid = (t: string) => /^#[0289PYLQGRJCUV]{3,12}$/.test(t);

type Draft = Omit<Passport, 'id'>;
const EMPTY: Draft = { name: '', coc: '', cr: '', bs: '' };

type Status = { kind: 'ok' | 'error'; message: string } | undefined;

/**
 * The passport manager.
 *
 * One identity used to live here -- a form that overwrote itself. A player
 * routinely has more than one Clash of Clans or Clash Royale account, so this
 * keeps a list: the form adds to it, the rows below show what each resolves to
 * live, and the tick chooses which one every game screen reads from.
 *
 * That is also why the game screens lost their "Saved account · Change ·
 * Refresh" rows. An inline field could only ever overwrite one record, which
 * is exactly the behaviour having several is meant to replace.
 */
export function PassportScreen() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { savePassport, updatePassport, deletePassport } = useHub();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [status, setStatus] = useState<Status>();
  const [editing, setEditing] = useState<Passport | undefined>();
  const [deleting, setDeleting] = useState<Passport | undefined>();

  /** The tags only; a blank one is "not played", not an error. */
  const badTags = (d: Draft) => [d.coc, d.cr, d.bs].some((tag) => tag && !valid(tag));

  const save = () => {
    if (!draft.name.trim()) {
      setStatus({ kind: 'error', message: 'Give the passport a display name.' });
      return;
    }
    if (badTags(draft)) {
      setStatus({ kind: 'error', message: "One of the tags isn't valid" });
      return;
    }
    if (!draft.coc && !draft.cr && !draft.bs) {
      setStatus({ kind: 'error', message: 'Add at least one game tag.' });
      return;
    }
    const { replaced } = savePassport(draft);
    setDraft(EMPTY);
    setStatus({
      kind: 'ok',
      // Saving over a name is a correction often enough to be the default, but
      // silently replacing someone's tags would be the wrong kind of quiet.
      message: replaced ? 'Passport updated!' : 'Passport saved!',
    });
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <PageTitle kicker="One identity · three games" title="Supercell Passport">
        Keep a passport per account and switch with the tick. Tags use the characters
        0289PYLQGRJCUV and start with #.
      </PageTitle>

      <Panel style={s.card}>
        <Fields draft={draft} onChange={setDraft} s={s} theme={theme} />
        <Button onPress={save}>Save Passport</Button>
        {status ? (
          <Text
            accessibilityRole="alert"
            style={[s.status, status.kind === 'ok' ? s.statusOk : s.statusError]}
          >
            {status.message}
          </Text>
        ) : null}
        <Text style={s.hint}>
          Saving with a display name already in the list updates that passport instead of adding a
          second one.
        </Text>
      </Panel>

      <Text style={s.sectionTitle}>Saved passports</Text>
      <PassportList onEdit={setEditing} onDelete={setDeleting} />

      <Text style={s.note}>
        Saved on this device only. Tags are not verified account ownership.
      </Text>

      <Sheet
        open={Boolean(editing)}
        variant="plain"
        title="Edit passport"
        onClose={() => setEditing(undefined)}
      >
        {editing ? (
          <EditSheet
            entry={editing}
            onCancel={() => setEditing(undefined)}
            onSave={(next) => {
              updatePassport(editing.id, next);
              setEditing(undefined);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(deleting)}
        variant="plain"
        title="Delete passport"
        onClose={() => setDeleting(undefined)}
      >
        {deleting ? (
          <DeleteConfirm
            entry={deleting}
            onCancel={() => setDeleting(undefined)}
            onConfirm={() => {
              deletePassport(deleting.id);
              setDeleting(undefined);
            }}
          />
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

/** The same four fields in the add form and the edit sheet. */
function Fields({
  draft,
  onChange,
  s,
  theme,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  s: ReturnType<typeof build>;
  theme: Theme;
}) {
  const field = (key: keyof Draft, label: string) => {
    const invalid = key !== 'name' && Boolean(draft[key]) && !valid(draft[key]);
    return (
      <View style={s.field} key={key}>
        <Text style={s.label}>{label}</Text>
        <TextInput
          style={[s.input, invalid && s.inputInvalid]}
          value={draft[key]}
          accessibilityLabel={label}
          autoCapitalize={key === 'name' ? 'words' : 'characters'}
          autoCorrect={false}
          placeholderTextColor={theme.mutedForeground}
          placeholder={key === 'name' ? 'Main account' : '#XXXXXX'}
          onChangeText={(v) => onChange({ ...draft, [key]: key === 'name' ? v : v.toUpperCase() })}
        />
      </View>
    );
  };

  return (
    <>
      {field('name', 'Display name')}
      {field('coc', 'Clash of Clans tag')}
      {field('cr', 'Clash Royale tag')}
      {field('bs', 'Brawl Stars tag')}
    </>
  );
}

/**
 * Editing an existing passport.
 *
 * All four fields, not just the name: the tags are the part that gets typed
 * wrong, and deleting a whole passport to correct one character is not a fix.
 */
function EditSheet({
  entry,
  onCancel,
  onSave,
}: {
  entry: Passport;
  onCancel: () => void;
  onSave: (next: Draft) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [draft, setDraft] = useState<Draft>({
    name: entry.name,
    coc: entry.coc,
    cr: entry.cr,
    bs: entry.bs,
  });
  const [error, setError] = useState('');

  return (
    <ScrollView contentContainerStyle={s.sheet} keyboardShouldPersistTaps="handled">
      <Fields draft={draft} onChange={setDraft} s={s} theme={theme} />
      {error ? (
        <Text accessibilityRole="alert" style={[s.status, s.statusError]}>
          {error}
        </Text>
      ) : null}
      <View style={s.sheetBtns}>
        <Button
          accessibilityLabel="Save changes"
          onPress={() => {
            if (!draft.name.trim()) return setError('Give the passport a display name.');
            if ([draft.coc, draft.cr, draft.bs].some((tag) => tag && !valid(tag))) {
              return setError("One of the tags isn't valid");
            }
            onSave(draft);
          }}
        >
          Save changes
        </Button>
        <Button variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
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
    hint: { fontFamily: t.fonts.sans, fontSize: 11, lineHeight: 17, color: t.mutedForeground },
    sectionTitle: {
      marginTop: 28,
      marginBottom: 12,
      fontFamily: t.fonts.display,
      fontSize: 20,
      color: t.primary,
    },
    note: { marginTop: 20, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    sheet: { padding: 14, paddingBottom: 32, gap: 12 },
    sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  });
