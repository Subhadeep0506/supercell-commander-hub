import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useToday } from '@/hooks/use-today';
import {
  AccountRow,
  EventCard,
  LiveEventCard,
  NoteCard,
  TodaySection,
} from '@/components/today/TodayBits';
import { Panel } from '@/components/ui/Panel';
import { SkeletonRows } from '@/components/ui/Shimmer';
import { navigate } from '@/navigation/navigationRef';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * Today -- what is happening now, across both games.
 *
 * The screen's rule is **real timestamps only**. Every clock on it traces back
 * to a field the game service published; nothing is derived from an assumption
 * about when a period ends. `buildToday` enforces that, and the consequence is
 * visible here: Clash of Clans contributes up to three countdowns, while Clash
 * Royale usually contributes a sentence, because the only forward-looking time
 * it publishes is on a global tournament and there is rarely one running.
 *
 * Saying that plainly is the design, not a gap in it. A screen that hid Royale
 * on a quiet day would look broken; one that counted down the river race from
 * its period index would be quietly wrong.
 */
export function TodayScreen() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { events, notes, live, accounts, loading, loadingLive, empty } = useToday();

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.shell}>
      {empty ? <NoAccounts /> : null}

      {loading && !events.length && !notes.length ? (
        <SkeletonRows rows={3} avatar label="Loading today" />
      ) : null}

      {events.length > 0 ? (
        <TodaySection title="Next up">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </TodaySection>
      ) : null}

      {/*
        Only shown once something has resolved -- during the first load an
        "all quiet" message would be a lie that corrects itself a second later
        -- and only when there is genuinely nothing else, so it never sits
        above a list of events that are plainly running.
      */}
      {!empty && !loading && !loadingLive && events.length === 0 && live.length === 0 ? (
        <TodaySection title="Next up">
          <Panel tone="plain">
            <Text style={s.quietTitle}>Nothing is running</Text>
            <Text style={s.quietBody}>
              No war, no Clan War League round and no raid weekend is live for your clan right
              now. This board fills itself in as they start.
            </Text>
          </Panel>
        </TodaySection>
      ) : null}

      {/*
        Running now, but untimed. Kept out of "Next up" because the service
        gives them no end time, and a card in a timeline with a blank clock
        would claim one exists.
      */}
      {loadingLive ? (
        <TodaySection title="Running now">
          <SkeletonRows rows={2} avatar label="Loading live events" />
        </TodaySection>
      ) : null}

      {live.length > 0 ? (
        <TodaySection
          title="Running now"
          caption="These are live in game. The service publishes no end time for them, so they have no countdown."
        >
          {live.map((event) => (
            <LiveEventCard key={event.id} event={event} />
          ))}
        </TodaySection>
      ) : null}

      {notes.length > 0 ? (
        <TodaySection title={live.length > 0 ? 'No countdown available' : 'Nothing scheduled'}>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </TodaySection>
      ) : null}

      {accounts.coc || accounts.cr || accounts.bs ? (
        <TodaySection title="Your accounts">
          {accounts.coc ? (
            <AccountRow game="coc" player={accounts.coc} route="CocHome" />
          ) : null}
          {accounts.cr ? <AccountRow game="cr" player={accounts.cr} route="CrHome" /> : null}
          {accounts.bs ? <AccountRow game="bs" player={accounts.bs} route="BsHome" /> : null}
        </TodaySection>
      ) : null}
      {/*
        There used to be a "Brawl Stars is arriving later" panel here. Its
        rotation is now in the timeline above with the rest of the countdowns,
        which is exactly where that note said it would land.
      */}
    </ScrollView>
  );
}

/** Nothing saved for any game, so there is nothing to resolve a clan from. */
function NoAccounts() {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <Panel tone="plain" style={s.empty}>
      <Text style={s.emptyTitle}>No accounts yet</Text>
      <Text style={s.emptyBody}>
        Save a player tag and this board shows your war, Clan War League round and raid weekend
        as they run.
      </Text>
      <Pressable accessibilityRole="link" onPress={() => navigate('Passport')}>
        <Text style={s.emptyLink}>Saved accounts ›</Text>
      </Pressable>
    </Panel>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    // Bottom padding clears the floating nav pill, as the two game shells do.
    shell: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: 12,
      paddingTop: 16,
      paddingBottom: 120,
      gap: 20,
    },

    quietTitle: { fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    quietBody: {
      marginTop: 8,
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 19,
      color: t.mutedForeground,
    },

    empty: { alignItems: 'center' },
    emptyTitle: { fontFamily: t.fonts.display, fontSize: 18, color: t.foreground },
    emptyBody: {
      marginTop: 10,
      textAlign: 'center',
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 19,
      color: t.mutedForeground,
    },
    emptyLink: { marginTop: 16, fontFamily: t.fonts.display, fontSize: 12, color: t.primary },
  });
