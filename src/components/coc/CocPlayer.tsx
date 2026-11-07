import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ART_SCALE, NAV_ART, resourceArt, townHallArt } from '@/assets/art';
import { playerCollection } from '@/lib/player-collection';
import { playerContext } from '@/lib/player-progress';
import { playerLeague } from '@/lib/league-tier';
import { useHub } from '@/state/HubProvider';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { Collapsible } from '@/components/ui/Collapsible';
import { Meter } from '@/components/ui/Meter';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, LeagueStat, SmallStat, Stars } from './CocBits';
import { CocBattles } from './CocBattles';
import { PlayerProgress } from './PlayerProgress';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { UnitGrid } from './UnitGrid';

/** Ported from the `CocPlayer` component in frontend/src/components/coc-mobile.tsx. */
export function CocPlayer({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const { openClan } = useDetailSheet();
  const { village: imported } = useHub();
  const s = useMemo(() => build(theme), [theme]);
  const [village, setVillage] = useState<'home' | 'builderBase'>('home');

  const clan = record(player['clan']);
  const hall = townHallArt(player['townHallLevel']);
  const xpArt = resourceArt('XP');

  /*
   * The whole army book for this village, not just what the service returned.
   *
   * `/v1/players/{tag}` only lists what you own, so a Pets section built from
   * it is short -- and on an account below Town Hall 14 it was missing
   * entirely, which is exactly how this read as "pets are broken". Driving it
   * from the catalog instead means every section is complete and each tile
   * says whether you own it, could unlock it today, or cannot reach it yet.
   */
  const homeSections = useMemo(
    () => playerCollection(player, 'home', imported),
    [player, imported],
  );
  const builderSections = useMemo(
    () => playerCollection(player, 'builderBase', imported),
    [player, imported],
  );
  const sections = village === 'home' ? homeSections : builderSections;

  const townHallLevel = Number(player['townHallLevel']) || 0;
  const builderHallLevel = Number(player['builderHallLevel']) || 0;
  const hallLevel = village === 'home' ? townHallLevel : builderHallLevel;

  /*
   * One per village, built from every section of it.
   *
   * The item sheet needs levels from outside the grid a tile was tapped in: a
   * piece of hero equipment names the hero wearing it, and equipment and
   * heroes are two different sections. Both villages are built because the
   * hero strip at the top of the page is always the Home Village's, whichever
   * tab the grids below are showing.
   */
  const homeContext = useMemo(
    () => playerContext(homeSections, townHallLevel, 'home'),
    [homeSections, townHallLevel],
  );
  const builderContext = useMemo(
    () => playerContext(builderSections, builderHallLevel, 'builder'),
    [builderSections, builderHallLevel],
  );
  const context = village === 'home' ? homeContext : builderContext;

  // The summary beside the Town Hall is always the Home Village heroes,
  // whichever tab the Army panel below is showing.
  const heroSummary = useMemo(
    () =>
      homeSections.find((x) => x.id === 'heroes')?.entries.filter((e) => e.state === 'owned') ?? [],
    [homeSections],
  );

  const achievements = rows(player['achievements']);
  const complete = achievements.filter((a) => Number(a['stars']) === 3).length;
  // The API returns every achievement, so the totals are a count of what it
  // sent rather than a figure that needs a reference table.
  const stars = achievements.reduce((n, a) => n + (Number(a['stars']) || 0), 0);
  const maxStars = achievements.length * 3;

  const donated = Number(player['donations']) || 0;
  const received = Number(player['donationsReceived']) || 0;
  // Ratio is undefined rather than Infinity when nothing was received.
  const ratio = received > 0 ? (donated / received).toFixed(2) : donated > 0 ? '∞' : '—';

  return (
    <View style={s.stack}>
      <Panel>
        <View style={s.hero}>
          {hall ? (
            <Image
              source={hall}
              accessibilityLabel={`Town Hall ${text(player['townHallLevel'])}`}
              resizeMode="contain"
              style={s.hall}
            />
          ) : (
            <Art name="builder" size={76} scale={ART_SCALE.panelBuilder} />
          )}
          <View style={s.heroText}>
            <View style={s.heroTop}>
              <Text style={s.name} numberOfLines={2}>
                {text(player['name'])}
              </Text>
              {/*
                The game's own XP badge with the level drawn over it, which is
                how Clash of Clans itself shows it. This was a plain filled
                rectangle -- the one number on the screen with no art behind
                it. The icon has been bundled all along via RESOURCE_ICONS in
                build-assets.mjs and nothing had used it.

                Falls back to the bare rectangle if the art is missing, the way
                every other art call site here does: resourceArt returns
                undefined rather than a stand-in.
              */}
              {xpArt ? (
                <View style={s.xp}>
                  <Image source={xpArt} style={s.xpIcon} resizeMode="contain" />
                  <Text style={s.xpOnIcon}>{text(player['expLevel'])}</Text>
                </View>
              ) : (
                <View style={[s.xp, s.xpPlain]}>
                  <Text style={s.xpText}>{text(player['expLevel'])}</Text>
                </View>
              )}
            </View>
            <Text style={s.tag}>{text(player['tag'])}</Text>
            <Text style={s.townHall}>Town Hall {text(player['townHallLevel'])}</Text>
          </View>
        </View>

        {/*
          Two leagues, two scores. `trophies` is the League Tier score now --
          it resets each season and runs to a few hundred, not the five-figure
          ladder it used to be -- so it is labelled as such, and the old
          all-time `bestTrophies` is marked legacy rather than quietly sitting
          beside it as though the two were the same currency.
        */}
        <View style={s.statRow}>
          <LeagueStat
            league={playerLeague(player, 'home')}
            label="League trophies"
            value={player['trophies']}
          />
          <LeagueStat
            league={playerLeague(player, 'builder')}
            label="Builder Base"
            value={player['builderBaseTrophies']}
          />
        </View>

        <View style={s.statRow}>
          <SmallStat label="Best (legacy)" value={player['bestTrophies']} icon="trophy" />
          <SmallStat label="War stars" value={player['warStars']} icon="star" />
        </View>

        <View style={s.compactGrid}>
          <UnitGrid entries={heroSummary} compact label="Heroes summary" context={homeContext} />
        </View>
      </Panel>

      {typeof clan['tag'] === 'string' ? (
        <Pressable accessibilityRole="button" onPress={() => openClan(text(clan['tag']), 'coc')}>
          <Panel style={s.clanRow}>
            <Art name="war" size={32} scale={ART_SCALE.panelWar} />
            <View style={s.clanText}>
              <Text style={s.clanName} numberOfLines={1}>
                {text(clan['name'])}
              </Text>
              <Text style={s.clanMeta}>
                {text(player['role'])} · Level {text(clan['clanLevel'])}
              </Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Panel>
        </Pressable>
      ) : null}

      <PlayerProgress
        sections={sections}
        hallLevel={hallLevel}
        village={village}
        onVillage={setVillage}
        context={context}
      />

      <Panel>
        <Text style={s.sectionTitle}>Village stats</Text>
        <View style={s.statGrid}>
          <SmallStat label="Attack wins" value={player['attackWins']} icon="Barbarian" />
          {/* NAV_ART, not COC_ART["war"]: the coc/main shield is untrimmed and
              renders at half the weight of the Clash Book art beside it. */}
          <SmallStat label="Defense wins" value={player['defenseWins']} icon={NAV_ART.war} />
          <SmallStat label="Troops donated" value={player['donations']} icon="Clan Castle" />
          <SmallStat label="Troops received" value={player['donationsReceived']} icon="Archer" />
          <SmallStat label="Donation ratio" value={ratio} icon="Clan Castle" />
          <SmallStat
            label="Capital gold contributed"
            value={player['clanCapitalContributions']}
            icon="Gold Storage"
          />
          <SmallStat
            label="War preference"
            value={
              player['warPreference'] === 'in'
                ? 'Opted in'
                : player['warPreference'] === 'out'
                  ? 'Opted out'
                  : 'Not shared'
            }
            icon="war"
          />
        </View>
      </Panel>

      {/*
        War attacks only. There *is* a Clash of Clans battle log now --
        /v1/players/{tag}/battlelog returns real solo attacks with opponent,
        stars, destruction and loot -- but nothing here reads it yet, so a
        player with no clan still gets an empty section.
      */}
      <CocBattles player={player} />

      {/*
        "Army", not "Collection": buildings, defenses, traps and walls are no
        longer listed here. The player endpoint carries no level for any of
        them, so they rendered as a wall of grey "?" tiles above a prompt to go
        and paste a village export -- which only ever existed for your own
        account, and never for the clan member whose profile this same
        component draws. The Builder screen keeps the grid that has the data.

        The village tabs moved up into the progress card, which governs both.
      */}
      <Panel>
        <Text style={s.sectionTitle}>Army</Text>
        {sections.map((group) => (
          <View key={group.id} style={s.group}>
            <View style={s.groupHeading}>
              <Art name={group.icon} size={24} />
              <Text style={s.groupTitle}>{group.name}</Text>
              <Text style={s.groupCount}>
                {group.owned}/{group.total}
              </Text>
              <View style={s.groupSpacer} />
            </View>
            <UnitGrid entries={group.entries} label={group.name} context={context} />
          </View>
        ))}
      </Panel>

      <Panel>
        <Collapsible
          summary={() => (
            <>
              <Art name="trophy" size={32} />
              <Text style={s.summaryText}>Achievements</Text>
              {/* The trailing `›` is gone: Collapsible draws the chevron now. */}
              <Text style={s.summaryCount}>
                {stars}/{maxStars} stars · {complete} of {achievements.length}
              </Text>
            </>
          )}
        >
          {achievements.map((a, i) => (
            <View key={i}>
              <View style={s.achievementRow}>
                <Text style={s.achievementName}>{text(a['name'])}</Text>
                <Stars count={a['stars']} size={12} />
              </View>
              <Meter value={Number(a['value'])} max={Number(a['target'])} />
              <Text style={s.achievementValue}>
                {text(a['value'])} / {text(a['target'])}
              </Text>
            </View>
          ))}
        </Collapsible>
      </Panel>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 16 },
    hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hall: { width: 76, height: 96 },
    heroText: { flex: 1, minWidth: 0 },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    name: { flexShrink: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 22, color: t.foreground },
    xp: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
    // The rectangle is the fallback now, not the badge.
    xpPlain: { backgroundColor: t.primary, borderRadius: 6, padding: 6 },
    xpIcon: { width: 34, height: 34 },
    /*
      Absolutely positioned over the icon rather than laid out beside it.
      The XP badge is a shape with a hollow centre meant to hold its own
      number, so the level sits in it; `xp` centres both children on the
      same point.

      The dark outline is what keeps two and three digit levels legible
      against the badge's lighter middle.
    */
    xpOnIcon: {
      position: 'absolute',
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: '#ffffff',
      textShadowColor: 'rgba(0,0,0,0.85)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    xpText: { fontFamily: t.fonts.display, fontSize: 12, color: t.primaryForeground },
    tag: { marginTop: 4, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    townHall: { marginTop: 8, fontFamily: t.fonts.display, fontSize: 12, color: t.primary },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    compactGrid: { marginTop: 16 },

    clanRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    clanText: { flex: 1, minWidth: 0 },
    clanName: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    clanMeta: { marginTop: 4, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    chevron: { color: t.primary, fontSize: 18 },

    sectionTitle: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground, marginBottom: 12 },
    group: { marginBottom: 24 },
    groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    groupTitle: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    groupCount: { fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    groupSpacer: { flex: 1 },

    summaryText: { fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    summaryCount: { marginLeft: 'auto', fontFamily: t.fonts.display, fontSize: 13, color: t.primary },
    achievementRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
    achievementName: { flexShrink: 1, fontSize: 12, color: t.foreground, fontFamily: t.fonts.sans },
    achievementValue: { marginTop: 4, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
  });
