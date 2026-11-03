import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { text, type ApiRecord } from '@/api/game-api';
import { warSides } from '@/lib/cwl';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ClanBadge } from '../clan/ClanBits';
import { WarEvents } from './WarEvents';
import { WarRoster } from './WarRoster';
import { WarSummary } from './WarSummary';

type View_ = 'summary' | 'events' | 'us' | 'them';

/** One war in full. Shared by the Current War tab and every league round. */
export function WarDetail({ war, clanTag }: { war: ApiRecord; clanTag?: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [view, setView] = useState<View_>('summary');
  const { us, them } = warSides(war, clanTag);

  const tabs: { id: View_; label: string; clan?: ApiRecord }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'events', label: 'War Events' },
    { id: 'us', label: text(us['name']), clan: us },
    { id: 'them', label: text(them['name']), clan: them },
  ];

  return (
    <View style={s.stack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === tab.id }}
            accessibilityLabel={tab.label}
            style={[s.tab, view === tab.id && s.tabOn]}
            onPress={() => setView(tab.id)}
          >
            {tab.clan ? <ClanBadge clan={tab.clan} size={18} /> : null}
            <Text style={[s.tabText, view === tab.id && s.tabTextOn]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {view === 'summary' ? (
        <WarSummary war={war} clanTag={clanTag} />
      ) : view === 'events' ? (
        <WarEvents war={war} clanTag={clanTag} />
      ) : view === 'us' ? (
        <WarRoster war={war} side={us} enemy={them} />
      ) : (
        <WarRoster war={war} side={them} enemy={us} />
      )}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 14 },
    bar: { gap: 4, padding: 4, backgroundColor: t.muted, borderRadius: 999 },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 999,
      maxWidth: 190,
    },
    tabOn: { backgroundColor: t.card },
    tabText: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    tabTextOn: { color: t.primary },
  });
