import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { resourceArt } from '@/assets/art';
import { districtArt } from '@/assets/capital';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import { attacksPerCapital, compactNumber, raidLogTotals, raidOpponent } from '@/lib/clan';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Stars } from '../CocBits';
import { ClanBadge } from './ClanBits';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';

/**
 * The capitals this clan raided, or that raided it.
 *
 * `attackLog` and `defenseLog` are the same shape apart from the clan field --
 * `defender` on offence, `attacker` on defence -- so one component serves
 * both, with `raidOpponent` picking whichever is present.
 *
 * Three levels deep: a raid collapses to its districts, and a district
 * collapses to the individual attacks on it. Every clan and player named along
 * the way pushes onto the sheet's stack.
 */
export function RaidLog({
  log,
  title,
  side,
}: {
  log: ApiRecord[];
  title: string;
  /** Distinguishes the two instances' expansion keys and labels. */
  side: 'attack' | 'defense';
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { openClan, openPlayer } = useDetailSheet();
  const [openRaid, setOpenRaid] = useState<string>();
  const [openDistrict, setOpenDistrict] = useState<string>();

  const paged = usePaged(log, side);
  const average = attacksPerCapital(log);
  const gold = resourceArt('Capital Gold');

  if (!log.length) return null;

  return (
    <Panel>
      <View style={s.head}>
        <View style={s.headLeft}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.count}>{log.length}</Text>
        </View>
        {average === undefined ? null : (
          <Text style={s.average}>{average.toFixed(1)} attacks per capital</Text>
        )}
      </View>

      <View style={s.list}>
        {paged.shown.map((entry, i) => {
          const clan = raidOpponent(entry);
          const totals = raidLogTotals(entry);
          const key = `${side}-${i}`;
          const expanded = openRaid === key;

          return (
            <View key={key} style={[s.raid, expanded && s.raidOpen]}>
              {/*
                The clan target and the expand target are siblings, never
                nested. react-native-web implements Pressable with DOM events,
                which bubble -- a name button inside a row button would open
                the clan *and* toggle the raid on one tap. Native's responder
                system would not, which is exactly how this slips through if
                only the device is tested.
              */}
              <View style={s.raidTop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View ${text(clan['name'])}`}
                  style={s.raidClan}
                  onPress={() => openClan(text(clan['tag']))}
                >
                  <ClanBadge clan={clan} size={44} level />
                  <Text style={s.raidName} numberOfLines={1}>
                    {text(clan['name'])}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${side === 'attack' ? 'Raid on' : 'Defence against'} ${text(clan['name'])}`}
                  style={s.raidToggle}
                  onPress={() => {
                    setOpenRaid(expanded ? undefined : key);
                    setOpenDistrict(undefined);
                  }}
                >
                  <View style={s.raidLoot}>
                    {gold ? <Image source={gold} style={s.lootIcon} resizeMode="contain" /> : null}
                    <Text style={s.lootText}>{compactNumber(totals.loot)} loot</Text>
                  </View>
                  <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
                </Pressable>
              </View>

              {/*
                The result gets its own full-width line rather than sitting
                beside the loot. Squeezed into the name column it had about
                200px for a 210px string, so "Perfect raid · all districts"
                truncated on exactly the rows with the longest clan names.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${totals.destroyed} of ${totals.count} districts against ${text(clan['name'])}`}
                style={s.resultRow}
                onPress={() => {
                  setOpenRaid(expanded ? undefined : key);
                  setOpenDistrict(undefined);
                }}
              >
                <Text
                  style={[s.raidResult, totals.perfect ? s.perfect : s.partial]}
                  numberOfLines={1}
                >
                  {totals.perfect
                    ? '🔥 Perfect raid · all districts'
                    : `${totals.destroyed} of ${totals.count} districts`}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${totals.attacks} attacks against ${text(clan['name'])}`}
                style={s.pipRow}
                onPress={() => {
                  setOpenRaid(expanded ? undefined : key);
                  setOpenDistrict(undefined);
                }}
              >
                <View style={s.pips}>
                  {Array.from({ length: totals.count }, (_, p) => (
                    <View key={p} style={[s.pip, p < totals.destroyed && s.pipOn]} />
                  ))}
                </View>
                <Text style={s.pipLabel} numberOfLines={1}>
                  {totals.destroyed} / {totals.count} districts · {totals.attacks} attacks
                </Text>
              </Pressable>

              {expanded ? (
                <View style={s.districts}>
                  {totals.districts.map((district, d) => {
                    const dKey = `${key}-${d}`;
                    const dOpen = openDistrict === dKey;
                    const attacks = rows(district['attacks']);
                    const pct = Math.max(
                      0,
                      Math.min(100, Number(district['destructionPercent']) || 0),
                    );
                    const art = districtArt(district['name'], district['districtHallLevel']);

                    return (
                      <View key={dKey} style={s.district}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: dOpen }}
                          accessibilityLabel={`${text(district['name'])} in the raid on ${text(clan['name'])}`}
                          disabled={!attacks.length}
                          onPress={() => setOpenDistrict(dOpen ? undefined : dKey)}
                        >
                          <View style={s.districtTop}>
                            {art ? (
                              <Image source={art} style={s.districtArt} resizeMode="contain" />
                            ) : (
                              <View style={s.districtArt} />
                            )}
                            <Text style={s.districtName} numberOfLines={1}>
                              {text(district['name'])}
                            </Text>
                            <Stars count={district['stars']} />
                          </View>

                          <View style={s.meter}>
                            <View style={[s.meterFill, { width: `${pct}%` }]} />
                          </View>

                          <View style={s.districtFoot}>
                            <Text style={s.districtPct}>{Math.round(pct)}%</Text>
                            <Text style={s.districtStat}>
                              {text(district['attackCount'])} attacks ·{' '}
                              {compactNumber(district['totalLooted'])}
                              {attacks.length ? (dOpen ? ' ⌃' : ' ⌄') : ''}
                            </Text>
                          </View>
                        </Pressable>

                        {dOpen
                          ? attacks.map((attack, a) => {
                              const attacker = record(attack['attacker']);
                              return (
                                <Pressable
                                  key={a}
                                  accessibilityRole="button"
                                  accessibilityLabel={`View ${text(attacker['name'])}`}
                                  style={s.attack}
                                  onPress={() => openPlayer(text(attacker['tag']))}
                                >
                                  <Text style={s.attackName} numberOfLines={1}>
                                    {text(attacker['name'])}
                                  </Text>
                                  <Stars count={attack['stars']} />
                                  <Text style={s.attackPct}>
                                    {Math.round(Number(attack['destructionPercent']) || 0)}%
                                  </Text>
                                </Pressable>
                              );
                            })
                          : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        noun="raids"
        style={s.more}
      />
    </Panel>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 12,
    },
    headLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    title: { fontFamily: t.fonts.display, fontSize: 17, color: t.foreground },
    count: { fontFamily: t.fonts.display, fontSize: 13, color: t.mutedForeground },
    average: { flexShrink: 1, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    list: { gap: 10 },
    more: { marginTop: 12, alignSelf: 'flex-start' },
    raid: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.muted,
    },
    raidOpen: { borderColor: t.success },
    raidTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    raidClan: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    raidToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
    raidName: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 14, color: t.foreground },
    // Indented to sit under the name, not the badge.
    resultRow: { marginTop: 5, paddingLeft: 54 },
    raidResult: { fontFamily: t.fonts.display, fontSize: 11 },
    perfect: { color: t.success },
    partial: { color: t.mutedForeground },
    raidLoot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    lootIcon: { width: 15, height: 15 },
    lootText: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    chevron: { width: 12, textAlign: 'center', fontSize: 12, color: t.mutedForeground },

    pipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    pips: { flexDirection: 'row', gap: 3, flexShrink: 0 },
    pip: { width: 13, height: 6, borderRadius: 3, backgroundColor: t.border },
    pipOn: { backgroundColor: t.success },
    pipLabel: {
      marginLeft: 'auto',
      flexShrink: 1,
      textAlign: 'right',
      fontSize: 10,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
    },

    districts: { marginTop: 12, gap: 8 },
    district: { backgroundColor: t.card, borderRadius: 8, padding: 10 },
    districtTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    districtArt: { width: 34, height: 34 },
    districtName: { flex: 1, minWidth: 0, fontFamily: t.fonts.display, fontSize: 13, color: t.foreground },
    meter: {
      height: 7,
      marginTop: 8,
      borderRadius: 999,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    meterFill: { height: '100%', backgroundColor: t.success },
    districtFoot: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 6,
    },
    districtPct: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    districtStat: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    attack: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    attackName: { flex: 1, minWidth: 0, fontSize: 12, color: t.primary, fontFamily: t.fonts.sans },
    attackPct: { width: 42, textAlign: 'right', fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

  });
