import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rows, text, type ApiRecord } from '@/api/game-api';
import { warSides } from '@/lib/cwl';
import {
  attackCount,
  avgDestruction,
  avgStars,
  perMember,
  starHistogram,
  stillToAttack,
} from '@/lib/war-detail';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Stars } from '../CocBits';
import { ClanBadge } from '../clan/ClanBits';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { Hall, Scoreboard } from './WarBits';

export function WarSummary({ war, clanTag }: { war: ApiRecord; clanTag?: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { us, them } = warSides(war, clanTag);
  const per = perMember(war);

  return (
    <View style={s.stack}>
      <Scoreboard war={war} clanTag={clanTag} />

      <Panel style={s.panel}>
        <Text style={s.title}>Still to attack</Text>
        {[us, them].map((side, i) => (
          <Pending key={i} side={side} per={per} own={i === 0} />
        ))}
      </Panel>

      <Panel style={s.panel}>
        <Text style={s.title}>Attacks</Text>
        <AttackBar side={us} war={war} tone={theme.success} />
        <AttackBar side={them} war={war} tone={theme.destructive} />
        <Histogram us={us} them={them} />
      </Panel>

      <Panel style={s.panel}>
        <Text style={s.title}>Head to head</Text>
        <Compare label="Avg. stars" a={avgStars(us)} b={avgStars(them)} format={(n) => n.toFixed(1)} />
        <Compare
          label="Avg. destruction"
          a={avgDestruction(us)}
          b={avgDestruction(them)}
          format={(n) => `${n.toFixed(1)}%`}
        />
        <Compare
          label="Three stars"
          a={starHistogram(us)[3] ?? 0}
          b={starHistogram(them)[3] ?? 0}
          format={(n) => String(n)}
        />
      </Panel>
    </View>
  );
}

function Pending({ side, per, own }: { side: ApiRecord; per: number; own: boolean }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer, openClan } = useDetailSheet();
  const { pending, left } = stillToAttack(side, per);
  const [all, setAll] = useState(false);
  const CAP = 8;
  const visible = all ? pending : pending.slice(0, CAP);
  const hidden = pending.length - visible.length;

  return (
    <View style={s.pending}>
      <View style={s.pendingHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${text(side['name'])}`}
          style={s.pendingClan}
          onPress={() => openClan(text(side['tag']))}
        >
          <ClanBadge clan={side} size={22} />
          <Text style={s.pendingName} numberOfLines={1}>
            {text(side['name'])}
          </Text>
        </Pressable>
        <Text style={[s.pendingLeft, own ? s.leftOwn : s.leftEnemy]}>
          {left} {left === 1 ? 'attack' : 'attacks'} left
        </Text>
      </View>

      {pending.length ? (
        <View style={s.chips}>
          {visible.map((m, i) => (
            <Pressable
              key={text(m['tag']) + i}
              accessibilityRole="button"
              accessibilityLabel={`View ${text(m['name'])}`}
              style={s.chip}
              onPress={() => openPlayer(text(m['tag']))}
            >
              <Hall member={m} size={20} />
              <Text style={s.chipText} numberOfLines={1}>
                {text(m['mapPosition'])}. {text(m['name'])}
              </Text>
            </Pressable>
          ))}
          {hidden > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${hidden} more`}
              style={s.chip}
              onPress={() => setAll(true)}
            >
              <Text style={s.chipText}>+{hidden}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={s.allIn}>Every attack used.</Text>
      )}
    </View>
  );
}

function AttackBar({ side, war, tone }: { side: ApiRecord; war: ApiRecord; tone: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const size = Number(war['teamSize']) || rows(side['members']).length;
  const total = size * perMember(war);
  const used = attackCount(side);
  return (
    <View style={s.barRow}>
      <ClanBadge clan={side} size={20} />
      <View style={s.barTrack}>
        <View
          style={[s.barFill, { backgroundColor: tone, width: `${total ? (used / total) * 100 : 0}%` }]}
        />
      </View>
      <Text style={s.barText}>
        {used}/{total}
      </Text>
    </View>
  );
}

function Histogram({ us, them }: { us: ApiRecord; them: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const a = starHistogram(us);
  const b = starHistogram(them);
  const peak = Math.max(1, ...a, ...b);

  return (
    <View style={s.histogram}>
      {[3, 2, 1, 0].map((stars) => (
        <View key={stars} style={s.histRow}>
          <Text style={s.histCount}>{a[stars]}</Text>
          <View style={s.histTrackLeft}>
            <View
              style={[s.histFill, s.histFillUs, { width: `${((a[stars] ?? 0) / peak) * 100}%` }]}
            />
          </View>
          <Stars count={stars} size={12} />
          <View style={s.histTrackRight}>
            <View
              style={[s.histFill, s.histFillThem, { width: `${((b[stars] ?? 0) / peak) * 100}%` }]}
            />
          </View>
          <Text style={[s.histCount, s.histCountRight]}>{b[stars]}</Text>
        </View>
      ))}
    </View>
  );
}

function Compare({
  label,
  a,
  b,
  format,
}: {
  label: string;
  a: number;
  b: number;
  format: (n: number) => string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const total = a + b;
  return (
    <View style={s.compare}>
      <View style={s.compareHead}>
        <Text style={[s.compareValue, a >= b && s.compareLead]}>{format(a)}</Text>
        <Text style={s.compareLabel}>{label}</Text>
        <Text style={[s.compareValue, b >= a && s.compareLead]}>{format(b)}</Text>
      </View>
      <View style={s.compareTrack}>
        <View style={[s.compareSeg, s.compareUs, { flexGrow: total ? a : 1 }]} />
        <View style={[s.compareSeg, s.compareThem, { flexGrow: total ? b : 1 }]} />
      </View>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 14 },
    panel: { padding: 12 },
    title: { fontFamily: t.fonts.display, fontSize: 15, color: t.foreground, marginBottom: 10 },

    pending: { marginBottom: 12 },
    pendingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pendingClan: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, minWidth: 0 },
    pendingName: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    pendingLeft: { fontFamily: t.fonts.display, fontSize: 12 },
    leftOwn: { color: t.success },
    leftEnemy: { color: t.destructive },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: t.muted,
      maxWidth: '100%',
    },
    chipText: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    allIn: { marginTop: 8, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    barTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: t.muted, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 999 },
    barText: { width: 48, textAlign: 'right', fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },

    histogram: { marginTop: 6, gap: 6 },
    histRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    histCount: { width: 22, textAlign: 'left', fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    histCountRight: { textAlign: 'right' },
    histTrackLeft: { flex: 1, height: 6, borderRadius: 999, backgroundColor: t.muted, flexDirection: 'row', justifyContent: 'flex-end', overflow: 'hidden' },
    histTrackRight: { flex: 1, height: 6, borderRadius: 999, backgroundColor: t.muted, overflow: 'hidden' },
    histFill: { height: '100%' },
    histFillUs: { backgroundColor: t.success },
    histFillThem: { backgroundColor: t.destructive },

    compare: { marginBottom: 12 },
    compareHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    compareValue: { fontFamily: t.fonts.display, fontSize: 14, color: t.mutedForeground },
    compareLead: { color: t.foreground },
    compareLabel: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    compareTrack: { flexDirection: 'row', height: 6, marginTop: 6, borderRadius: 999, backgroundColor: t.muted, overflow: 'hidden' },
    compareSeg: { flexBasis: 0, minWidth: 2 },
    compareUs: { backgroundColor: t.success },
    compareThem: { backgroundColor: t.destructive },
  });
