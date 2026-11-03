import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { attacksPerMember, positionIndex, warSides } from '@/lib/cwl';
import { Meter } from '@/components/ui/Meter';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Stars } from '../CocBits';
import { ClanBadge } from '../clan/ClanBits';
import { useDetailSheet } from '../clan/DetailSheetProvider';
import { Hall, ScoreLine, StateChip, WarClock, pct } from './WarBits';

/**
 * One war, in full: the scoreboard and both rosters with every attack.
 *
 * Shared by the Current War tab and the war league sheet, which differ only in
 * where the response came from. `attacksPerMember` is read off the war rather
 * than assumed, because a league war allows one attack and a regular war two.
 *
 * `clanTag` orients the board so your own clan is on the left; without it the
 * response's own `clan` leads, which is what a scouted war should do.
 */
export function WarBoard({ war, clanTag }: { war: ApiRecord; clanTag?: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan } = useDetailSheet();

  const { us, them } = warSides(war, clanTag);
  const size = Number(war['teamSize']) || rows(us['members']).length;
  const per = attacksPerMember(war);
  const total = size * per;

  return (
    <View style={s.stack}>
      <Panel>
        <View style={s.head}>
          <StateChip state={text(war['state'])} />
          <WarClock war={war} />
          <Text style={s.size}>
            {size} vs {size}
          </Text>
        </View>

        <View style={s.scoreRow}>
          <Side army={us} onPress={() => openClan(text(us['tag']))} />
          <ScoreLine us={us} them={them} />
          <Side army={them} onPress={() => openClan(text(them['tag']))} />
        </View>

        <View style={s.attackRow}>
          {[us, them].map((army, i) => (
            <View key={i} style={s.attackCol}>
              <Meter value={Number(army['attacks']) || 0} max={total} />
              <Text style={[s.attackText, i === 1 && s.attackTextRight]}>
                {text(army['attacks'] ?? 0)}/{total} attacks
              </Text>
            </View>
          ))}
        </View>
      </Panel>

      <Roster side={us} enemy={them} per={per} total={total} />
      <Roster side={them} enemy={us} per={per} total={total} />
    </View>
  );
}

/** One clan at its end of the scoreboard; tapping it opens that clan. */
function Side({ army, onPress }: { army: ApiRecord; onPress: () => void }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${text(army['name'])}`}
      style={s.side}
      onPress={onPress}
    >
      <ClanBadge clan={army} size={52} level />
      <Text style={s.sideName} numberOfLines={2}>
        {text(army['name'])}
      </Text>
    </Pressable>
  );
}

/**
 * One clan's war roster.
 *
 * Ordered by map position, which is the order the base layout is in. Each row
 * carries that member's own attacks -- stars, destruction and the position
 * they hit -- and the best attack taken against them, which is the only
 * defence figure the API reports.
 */
function Roster({
  side,
  enemy,
  per,
  total,
}: {
  side: ApiRecord;
  enemy: ApiRecord;
  per: number;
  total: number;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const positions = useMemo(() => positionIndex(enemy), [enemy]);

  const members = useMemo(
    () =>
      [...rows(side['members'])].sort(
        (a, b) => (Number(a['mapPosition']) || 0) - (Number(b['mapPosition']) || 0),
      ),
    [side],
  );

  if (!members.length) {
    return (
      <Panel>
        <Text style={s.rosterTitle}>{text(side['name'])} · War roster</Text>
        <Text style={s.empty}>
          The roster is not published until war day. Nothing came back for this clan yet.
        </Text>
      </Panel>
    );
  }

  return (
    <Panel>
      <View style={s.rosterHead}>
        <Text style={s.rosterTitle} numberOfLines={1}>
          {text(side['name'])} · War roster
        </Text>
        <Text style={s.rosterCount}>
          {text(side['attacks'] ?? 0)}/{total}
        </Text>
      </View>

      {members.map((member, i) => {
        const attacks = rows(member['attacks']);
        const defence = record(member['bestOpponentAttack']);
        return (
          <Pressable
            key={text(member['tag']) + i}
            accessibilityRole="button"
            accessibilityLabel={`View ${text(member['name'])}`}
            style={[s.row, i > 0 && s.rowDivider]}
            onPress={() => openPlayer(text(member['tag']))}
          >
            <Text style={s.position}>{text(member['mapPosition'])}</Text>
            <Hall member={member} size={38} />

            <View style={s.rowText}>
              <Text style={s.name} numberOfLines={1}>
                {text(member['name'])}
              </Text>

              {attacks.length ? (
                attacks.map((attack, j) => (
                  <View key={j} style={s.attackLine}>
                    <Stars count={attack['stars']} size={11} />
                    <Text style={s.attackMeta}>
                      {pct(attack['destructionPercentage'])}
                      {positions.get(text(attack['defenderTag']).toUpperCase())
                        ? ` → #${positions.get(text(attack['defenderTag']).toUpperCase())}`
                        : ''}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={s.none}>No attacks used</Text>
              )}

              <Text style={s.defence}>
                {defence['stars'] === undefined
                  ? 'Not attacked'
                  : `Defended · ${text(defence['stars'])}★ ${pct(defence['destructionPercentage'])}`}
              </Text>
            </View>

            <Text style={s.used}>
              {attacks.length}/{per}
            </Text>
          </Pressable>
        );
      })}
    </Panel>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 16 },

    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    size: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },

    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 20 },
    // flex with an explicit minWidth: under Yoga `flex: 1` sets flexBasis to
    // 0, so without this a long clan name squeezes the centre score instead
    // of wrapping.
    side: { flex: 1, minWidth: 0, alignItems: 'center' },
    sideName: {
      marginTop: 8,
      textAlign: 'center',
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: t.foreground,
    },

    attackRow: { flexDirection: 'row', gap: 12 },
    attackCol: { flex: 1, minWidth: 0 },
    attackText: { marginTop: 8, fontSize: 11, color: t.foreground, fontFamily: t.fonts.sans },
    attackTextRight: { textAlign: 'right' },

    rosterHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    rosterTitle: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 15, color: t.foreground },
    rosterCount: { fontFamily: t.fonts.display, fontSize: 12, color: t.primary },

    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
    position: { width: 24, textAlign: 'center', fontFamily: t.fonts.display, fontSize: 12, color: t.mutedForeground },
    rowText: { flex: 1, minWidth: 0 },
    name: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    attackLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    attackMeta: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    none: { marginTop: 4, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    defence: { marginTop: 3, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    used: { fontFamily: t.fonts.display, fontSize: 12, color: t.primary },

    empty: { marginTop: 8, fontSize: 12, lineHeight: 18, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
