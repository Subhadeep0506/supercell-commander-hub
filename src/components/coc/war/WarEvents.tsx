import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { text, type ApiRecord } from '@/api/game-api';
import { parseApiTime } from '@/lib/clan';
import { warSides } from '@/lib/cwl';
import { clockDuration, warEvents, type AttackEvent } from '@/lib/war-detail';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDuration } from '@/lib/clan';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Stars } from '../CocBits';
import { ClanBadge } from '../clan/ClanBits';
import { useDetailSheet } from '../clan/DetailSheetProvider';
import { Hall } from './WarBits';

type Filter = 'all' | 'us' | 'them' | 'three';

export function WarEvents({ war, clanTag }: { war: ApiRecord; clanTag?: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openPlayer } = useDetailSheet();
  const [filter, setFilter] = useState<Filter>('all');

  const { us, them } = warSides(war, clanTag);
  const events = useMemo(() => warEvents(war, clanTag), [war, clanTag]);

  const live = war['state'] === 'inWar';
  const target = parseApiTime(live ? war['endTime'] : war['startTime']);
  const remaining = useCountdown(live ? target : undefined);

  const counts = {
    all: events.length,
    us: events.filter((e) => e.side === 'us').length,
    them: events.filter((e) => e.side === 'them').length,
    three: events.filter((e) => e.stars === 3).length,
  };
  const shown = events.filter((e) =>
    filter === 'all' ? true : filter === 'three' ? e.stars === 3 : e.side === filter,
  );

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'us', label: text(us['name']) },
    { id: 'them', label: text(them['name']) },
    { id: 'three', label: 'Three ★' },
  ];

  return (
    <View style={s.stack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {chips.map((chip) => (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === chip.id }}
            accessibilityLabel={`Filter ${chip.label}`}
            style={[s.chip, filter === chip.id && s.chipOn]}
            onPress={() => setFilter(chip.id)}
          >
            {chip.id === 'us' || chip.id === 'them' ? (
              <ClanBadge clan={chip.id === 'us' ? us : them} size={18} />
            ) : null}
            <Text style={[s.chipText, filter === chip.id && s.chipTextOn]} numberOfLines={1}>
              {chip.label}
            </Text>
            <Text style={s.chipCount}>{counts[chip.id]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={s.timeline}>
        <View style={s.rail} />

        <View style={s.node}>
          <View style={[s.dot, live ? s.dotLive : s.dotIdle]} />
          <Text style={s.nodeLabel}>
            {live ? 'Live' : war['state'] === 'preparation' ? 'Preparation' : 'War ended'}
            {live && remaining > 0 ? `  ${formatDuration(remaining)}` : ''}
          </Text>
        </View>

        {shown.map((event, i) => (
          <Row key={`${event.order}-${i}`} event={event} onOpen={openPlayer} />
        ))}

        {shown.length === 0 ? (
          <Text style={s.empty}>
            {events.length ? 'No attacks match that filter.' : 'No attacks yet.'}
          </Text>
        ) : null}

        <View style={s.node}>
          <View style={[s.dot, s.dotStart]} />
          <Text style={s.nodeLabel}>
            {war['state'] === 'preparation' ? 'Preparation day' : 'War has begun!'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Row({ event, onOpen }: { event: AttackEvent; onOpen: (tag: string) => void }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const ours = event.side === 'us';
  return (
    <View style={s.node}>
      <View style={[s.dot, ours ? s.dotUs : s.dotThem]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Attack by ${text(event.attacker['name'])}`}
        style={s.card}
        onPress={() => onOpen(text(event.attacker['tag']))}
      >
        <View style={s.cardTop}>
          <Hall member={event.attacker} size={22} />
          <Text style={s.who} numberOfLines={1}>
            {text(event.attacker['mapPosition'])}. {text(event.attacker['name'])}
          </Text>
          <Text style={s.arrow}>→</Text>
          <Hall member={event.defender} size={22} />
          <Text style={s.who} numberOfLines={1}>
            {text(event.defender['mapPosition'])}. {text(event.defender['name'])}
          </Text>
        </View>
        <View style={s.cardBottom}>
          <Stars count={event.stars} size={13} />
          <Text style={s.pct}>{event.destruction.toFixed(0)}%</Text>
          <Text style={s.time}>{clockDuration(event.duration)}</Text>
          <Text style={s.score}>
            <Text style={ours ? s.scoreMoved : undefined}>{event.usStars}</Text>
            <Text style={s.scoreDash}>-</Text>
            <Text style={ours ? undefined : s.scoreMovedThem}>{event.themStars}</Text>
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 12 },
    chips: { gap: 8, paddingRight: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      maxWidth: 190,
    },
    chipOn: { borderColor: t.primary, backgroundColor: `${t.primary}22` },
    chipText: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    chipTextOn: { color: t.primary },
    chipCount: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    timeline: { paddingLeft: 22 },
    rail: { position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, backgroundColor: t.border },
    node: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    dot: {
      position: 'absolute',
      left: -22,
      top: 12,
      width: 11,
      height: 11,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: t.background,
    },
    dotUs: { backgroundColor: t.success },
    dotThem: { backgroundColor: t.destructive },
    dotLive: { backgroundColor: t.primary },
    dotIdle: { backgroundColor: t.mutedForeground },
    dotStart: { backgroundColor: t.success },
    nodeLabel: { paddingVertical: 7, fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },

    card: { flex: 1, minWidth: 0, padding: 10, borderRadius: 10, backgroundColor: t.card },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    who: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    arrow: { fontSize: 12, color: t.mutedForeground },
    cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
    pct: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    time: { flex: 1, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    score: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    scoreDash: { color: t.mutedForeground },
    scoreMoved: { color: t.success },
    scoreMovedThem: { color: t.destructive },

    empty: { paddingVertical: 20, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
