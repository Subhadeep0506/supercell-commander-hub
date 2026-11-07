import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * `.coc-panel` -- the card that wraps almost every section of the CoC screens.
 *
 * It wears the Clash of Clans gold rim by default, because that is what it
 * overwhelmingly is: twenty of its twenty-three call sites are under
 * `components/coc/`. The other three are the cross-game screens -- Today and
 * the Passport, which belong to no single game -- and they pass `tone="plain"`
 * to keep the neutral border. Defaulting the other way round would have meant
 * threading a prop through twenty files to say the obvious thing.
 *
 * `overflow: hidden` matters: several pieces of fan-kit art are scaled up well
 * past their box (see ART_SCALE) and would otherwise bleed across the layout.
 */
export function Panel({
  children,
  style,
  tone = 'coc',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `plain` keeps the neutral border, for screens that are not one game. */
  tone?: 'coc' | 'plain';
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return <View style={[s.panel, tone === 'coc' && s.panelCoc, style]}>{children}</View>;
}

const build = (t: Theme) =>
  StyleSheet.create({
    /*
      No `t.shadow.panel` any more.

      The soft drop shadow and a 2px rim were two separate claims about the
      same edge, and on the dark scheme the shadow mostly showed up as a smear
      rather than a lift. The rim carries it, and carries the game's colour
      with it.
    */
    panel: {
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: 8,
      padding: 16,
      overflow: 'hidden',
    },
    panelCoc: { borderColor: t.chrome.coc.rim },
  });
