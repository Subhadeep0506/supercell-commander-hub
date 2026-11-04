import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '@/components/ui/Sheet';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CocLayer, CocSheetTitle } from './CocLayers';
import { CrLayer, CrSheetTitle } from './CrLayers';
import type { SheetEntry } from './DetailSheetProvider';

/**
 * The navigable detail sheet: a clan profile, a player profile, or one of the
 * game's sub-views, over whatever screen the user was on.
 *
 * Every entry in the stack stays mounted, with all but the top hidden. The
 * alternative -- rendering only the top -- resets each layer's local state,
 * so stepping from the capital raids page into an attacker's profile and
 * back would lose the selected weekend and every expanded row, which is
 * precisely the journey the stack exists to support.
 *
 * Layers dispatch on `entry.game` first, then `entry.kind`, so one sheet
 * serves both games and the Royale layers inherit the stack, the back arrow
 * and the mounted-but-hidden behaviour for free.
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
      title={top.game === 'cr' ? <CrSheetTitle entry={top} /> : <CocSheetTitle entry={top} />}
      onClose={onClose}
      onBack={stack.length > 1 ? onBack : undefined}
    >
      {stack.map((entry, i) => (
        <Layer key={`${entry.game}-${entry.kind}-${entry.tag}-${i}`} hidden={i !== stack.length - 1}>
          {entry.game === 'cr' ? <CrLayer entry={entry} /> : <CocLayer entry={entry} />}
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

const build = (t: Theme) =>
  StyleSheet.create({
    // Layers stack on top of each other rather than flowing, so the hidden
    // ones take no space and the visible one fills the sheet.
    layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    hidden: { display: 'none' },
    scroll: { flex: 1 },
    // flexGrow lets a short view (an empty state) fill the sheet and centre
    // itself, while a long one still scrolls normally.
    content: { flexGrow: 1, padding: 12, paddingBottom: 32, backgroundColor: t.background },
  });
