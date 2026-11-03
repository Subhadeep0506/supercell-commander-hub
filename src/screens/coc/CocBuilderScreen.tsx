import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ART_SCALE } from '@/assets/art';
import { Art, CocShell } from '@/components/coc/CocBits';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Ported from frontend/src/routes/coc_.builder.tsx.
 *
 * Deliberately empty of data: the player API returns no in-progress upgrades,
 * so the screen states that plainly rather than estimating timers.
 */
export function CocBuilderScreen() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [village, setVillage] = useState<'home' | 'builder'>('home');

  return (
    <CocShell title="Builder Plan">
      <Tabs
        value={village}
        onChange={setVillage}
        tabs={[
          { id: 'home', label: 'Home Village' },
          { id: 'builder', label: 'Builder Base' },
        ]}
      />
      <Panel style={s.panel}>
        <Art name="builder" size={112} scale={ART_SCALE.panelBuilder} />
        <Text style={s.title}>No upgrades imported</Text>
        <Text style={s.body}>
          {village === 'home' ? 'Home Village' : 'Builder Base'} builder and laboratory timers
          require a fresh village export. The player API does not return ongoing upgrades.
        </Text>
      </Panel>
      <View style={s.schedule}>
        <Text style={s.scheduleTitle}>Builder schedule</Text>
        <Text style={s.scheduleBody}>No schedule available.</Text>
      </View>
    </CocShell>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    panel: { alignItems: 'center' },
    title: { marginTop: 16, fontFamily: t.fonts.display, fontSize: 20, color: t.foreground },
    body: {
      marginTop: 12,
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 20,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
    },
    schedule: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: t.border },
    scheduleTitle: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    scheduleBody: { marginTop: 12, fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
