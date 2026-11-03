import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ART_SCALE } from '@/assets/art';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { Meter } from '@/components/ui/Meter';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art } from './CocBits';
import { useDetailSheet } from './clan/DetailSheetProvider';

/** Ported from the `CocWar` component in frontend/src/components/coc-mobile.tsx. */
export function CocWar({ data }: { data: ApiRecord }) {
  const theme = useTheme();
  const { openClan, openPlayer } = useDetailSheet();
  const s = useMemo(() => build(theme), [theme]);

  const clan = record(data['clan']);
  const enemy = record(data['opponent']);
  const size = Number(data['teamSize'] ?? 0);
  const per = Number(data['attacksPerMember'] ?? 2);

  if (data['state'] === 'notInWar') {
    return (
      <Panel>
        <Text style={s.emptyTitle}>No active war</Text>
        <Text style={s.emptyBody}>Your clan is not currently in a regular war.</Text>
      </Panel>
    );
  }

  return (
    <View style={s.stack}>
      <Panel>
        <View style={s.stateRow}>
          <Text style={s.state}>{text(data['state'])}</Text>
          <Text style={s.size}>
            {size} vs {size}
          </Text>
        </View>

        <View style={s.scoreRow}>
          {/* Either side opens its clan profile -- scouting the opponent is
              the main reason to tap a name on this screen. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${text(clan['name'])}`}
            style={s.side}
            onPress={() => openClan(text(clan['tag']))}
          >
            <Art name="war" size={48} scale={ART_SCALE.panelWar} style={s.sideArt} />
            <Text style={s.sideName} numberOfLines={2}>
              {text(clan['name'])}
            </Text>
          </Pressable>
          <View style={s.score}>
            <Text style={s.scoreText}>
              {text(clan['stars'])} <Text style={s.starGlyph}>★</Text> {text(enemy['stars'])}
            </Text>
            <Text style={s.destruction}>
              {text(clan['destructionPercentage'])}% · {text(enemy['destructionPercentage'])}%
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${text(enemy['name'])}`}
            style={s.side}
            onPress={() => openClan(text(enemy['tag']))}
          >
            <Art name="war" size={48} scale={ART_SCALE.panelWar} style={s.sideArt} />
            <Text style={s.sideName} numberOfLines={2}>
              {text(enemy['name'])}
            </Text>
          </Pressable>
        </View>

        <View style={s.attackRow}>
          <View style={s.attackCol}>
            <Meter value={Number(clan['attacks'])} max={size * per} />
            <Text style={s.attackText}>
              {text(clan['attacks'])}/{size * per} attacks
            </Text>
          </View>
          <View style={s.attackCol}>
            <Meter value={Number(enemy['attacks'])} max={size * per} />
            <Text style={[s.attackText, s.attackTextRight]}>
              {text(enemy['attacks'])}/{size * per} attacks
            </Text>
          </View>
        </View>
      </Panel>

      {[clan, enemy].map((side, i) => (
        <Panel key={i}>
          <Text style={s.rosterTitle}>{text(side['name'])} · War roster</Text>
          {rows(side['members'])
            .sort((a, b) => Number(a['mapPosition']) - Number(b['mapPosition']))
            .map((m, j) => (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={`View ${text(m['name'])}`}
                style={[s.memberRow, j > 0 && s.memberDivider]}
                onPress={() => openPlayer(text(m['tag']))}
              >
                <Text style={s.position}>{text(m['mapPosition'])}</Text>
                <View style={s.memberText}>
                  <Text style={s.memberName} numberOfLines={1}>
                    {text(m['name'])}
                  </Text>
                  <Text style={s.memberMeta}>Town Hall {text(m['townhallLevel'])}</Text>
                </View>
                <Text style={s.memberAttacks}>
                  {rows(m['attacks']).length}/{per}
                </Text>
              </Pressable>
            ))}
        </Panel>
      ))}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 16 },
    emptyTitle: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground },
    emptyBody: { marginTop: 8, fontSize: 13, color: t.mutedForeground, fontFamily: t.fonts.sans },

    stateRow: { flexDirection: 'row', justifyContent: 'space-between' },
    state: { fontFamily: t.fonts.display, fontSize: 12, color: t.primary },
    size: { fontSize: 12, color: t.foreground, fontFamily: t.fonts.sans },

    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 24 },
    side: { flex: 1, minWidth: 0, alignItems: 'center' },
    sideArt: { alignSelf: 'center' },
    sideName: { marginTop: 8, textAlign: 'center', fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    score: { alignItems: 'center' },
    scoreText: { fontFamily: t.fonts.display, fontSize: 28, color: t.foreground },
    starGlyph: { color: t.cocHighlight },
    destruction: { marginTop: 8, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    attackRow: { flexDirection: 'row', gap: 12 },
    attackCol: { flex: 1 },
    attackText: { marginTop: 8, fontSize: 12, color: t.foreground, fontFamily: t.fonts.sans },
    attackTextRight: { textAlign: 'right' },

    rosterTitle: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground, marginBottom: 16 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    memberDivider: { borderTopWidth: 1, borderTopColor: t.border },
    position: { width: 36, textAlign: 'center', fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    memberText: { flex: 1, minWidth: 0 },
    memberName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    memberMeta: { marginTop: 2, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    memberAttacks: { fontFamily: t.fonts.display, fontSize: 12, color: t.primary },
  });
