import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, rows, text, type ApiRecord, type GameResult } from '@/api/game-api';
import { buildRounds } from '@/lib/cwl';
import { clockDuration } from '@/lib/war-detail';
import {
  inLeagueGroup,
  sortWarBattles,
  warBattleSummary,
  warBattlesFor,
  type WarBattle,
} from '@/lib/coc-attacks';
import { useLeagueWars } from '@/hooks/use-league-wars';
import { Button } from '@/components/ui/Button';
import { ChipRow, type Chip } from '@/components/ui/ChipRow';
import { LoadMore, usePaged } from '@/components/ui/Paged';
import { Panel } from '@/components/ui/Panel';
import { useDetailSheet } from '@/components/detail/DetailSheetProvider';
import { useHub } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Art, SmallStat, Stars } from './CocBits';

/**
 * The Battles section on the Clash of Clans home screen.
 *
 * Clash of Clans publishes no battle log. The Royale equivalent of this screen
 * reads `/players/{tag}/battlelog`; there is no such endpoint here, and the
 * clan war log carries clan totals with no `members` array, so finished wars
 * cannot be attributed to a player at all.
 *
 * What is attributable is the clan's **current war** and, during a league
 * week, each **Clan War League war** -- both list every member's attacks by
 * defender tag. This section is built from those and nothing else, and says
 * as much rather than implying the list is a complete history.
 *
 * The league half is up to 28 extra requests (`useLeagueWars`), so it is only
 * asked for once the group says the clan is in a league, and the whole section
 * is skipped for a player with no clan.
 */

const ROLES: Chip[] = [
  { id: 'all', label: 'All' },
  { id: 'attack', label: 'Attacks' },
  { id: 'defence', label: 'Defences' },
];

export function CocBattles({ player }: { player: ApiRecord }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const tag = text(player['tag']);
  const clanTag = text(record(player['clan'])['tag']);
  const enabled = clanTag !== '—';

  const war = useQuery({
    ...gameQuery({ game: 'coc', resource: 'war', tag: clanTag }),
    enabled,
  });
  const group = useQuery({
    ...gameQuery({ game: 'coc', resource: 'leagueGroup', tag: clanTag }),
    enabled,
  });

  const currentWar = parseWar(war.data);
  const rawGroup = parse(group.data);
  // The 28 league wars are only worth fetching if this player is on one of
  // the rosters the group already published. Most members are not.
  const leagueGroup = inLeagueGroup(rawGroup, tag) ? rawGroup : undefined;
  const { warsByTag, loading: leagueLoading } = useLeagueWars(leagueGroup);

  const battles = useMemo(() => {
    const out: WarBattle[] = [];
    // Rank 1000 keeps the live war above every league round regardless of how
    // many rounds have been drawn.
    if (currentWar) out.push(...warBattlesFor(currentWar, tag, 'Current war', 1000));
    if (leagueGroup) {
      for (const round of buildRounds(leagueGroup, warsByTag)) {
        for (const w of round.wars) {
          out.push(...warBattlesFor(w, tag, `War league · round ${round.index + 1}`, round.index));
        }
      }
    }
    return sortWarBattles(out);
  }, [currentWar, leagueGroup, warsByTag, tag]);

  const [role, setRole] = useState('all');
  const filtered = useMemo(
    () => battles.filter((b) => role === 'all' || b.role === role),
    [battles, role],
  );
  const paged = usePaged(filtered, role);

  if (!enabled) return null;

  const summary = warBattleSummary(battles);
  const roleChips: Chip[] = ROLES.map((chip) => ({
    ...chip,
    count:
      chip.id === 'all' ? battles.length : battles.filter((b) => b.role === chip.id).length,
  }));

  const loading = war.isFetching || group.isFetching || leagueLoading;
  // A clan with a private war log answers 403 here; not in a league answers
  // 404. Neither is an outage, and neither should read as one.
  const warDenied = war.data && !war.data.ok && war.data.status === 403;

  return (
    <Panel>
      <Text style={s.sectionTitle}>Battles</Text>

      {battles.length > 0 && (
        <View style={s.statGrid}>
          <SmallStat label="War attacks" value={summary.attacks} icon="Barbarian" />
          <SmallStat label="Stars taken" value={summary.starsFor} icon="star" />
          <SmallStat
            label="Average destruction"
            value={
              summary.destructionFor === null ? '—' : `${summary.destructionFor.toFixed(1)}%`
            }
            icon="Wall Wrecker"
          />
          <SmallStat label="Three-star attacks" value={summary.threeStars} icon="trophy" />
          <SmallStat label="Defences faced" value={summary.defences} icon="Cannon" />
          <SmallStat label="Stars conceded" value={summary.starsAgainst} icon="Archer Tower" />
        </View>
      )}

      {battles.length > 0 && (
        <ChipRow
          chips={roleChips}
          value={role}
          onChange={setRole}
          accessibilityLabel="Filter war battles"
        />
      )}

      {loading && !battles.length ? (
        <Text accessibilityRole="alert" style={s.note}>
          Reading the war boards…
        </Text>
      ) : null}

      {!loading && !battles.length ? (
        <Text style={s.note}>
          {warDenied
            ? 'This clan keeps its war log private, so the API will not say who attacked whom.'
            : 'No attacks to show. This player has not attacked in the current war, and is not in a league war that has started.'}
        </Text>
      ) : null}

      {paged.shown.map((battle, i) => (
        <BattleRow key={`${battle.warLabel}-${battle.role}-${battle.order}-${i}`} battle={battle} />
      ))}

      <LoadMore
        remaining={paged.remaining}
        onPress={paged.loadMore}
        noun="attacks"
        style={s.more}
      />

      <Text style={s.derived}>
        Clash of Clans publishes no battle log. These are war attacks only — the current war plus
        any Clan War League wars this season — because the clan war log carries clan totals with
        no per-member attacks, and multiplayer raids are not exposed at all.
      </Text>
    </Panel>
  );
}

