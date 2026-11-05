import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { record, text, type ApiRecord } from '@/api/game-api';
import { groupedNumber } from '@/lib/clan';
import { flagEmoji } from '@/lib/rankings';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ClanBadge } from './ClanBits';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';

/**
 * A clan reduced to one row, opening the full profile sheet when tapped.
 *
 * The Clan screen uses this for the clan resolved from the saved passport, so
 * landing on that tab still shows whose clan it is without forcing a modal
 * open the moment the screen appears.
 */
export function ClanCard({ clan }: { clan: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();
  const location = record(clan['location']);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${text(clan['name'])}`}
      onPress={() => openClan(text(clan['tag']), 'coc')}
    >
      <Panel style={s.card}>
        <ClanBadge clan={clan} size={56} level />
        <View style={s.textCell}>
          <Text style={s.name} numberOfLines={1}>
            {text(clan['name'])}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {text(clan['tag'])} · {flagEmoji(location['countryCode']) ?? '🌐'}{' '}
            {text(location['name'] ?? 'International')}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            🏆 {groupedNumber(clan['clanPoints'])} · {text(clan['members'])}/50 members
          </Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </Panel>
    </Pressable>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    textCell: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    meta: { marginTop: 4, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    chevron: { fontSize: 20, color: t.primary },
  });
