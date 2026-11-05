import { useMemo, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GAME_LOGOS, townHallArt } from '@/assets/art';
import { record, text, type ApiRecord, type Game } from '@/api/game-api';
import { groupedNumber, formatDuration } from '@/lib/clan';
import type { TodayEvent, TodayNote } from '@/lib/today';
import { useCountdown } from '@/hooks/use-countdown';
import { Panel } from '@/components/ui/Panel';
import { PlayerPortrait } from '@/components/cr/CrBits';
import { navigate } from '@/navigation/navigationRef';
import type { RouteName } from '@/navigation/routes';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * The pieces of the Today board.
 *
 * Every card is a `Panel`, which is styled purely from theme tokens and so
 * renders correctly under all three skins. Today has no palette of its own --
 * it follows whichever game the hub is on, which is what keeps the three-logo
 * picker meaningful on a screen that belongs to no single game.
 */

/** The game's wordmark, used to badge a card that could be from either. */
function GameBadge({ game }: { game: Game }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const logo = GAME_LOGOS[game];
  if (!logo) return null;
  return (
    <Image
      source={logo}
      style={s.badge}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * One countdown.
 *
 * The clock ticks locally off `useCountdown` rather than re-fetching, and
 * `formatDuration` drops leading zero units so a 40-minute prep window reads
 * "40m 12s" rather than "0d 0h 40m 12s".
 */
export function EventCard({ event }: { event: TodayEvent }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const remaining = useCountdown(event.target);

  // `formatDuration` floors at "now", which would read as "ends in now". The
  // services' state lags the clock by a minute or two at every changeover, so
  // this window is reached routinely rather than exceptionally.
  const passed = remaining <= 0;
  const clock = passed ? 'any moment' : formatDuration(remaining);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${event.phase}, ${
        event.ending ? 'ends' : 'starts'
      } in ${clock}`}
      onPress={() => navigate(event.route)}
      style={({ pressed }) => [pressed && s.pressed]}
    >
      <Panel style={s.card}>
        <GameBadge game={event.game} />
        <View style={s.body}>
          <Text style={s.title} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {event.phase}
            {/*
              Guarded on a non-empty string, not on truthiness: `{detail && …}`
              puts a bare '' into this Text's parent, which only warns on the
              web and is a hard error on Android.
            */}
            {event.detail ? ` · ${event.detail}` : ''}
          </Text>
        </View>
        <View style={s.clockCell}>
          <Text style={[s.clock, passed && s.clockSoon]} numberOfLines={1}>
            {clock}
          </Text>
          <Text style={s.clockLabel}>{event.ending ? 'left' : 'to go'}</Text>
        </View>
      </Panel>
    </Pressable>
  );
}

/**
 * Something real that has no timestamp.
 *
 * Deliberately not a card with a dash where the clock would be: a disabled
 * timer implies the number is missing, when the truth is that the service
 * never publishes one.
 */
export function NoteCard({ note }: { note: TodayNote }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const inner = (
    <Panel style={s.noteCard}>
      <View style={s.noteHead}>
        <GameBadge game={note.game} />
        <Text style={s.noteTitle} numberOfLines={1}>
          {note.title}
        </Text>
      </View>
      <Text style={s.noteBody}>{note.body}</Text>
    </Panel>
  );

  if (!note.route) return inner;
  const route = note.route;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={note.title}
      onPress={() => navigate(route)}
      style={({ pressed }) => [pressed && s.pressed]}
    >
      {inner}
    </Pressable>
  );
}

/**
 * One saved account, with the single figure that game leads on.
 *
 * `›` rather than a `Chevron`: this opens another screen, and the chevron is
 * reserved for things that expand in place.
 */
export function AccountRow({
  game,
  player,
  route,
}: {
  game: Game;
  player: ApiRecord;
  route: RouteName;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const name = text(player['name']);
  const tag = text(player['tag']);
  const clan = text(record(player['clan'])['name']);

  const headline =
    game === 'coc'
      ? `Town Hall ${text(player['townHallLevel'])} · ${groupedNumber(player['trophies'])} League trophies`
      : `${groupedNumber(player['trophies'])} trophies`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={() => navigate(route)}
      style={({ pressed }) => [pressed && s.pressed]}
    >
      <Panel style={s.card}>
        {game === 'coc' ? (
          <TownHall level={player['townHallLevel']} />
        ) : (
          <PlayerPortrait player={player} size={44} />
        )}
        <View style={s.body}>
          <Text style={s.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {tag}
            {clan === '—' ? '' : ` · ${clan}`}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {headline}
          </Text>
        </View>
        <Text style={s.go}>›</Text>
      </Panel>
    </Pressable>
  );
}

/** Town Hall render, falling back to the game's wordmark. */
function TownHall({ level }: { level: unknown }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const art = townHallArt(level);
  if (!art) return <GameBadge game="coc" />;
  return (
    <Image
      source={art}
      style={s.hall}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/** A titled run of cards. */
export function TodaySection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    pressed: { opacity: 0.8 },

    card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: { width: 44, height: 24, flexShrink: 0 },
    hall: { width: 44, height: 44, flexShrink: 0 },
    body: { flex: 1, minWidth: 0 },
    title: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    meta: { marginTop: 3, fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },
    go: { fontFamily: t.fonts.display, fontSize: 20, color: t.primary, flexShrink: 0 },

    clockCell: { alignItems: 'flex-end', flexShrink: 0 },
    clock: { fontFamily: t.fonts.display, fontSize: 15, color: t.primary },
    // Past its target: the changeover is in progress rather than overdue.
    clockSoon: { color: t.mutedForeground, fontSize: 13 },
    clockLabel: { marginTop: 2, fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },

    noteCard: { gap: 10 },
    noteHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    noteTitle: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    noteBody: { fontFamily: t.fonts.sans, fontSize: 12, lineHeight: 19, color: t.mutedForeground },

    section: { gap: 10 },
    sectionTitle: { fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    sectionBody: { gap: 10 },
  });
