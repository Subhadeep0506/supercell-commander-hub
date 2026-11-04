import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ART_SCALE } from '@/assets/art';
import { BookItemModal } from '@/components/coc/BookItemModal';
import { Art, CocShell } from '@/components/coc/CocBits';
import { BuilderPlanGantt } from '@/components/coc/builder/BuilderPlanGantt';
import { BuildersPanel } from '@/components/coc/builder/BuildersPanel';
import { HallCard } from '@/components/coc/builder/HallCard';
import { ImportVillageSheet } from '@/components/coc/builder/ImportVillageSheet';
import { MaxedByList } from '@/components/coc/builder/MaxedByList';
import { VillageGrid } from '@/components/coc/builder/VillageGrid';
import { BOOK_ITEMS } from '@/lib/clash-book';
import { remainingUpgrades } from '@/lib/village-plan';
import { useHub } from '@/state/HubProvider';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * The Builder Plan, driven entirely by an imported village export.
 *
 * The player API returns no in-progress upgrades, no building levels and no
 * Builder Base troop levels, so none of this can be fetched -- the export is
 * the only source. Until one is pasted in, the screen says so plainly rather
 * than estimating.
 */
export function CocBuilderScreen() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { village, setVillage } = useHub();
  const [tab, setTab] = useState<'home' | 'builder'>('home');
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<{ catalogId: string; level: number }>();

  const side = village ? village[tab] : undefined;
  const remaining = useMemo(() => (side ? remainingUpgrades(side) : []), [side]);
  const item = selected ? BOOK_ITEMS.find((i) => i.id === selected.catalogId) : undefined;

  return (
    <CocShell>
      <View style={s.actions}>
        <Button
          variant="outline"
          size="sm"
          accessibilityLabel="Import village data"
          onPress={() => setImporting(true)}
        >
          {village ? '↻ Re-import' : 'Import village data'}
        </Button>
        {village ? (
          <Button
            variant="outline"
            size="sm"
            accessibilityLabel="Clear village data"
            onPress={() => setVillage(undefined)}
          >
            🗑 Clear
          </Button>
        ) : null}
      </View>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'home', label: 'Home Village' },
          { id: 'builder', label: 'Builder Base' },
        ]}
      />

      {!village || !side || side.hallLevel === 0 ? (
        <Panel style={s.panel}>
          <Art name="builder" size={112} scale={ART_SCALE.panelBuilder} />
          <Text style={s.title}>No village imported</Text>
          <Text style={s.body}>
            {village
              ? 'That export has no Builder Base data.'
              : 'Builder and laboratory timers are not in the player API. Paste your in-game village export to plan upgrades.'}
          </Text>
          <Button
            variant="default"
            accessibilityLabel="Import village data now"
            onPress={() => setImporting(true)}
            style={s.cta}
          >
            Import village data
          </Button>
        </Panel>
      ) : (
        <>
          <HallCard
            side={side}
            remaining={remaining}
            exportedAt={village.exportedAt}
            onUpdate={() => setImporting(true)}
          />
          <BuildersPanel
            side={side}
            onOpenItem={(catalogId, level) => setSelected({ catalogId, level })}
          />
          <BuilderPlanGantt side={side} remaining={remaining} />
          <MaxedByList
            side={side}
            remaining={remaining}
            onOpenItem={(catalogId, level) => setSelected({ catalogId, level })}
          />
          <VillageGrid
            side={side}
            onOpenItem={(catalogId, level) => setSelected({ catalogId, level })}
          />
        </>
      )}

      <ImportVillageSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImported={setVillage}
      />

      {item ? (
        <BookItemModal
          item={item}
          initialLevel={selected?.level || undefined}
          open
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </CocShell>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    actions: { flexDirection: 'row', gap: 8, marginBottom: 4 },
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
    cta: { marginTop: 18 },
  });
