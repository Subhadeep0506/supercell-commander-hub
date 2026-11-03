import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NAV_ART, COC_ART } from '@/assets/art';
import { capitalLeagueArt, clanLabelArt, districtArt, warLeagueArt } from '@/assets/capital';
import { record, rows, text, type ApiRecord } from '@/api/game-api';
import {
  clanTypeLabel,
  compactNumber,
  groupedNumber,
  warFrequencyLabel,
  winRate,
} from '@/lib/clan';
import { flagEmoji } from '@/lib/rankings';
import { navigate } from '@/navigation/navigationRef';
import { HGrid } from '@/components/ui/HGrid';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Chip, ClanBadge, StatCell, StatStrip } from './ClanBits';
import { ClanMembers } from './ClanMembers';

const DISTRICT_TILE = 92;
/** Lines of description shown before "Show more". */
const DESCRIPTION_LINES = 2;

/**
 * The clan profile: identity, war record, Clan Capital and roster.
 *
 * Every value comes from the single `/v1/clans/{tag}` response the sheet
 * already holds -- no section here costs an extra request. The two sub-views
 * (capital raids, war log) are the only things that fetch again, and only once
 * opened.
 */
export function ClanOverview({
  clan,
  onOpenCapital,
  onOpenWarLog,
  onClose,
}: {
  clan: ApiRecord;
  onOpenCapital: () => void;
  onOpenWarLog: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const [expanded, setExpanded] = useState(false);

  const tag = text(clan['tag']);
  const location = record(clan['location']);
  const language = record(clan['chatLanguage']);
  const labels = rows(clan['labels']);
  const capital = record(clan['clanCapital']);
  const districts = rows(capital['districts']);
  const rate = winRate(clan);

  const wins = Number(clan['warWins']) || 0;
  const losses = Number(clan['warLosses']) || 0;
  const ties = Number(clan['warTies']) || 0;
  const played = wins + losses + ties;

  const description = text(clan['description']);
  // Only worth a toggle when there is something hidden behind it.
  const longDescription = description !== '—' && description.length > 90;

  return (
    <View style={s.stack}>
      <Panel>
        <View style={s.identity}>
          <ClanBadge clan={clan} size={96} level />
          <View style={s.identityText}>
            <Text style={s.name} numberOfLines={2}>
              {text(clan['name'])}
            </Text>
            <Text style={s.tag}>{tag}</Text>
            <View style={s.originRow}>
              <Text style={s.origin} numberOfLines={1}>
                {flagEmoji(location['countryCode']) ?? '🌐'}{' '}
                {text(location['name'] ?? 'International')}
              </Text>
              {language['name'] ? (
                <Text style={s.origin} numberOfLines={1}>
                  💬 {text(language['name'])}
                </Text>
              ) : null}
            </View>
            {labels.length ? (
              <View style={s.labels}>
                {labels.map((label, i) => {
                  const art = clanLabelArt(label['name']);
                  return art ? (
                    <Image
                      key={i}
                      source={art}
                      style={s.label}
                      resizeMode="contain"
                      accessibilityLabel={text(label['name'])}
                    />
                  ) : (
                    <Text key={i} style={s.labelText}>
                      {text(label['name'])}
                    </Text>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>

        {description === '—' ? null : (
          <>
            <Text
              style={s.description}
              numberOfLines={expanded || !longDescription ? undefined : DESCRIPTION_LINES}
            >
              {description}
            </Text>
            {longDescription ? (
              <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)}>
                <Text style={s.showMore}>{expanded ? 'Show less' : 'Show more'}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <StatStrip style={s.strip}>
          <StatCell value={groupedNumber(clan['clanPoints'])} label="Trophies" icon={COC_ART['trophy']} />
          <View style={s.divider} />
          <StatCell
            value={groupedNumber(clan['clanBuilderBasePoints'])}
            label="Builder"
            icon={NAV_ART.builder}
          />
          <View style={s.divider} />
          <StatCell value={`${text(clan['members'])}/50`} label="Members" icon={NAV_ART.clan} />
        </StatStrip>

        <View style={s.chipRow}>
          <Chip glyph="✉" label={clanTypeLabel(clan['type'])} />
          <Chip glyph="🏰" label={`TH ${text(clan['requiredTownhallLevel'])}+`} />
          <Chip glyph="🏆" label={`${text(clan['requiredTrophies'])}+`} />
        </View>
      </Panel>

      <Panel>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Clan War</Text>
          {record(clan['warLeague'])['name'] ? (
            <Chip
              label={text(record(clan['warLeague'])['name'])}
              icon={warLeagueArt(record(clan['warLeague'])['name'])}
              glyph="🎖"
              tone="highlight"
            />
          ) : null}
        </View>

        <StatStrip style={s.strip}>
          <StatCell value={groupedNumber(wins)} label="Wins" tone={theme.success} />
          <View style={s.divider} />
          <StatCell value={groupedNumber(losses)} label="Losses" tone={theme.destructive} />
          <View style={s.divider} />
          <StatCell value={groupedNumber(ties)} label="Ties" />
        </StatStrip>

        {played > 0 ? (
          <View style={s.warBar} accessibilityLabel={`${wins} wins, ${losses} losses, ${ties} ties`}>
            <View style={[s.warSeg, s.warWin, { flexGrow: wins }]} />
            <View style={[s.warSeg, s.warTie, { flexGrow: ties }]} />
            <View style={[s.warSeg, s.warLoss, { flexGrow: losses }]} />
          </View>
        ) : null}

        <View style={s.chipRow}>
          {rate === undefined ? null : <Chip label={`${Math.round(rate * 100)}% win rate`} />}
          <Chip glyph="🕐" label={warFrequencyLabel(clan['warFrequency'])} />
          {Number(clan['warWinStreak']) > 0 ? (
            <Chip glyph="🔥" label={`${text(clan['warWinStreak'])} win streak`} tone="highlight" />
          ) : null}
        </View>

        <View style={s.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Current War"
            style={s.action}
            onPress={() => {
              // The sheet floats above the navigator, so it has to get out of
              // the way before the war screen it is pointing at appears.
              onClose();
              navigate('CocWar', { tag });
            }}
          >
            <Text style={s.actionText}>⚔ Current War</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="War History"
            style={s.action}
            onPress={onOpenWarLog}
          >
            <Text style={s.actionText}>🗓 War History</Text>
          </Pressable>
        </View>
      </Panel>

      <Pressable accessibilityRole="button" accessibilityLabel="Capital raids" onPress={onOpenCapital}>
        <Panel>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>
              Clan Capital{capital['capitalHallLevel'] ? ` (Lv. ${text(capital['capitalHallLevel'])})` : ''}
            </Text>
            {/* Points only. The league badge is the chip directly below, and
                repeating it here read as two different facts. */}
            <Chip label={compactNumber(clan['clanCapitalPoints'])} glyph="🎖" tone="highlight" />
          </View>

          {record(clan['capitalLeague'])['name'] ? (
            <View style={s.chipRow}>
              <Chip
                label={text(record(clan['capitalLeague'])['name'])}
                icon={capitalLeagueArt(record(clan['capitalLeague'])['name'])}
                glyph="🎖"
              />
            </View>
          ) : null}

          {districts.length ? (
            <HGrid
              items={districts}
              tileWidth={DISTRICT_TILE}
              accessibilityLabel="Clan Capital districts"
              keyExtractor={(d, i) => `${text(d['name'])}-${i}`}
              renderItem={(district) => {
                const level =
                  text(district['name']) === 'Capital Peak'
                    ? capital['capitalHallLevel']
                    : district['districtHallLevel'];
                const art = districtArt(district['name'], level);
                return (
                  <View style={s.district}>
                    <View style={s.districtArt}>
                      {art ? (
                        <Image source={art} style={s.districtImage} resizeMode="contain" />
                      ) : null}
                      <View style={s.districtLevel}>
                        <Text style={s.districtLevelText}>{text(level)}</Text>
                      </View>
                    </View>
                    <Text style={s.districtName} numberOfLines={2}>
                      {text(district['name'])}
                    </Text>
                  </View>
                );
              }}
            />
          ) : (
            <Text style={s.noCapital}>This clan has not built its Clan Capital yet.</Text>
          )}

          <Text style={s.capitalLink}>Capital raids ›</Text>
        </Panel>
      </Pressable>

      <Panel>
        <ClanMembers clan={clan} />
      </Panel>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    stack: { gap: 14 },

    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    identityText: { flex: 1, minWidth: 0, paddingTop: 4 },
    name: { fontFamily: t.fonts.display, fontSize: 22, color: t.foreground },
    tag: { marginTop: 4, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },
    originRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
    origin: { fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },
    labels: { flexDirection: 'row', gap: 6, marginTop: 10 },
    label: { width: 26, height: 26, borderRadius: 4 },
    labelText: { fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    description: {
      marginTop: 14,
      fontSize: 12,
      lineHeight: 19,
      color: t.foreground,
      fontFamily: t.fonts.sans,
      textAlign: 'center',
    },
    showMore: {
      marginTop: 8,
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: t.primary,
    },

    strip: { marginTop: 16 },
    divider: { width: 1, backgroundColor: t.border },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionTitle: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 17, color: t.foreground },

    // flexGrow carries the proportions, so the three segments always fill the
    // bar exactly whatever the counts are.
    warBar: { flexDirection: 'row', height: 8, marginTop: 14, borderRadius: 999, overflow: 'hidden' },
    warSeg: { flexBasis: 0, minWidth: 2 },
    warWin: { backgroundColor: t.success },
    warTie: { backgroundColor: t.mutedForeground },
    warLoss: { backgroundColor: t.destructive },

    actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    action: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      backgroundColor: t.muted,
    },
    actionText: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },

    district: { width: '100%' },
    districtArt: {
      width: '100%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.muted,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: 4,
      overflow: 'hidden',
    },
    districtImage: { width: '100%', height: '100%' },
    districtLevel: {
      position: 'absolute',
      top: 3,
      left: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: t.card,
    },
    districtLevelText: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    districtName: {
      marginTop: 6,
      minHeight: 28,
      fontFamily: t.fonts.display,
      fontSize: 10,
      lineHeight: 14,
      color: t.foreground,
    },
    noCapital: {
      marginTop: 14,
      fontSize: 12,
      color: t.mutedForeground,
      fontFamily: t.fonts.sans,
    },
    capitalLink: {
      marginTop: 14,
      textAlign: 'right',
      fontFamily: t.fonts.display,
      fontSize: 12,
      color: t.primary,
    },
  });