/** One attack or defence: a result line that opens in place. */
function BattleRow({ battle }: { battle: WarBattle }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { click } = useHub();
  const { openPlayer } = useDetailSheet();
  const [open, setOpen] = useState(false);

  const attacking = battle.role === 'attack';
  const title = attacking
    ? `Attacked ${battle.otherName}`
    : `Defended against ${battle.otherName}`;
  const meta = [
    battle.warLabel,
    battle.otherPosition !== '—' ? `#${battle.otherPosition}` : null,
    battle.otherTownHall ? `TH${battle.otherTownHall}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <View style={s.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'hide' : 'show'} details`}
        onPress={() => {
          click();
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [s.rowHead, pressed && s.pressed]}
      >
        {/* Clash Book art rather than a glyph: the fan-kit faces have no
            sword or shield, and an emoji is a platform-font lottery. */}
        <Art name={attacking ? 'Barbarian' : 'Cannon'} size={28} />
        <View style={s.rowBody}>
          <Text style={s.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.rowMeta} numberOfLines={2}>
            {meta}
          </Text>
        </View>
        <View style={s.rowScore}>
          <Stars count={battle.stars} size={12} />
          <Text style={s.percent}>{battle.destruction}%</Text>
        </View>
        <Text style={s.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>

      {open ? (
        <View style={s.detail}>
          <DetailLine label={attacking ? 'Defender' : 'Attacker'} value={battle.otherName} />
          <DetailLine label="Their tag" value={battle.otherTag} />
          <DetailLine
            label="Their base"
            value={`Map position ${battle.otherPosition}${
              battle.otherTownHall ? ` · Town Hall ${battle.otherTownHall}` : ''
            }`}
          />
          <DetailLine label="Their clan" value={battle.otherClanName} />
          <DetailLine
            label="Your base"
            value={`Map position ${battle.myPosition}${
              battle.myTownHall ? ` · Town Hall ${battle.myTownHall}` : ''
            }`}
          />
          <DetailLine label="Stars" value={`${battle.stars} of 3`} />
          <DetailLine label="Destruction" value={`${battle.destruction}%`} />
          <DetailLine label="Attack length" value={clockDuration(battle.duration)} />
          <DetailLine label="Attack order" value={`#${battle.order} in the war`} />
          <DetailLine label="War" value={`${battle.warLabel} · ${battle.warState}`} />
          <Button
            variant="outline"
            size="sm"
            style={s.more}
            onPress={() => openPlayer(battle.otherTag, 'coc')}
          >
            {`View ${battle.otherName}`}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.detailLine}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function parse(result: GameResult | undefined): ApiRecord | undefined {
  if (!result?.ok) return undefined;
  try {
    return record(JSON.parse(result.data));
  } catch {
    return undefined;
  }
}

/**
 * A war, or undefined when there is no war to read.
 *
 * `/currentwar` answers **200 with `state: notInWar`** rather than a 404 --
 * for a clan between wars, and also for one that is in CWL, where the real
 * wars live behind the league group instead. Neither carries a roster, so the
 * roster is what this tests. The league group itself must not come through
 * here: it has `clans` and `rounds` and no `clan` at all, and an earlier
 * version of this function silently dropped it.
 */
function parseWar(result: GameResult | undefined): ApiRecord | undefined {
  const war = parse(result);
  if (!war) return undefined;
  return rows(record(war['clan'])['members']).length ? war : undefined;
}

const build = (t: Theme) =>
  StyleSheet.create({
    sectionTitle: {
      fontFamily: t.fonts.display,
      fontSize: 16,
      color: t.foreground,
      marginBottom: 12,
    },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    note: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 20,
      paddingVertical: 10,
      color: t.mutedForeground,
    },
    more: { marginTop: 12, alignSelf: 'flex-start' },
    pressed: { opacity: 0.75 },

    row: {
      marginTop: 8,
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      overflow: 'hidden',
    },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    rowMeta: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
      color: t.mutedForeground,
    },
    rowScore: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
    percent: { fontFamily: t.fonts.display, fontSize: 11, color: t.foreground },
    chevron: { fontFamily: t.fonts.sans, fontSize: 13, color: t.cocHighlight, flexShrink: 0 },

    detail: {
      paddingHorizontal: 10,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    detailLine: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      paddingTop: 8,
    },
    detailLabel: { fontFamily: t.fonts.sans, fontSize: 10, color: t.mutedForeground },
    detailValue: {
      fontFamily: t.fonts.display,
      fontSize: 11,
      color: t.foreground,
      flexShrink: 1,
      textAlign: 'right',
    },

    derived: {
      fontFamily: t.fonts.sans,
      fontSize: 10,
      lineHeight: 17,
      marginTop: 16,
      color: t.mutedForeground,
    },
  });
