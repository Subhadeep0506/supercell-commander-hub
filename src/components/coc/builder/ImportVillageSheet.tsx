import { useMemo, useState } from 'react';
import { Clipboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseVillageExport, VillageExportError, type VillageImport } from '@/lib/village-export';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** Verbatim from the game's own menu, so it can be followed without guessing. */
const STEPS = [
  'Tap on your profile, top left',
  'Open the Settings tab',
  'Tap More Settings',
  'Scroll to the bottom',
  'Tap Export Json data',
];

/**
 * Pastes a village export in.
 *
 * `Clipboard` comes from react-native core. It is deprecated in favour of
 * @react-native-clipboard/clipboard, but that is a native module -- a new
 * autolinking surface and another way for the APK build to break -- and the
 * core one still works on both Android and react-native-web. The deprecation
 * warning in dev is the accepted cost.
 */
export function ImportVillageSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (village: VillageImport) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function accept(raw: string) {
    try {
      const village = parseVillageExport(raw);
      setError(undefined);
      setText('');
      onImported(village);
      onClose();
    } catch (e) {
      // A bad paste is the normal case here, not an exception -- the message
      // is written to be read by the player.
      setError(e instanceof VillageExportError ? e.message : 'That could not be imported.');
    }
  }

  async function fromClipboard() {
    setBusy(true);
    try {
      const raw = await Clipboard.getString();
      if (!raw?.trim()) {
        setError('The clipboard is empty. Copy the export from the game first.');
        return;
      }
      accept(raw);
    } catch {
      setError('Could not read the clipboard. Paste the JSON into the box below instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Import village data">
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.lead}>
          The game can export your whole village as JSON. It is the only source for upgrade
          timers and Builder Base levels -- the API returns neither.
        </Text>

        <View style={s.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={s.step}>
              <Text style={s.stepNumber}>{i + 1}</Text>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <Button
          variant="default"
          disabled={busy}
          accessibilityLabel="Paste and Import Data"
          onPress={() => void fromClipboard()}
          style={s.paste}
        >
          {busy ? 'Reading clipboard…' : 'Paste and Import Data'}
        </Button>

        <Text style={s.or}>or paste it here</Text>

        <TextInput
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (error) setError(undefined);
          }}
          accessibilityLabel="Village export JSON"
          placeholder='{"tag":"#XXXX","timestamp":…}'
          placeholderTextColor={theme.mutedForeground}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={s.input}
        />

        <Button
          variant="outline"
          disabled={!text.trim()}
          accessibilityLabel="Import pasted data"
          onPress={() => accept(text)}
        >
          Import
        </Button>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Text style={s.note}>
          Nothing leaves the phone -- the JSON is parsed here and kept on this device.
        </Text>
      </ScrollView>
    </Sheet>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { padding: 14, gap: 14 },
    lead: { fontSize: 12, lineHeight: 19, color: t.foreground, fontFamily: t.fonts.sans },
    steps: { gap: 8, padding: 12, backgroundColor: t.muted, borderRadius: 6 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepNumber: {
      width: 20,
      height: 20,
      textAlign: 'center',
      lineHeight: 20,
      borderRadius: 999,
      backgroundColor: t.primary,
      color: t.primaryForeground,
      fontFamily: t.fonts.display,
      fontSize: 11,
      flexShrink: 0,
    },
    stepText: { flexShrink: 1, fontSize: 12, color: t.foreground, fontFamily: t.fonts.sans },
    paste: { marginTop: 2 },
    or: { textAlign: 'center', fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    input: {
      minHeight: 110,
      padding: 10,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      backgroundColor: t.muted,
      color: t.foreground,
      fontFamily: t.fonts.sans,
      fontSize: 11,
    },
    error: { fontSize: 12, lineHeight: 18, color: t.destructive, fontFamily: t.fonts.sans },
    note: { fontSize: 10, lineHeight: 16, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
