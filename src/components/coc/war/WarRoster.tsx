import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rows, text, type ApiRecord } from '@/api/game-api';
import { memberIndex, memberResult, perMember } from '@/lib/war-detail';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, Stars } from '../CocBits';
import { ClanBadge, StatCell, StatStrip } from '../clan/ClanBits';
import { useDetailSheet } from '../clan/DetailSheetProvider';
import { Hall, pct } from './WarBits';

export function WarRoster({
  war,
  side,
  enemy,
}: {
  war: ApiRecord;
  side: ApiRecord;
  enemy: ApiRecord;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer, openClan } = useDetailSheet();
  const [pending, setPending] = useState(false);

  const per = perMember(war);
  const size = Number(war['teamSize']) || rows(side['members']).length;
  const positions = useMemo(() => memberIndex(enemy), [enemy]);

  const members = useMemo(
    () =>
      [...rows(side['members'])].sort(
        (a, b) => (Number(a['mapPosition']) || 0) - (Number(b['mapPosition']) || 0),
      ),
    [side],
  );
  const yetToAttack = members.filter((m) => rows(m['attacks']).length < per);
  const shown = pending ? yetToAttack : members;

  return (
    <View style={s.stack}>
      <Panel style={s.panel}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${text(side['name'])}`}
          style={s.head}
          onPress={() => openClan(text(side['tag']))}
        >
          <ClanBadge clan={side} size={46} level />
          <View style={s.headText}>
            <Text style={s.name} numberOfLines={1}>
              {text(side['name'])}
            </Text>
            <Text style={s.tag}>{text(side['tag'])}</Text>
          </View>
        </Pressable>

        <StatStrip style={s.strip}>
          <StatCell value={text(side['stars'] ?? 0)} label="War Stars" icon={undefined} glyph="⭐" />
          <StatCell value={pct(side['destructionPercentage'])} label="Destruction" />
          <StatCell value={`${text(side['attacks'] ?? 0)}/${size * per}`} label="Attacks" />
        </StatStrip>

        <View style={s.filters}>
          {[
            { id: false, label: 'All', count: members.length },
            { id: true, label: 'Yet to attack', count: yetToAttack.length },
          ].map((f) => (
            <Pressable
              key={String(f.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: pending === f.id }}
              accessibilityLabel={f.label}
              style={[s.filter, pending === f.id && s.filterOn]}
              onPress={() => setPending(f.id)}
            >
              <Text style={[s.filterText, pending === f.id && s.filterTextOn]}>{f.label}</Text>
              <Text style={s.filterCount}>{f.count}</Text>
            </Pressable>
          ))}
        </View>
      </Panel>

      {shown.map((member, i) => {
        const { made, taken } = memberResult(member);
        return (
          <Pressable
            key={text(member['tag']) + i}
            accessibilityRole="button"
            accessibilityLabel={`View ${text(member['name'])}`}
            style={s.row}
            onPress={() => openPlayer(text(member['tag']))}
          >
            <Text style={s.position}>{text(member['mapPosition'])}</Text>
            <Hall member={member} size={40} />

            <View style={s.rowText}>
              <Text style={s.rowName} numberOfLines={1}>
                {text(member['name'])}
              </Text>
              <View style={s.made}>
                {made.length ? (
                  made.map((a, j) => (
                    <View key={j} style={s.madePill}>
                      <Stars count={a['stars']} size={10} />
                      <Text style={s.madeText}>
                        {pct(a['destructionPercentage'])} → #
                        {text(
                          positions.get(text(a['defenderTag']).toUpperCase())?.['mapPosition'] ??
                            '?',
                        )}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={s.madePill}>
                    <Text style={s.madeText}>-</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={s.defence}>
              <Art name="war" size={14} />
              {taken ? (
                <>
                  <Stars count={taken['stars']} size={11} />
                  <Text style={s.defenceText}>{pct(taken['destructionPercentage'])}</Text>
                </>
              ) : (
                <Text style={s.defenceText}>Not attacked</Text>
              )}
            </View>
          </Pressable>
        );
      })}

      {shown.length === 0 ? <Text style={s.empty}>Everyone has attacked.</Text> : null}
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 8 },
    panel: { padding: 12 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headText: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 17, color: t.foreground },
    tag: { marginTop: 2, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    strip: { marginTop: 12 },

    filters: { flexDirection: 'row', gap: 8, marginTop: 12 },
    filter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
    },
    filterOn: { borderColor: t.primary, backgroundColor: `${t.primary}22` },
    filterText: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    filterTextOn: { color: t.primary },
    filterCount: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: t.card,
    },
    position: { width: 18, textAlign: 'center', fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    made: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
    madePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 3,
      paddingHorizontal: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
    },
    madeText: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    defence: { alignItems: 'flex-end', flexDirection: 'row', gap: 5 },
    defenceText: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    empty: { paddingVertical: 20, textAlign: 'center', fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
