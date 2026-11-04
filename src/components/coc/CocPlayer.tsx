import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ART_SCALE, NAV_ART, townHallArt } from '@/assets/art';
import { BOOK_ITEMS, playerBookItem } from '@/lib/clash-book';
import { gatesFor, maxLevelAt } from '@/lib/village-plan';
import { useHub } from '@/state/HubProvider';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { Collapsible } from '@/components/ui/Collapsible';
import { Meter } from '@/components/ui/Meter';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, SmallStat, Stars } from './CocBits';
import { CocBattles } from './CocBattles';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { UnitGrid } from './UnitGrid';

/** Army sections, in the reference's order. */
const GROUPS = [
  { name: 'Heroes', key: 'heroes', icon: 'Barbarian King' },
  { name: 'Pets', key: 'troops', icon: 'pets', category: 'pet' },
  { name: 'Troops', key: 'troops', icon: 'Barbarian', category: 'troop' },
  // Super Troops come back in `troops` alongside the rest, and used to pad
  // the Troops row with 17 extra tiles. They are a catalog category of their
  // own now, so the same category filter separates them.
  { name: 'Super Troops', key: 'troops', icon: 'Super Barbarian', category: 'super-troop' },
  { name: 'Spells', key: 'spells', icon: 'Spell Factory' },
  { name: 'Siege Machines', key: 'troops', icon: 'Wall Wrecker', category: 'siege-machine' },
  { name: 'Hero Equipment', key: 'heroEquipment', icon: 'Giant Gauntlet' },
] as const;

/** Ported from the `CocPlayer` component in frontend/src/components/coc-mobile.tsx. */
export function CocPlayer({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const { openClan } = useDetailSheet();
  const { village: imported } = useHub();
  const s = useMemo(() => build(theme), [theme]);
  const [village, setVillage] = useState<'home' | 'builderBase'>('home');

  const clan = record(player['clan']);
  const hall = townHallArt(player['townHallLevel']);

  const unitsFor = (group: (typeof GROUPS)[number]) => {
    const fromApi = rows(player[group.key]).filter(
      (u) =>
        (u['village'] ?? 'home') === village &&
        (!('category' in group) ||
          (playerBookItem(u['name'], u['village'])?.category ?? 'troop') === group.category),
    );
    if (fromApi.length || village !== 'builderBase' || !imported) return fromApi;

    // The player API returns no Builder Base troop or hero levels at all --
    // the tab was simply empty. A village export carries them, so it stands in
    // when one has been imported.
    const wanted = 'category' in group ? group.category : 'hero';
    const gates = gatesFor(imported.builder);
    return imported.builder.owned
      .filter((owned) => owned.category === wanted)
      .map((owned) => {
        const item = BOOK_ITEMS.find((i) => i.id === owned.catalogId);
        return {
          name: owned.name,
          level: owned.level,
          maxLevel: item ? maxLevelAt(item, gates) : owned.level,
          village: 'builderBase',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

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
              <View style={s.xp}>
                <Text style={s.xpText}>{text(player['expLevel'])}</Text>
              </View>
            </View>
            <Text style={s.tag}>{text(player['tag'])}</Text>
            <Text style={s.townHall}>Town Hall {text(player['townHallLevel'])}</Text>
          </View>
        </View>

        <View style={s.statRow}>
          <SmallStat
            label={`Best ${text(player['bestTrophies'])} · ${text(record(player['league'])['name'] ?? 'Unranked')}`}
            value={player['trophies']}
            icon="trophy"
          />
          <SmallStat label="War stars" value={player['warStars']} icon="star" />
        </View>

        <View style={s.compactGrid}>
          <UnitGrid
            items={rows(player['heroes']).filter((h) => h['village'] === 'home')}
            compact
            label="Heroes summary"
          />
        </View>
      </Panel>

      {typeof clan['tag'] === 'string' ? (
        <Pressable accessibilityRole="button" onPress={() => openClan(text(clan['tag']))}>
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
        No battle log exists for Clash of Clans, so this is war attacks only.
        CocBattles renders nothing at all for a player with no clan.
      */}
      <CocBattles player={player} />

      <Panel>
        <Text style={s.sectionTitle}>Army</Text>
        <Tabs
          value={village}
          onChange={setVillage}
          tabs={[
            { id: 'home', label: 'Home Village' },
            { id: 'builderBase', label: 'Builder Base' },
          ]}
        />
        {GROUPS.map((group) => {
          const units = unitsFor(group);
          if (!units.length) return null;
          return (
            <View key={group.name} style={s.group}>
              <View style={s.groupHeading}>
                <Art name={group.icon} size={24} />
                <Text style={s.groupTitle}>{group.name}</Text>
                <Text style={s.groupCount}>{units.length}</Text>
                <View style={s.groupSpacer} />
              </View>
              <UnitGrid items={units} label={group.name} />
            </View>
          );
        })}
      </Panel>

      <Panel>
        <Collapsible
          summary={() => (
            <>
              <Art name="trophy" size={32} />
              <Text style={s.summaryText}>Achievements</Text>
              <Text style={s.summaryCount}>
                {stars}/{maxStars} stars · {complete} of {achievements.length} ›
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
    xp: { flexShrink: 0, backgroundColor: t.primary, borderRadius: 6, padding: 6 },
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
