import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { gameQuery } from '@/api/queries';
import { record, text } from '@/api/game-api';
import { num } from '@/components/cr/CrBits';
import { townHallArt } from '@/assets/art';
import { arenaBadgeArt } from '@/assets/royale';
import { Button } from '@/components/ui/Button';
import { useHub, type Passport } from '@/state/HubProvider';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/**
 * The saved passports, one row each.
 *
 * Every row resolves its own account live, which is the only way to show what
 * the user actually asked for -- a Town Hall level and an arena are not in the
 * passport, they are in the player profile. Two requests per row, and
 * react-query dedupes the active one against whatever the game screens have
 * already fetched.
 *
 * Brawl Stars is listed as a tag and nothing more: it has no screens yet, and
 * bsproxy is blocked on this network, so a request for it would fail on every
 * render of this screen and tell the user nothing.
 */
export function PassportList({
  onEdit,
  onDelete,
}: {
  onEdit: (p: Passport) => void;
  onDelete: (p: Passport) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const { passports, passport, activatePassport } = useHub();

  if (!passports.length) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>No passports yet</Text>
        <Text style={s.emptyBody}>
          Save one above. You can keep several — one per account — and switch between them with
          the tick.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.list}>
      {passports.map((entry) => (
        <PassportRow
          key={entry.id}
          entry={entry}
          active={entry.id === passport.id}
          onActivate={() => activatePassport(entry.id)}
          onEdit={() => onEdit(entry)}
          onDelete={() => onDelete(entry)}
        />
      ))}
    </View>
  );
}

function PassportRow({
  entry,
  active,
  onActivate,
  onEdit,
  onDelete,
}: {
  entry: Passport;
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);

  const coc = useQuery({
    ...gameQuery({ game: 'coc', resource: 'player', tag: entry.coc }),
    enabled: Boolean(entry.coc),
  });
  const cr = useQuery({
    ...gameQuery({ game: 'cr', resource: 'player', tag: entry.cr }),
    enabled: Boolean(entry.cr),
  });

  const cocPlayer = coc.data?.ok ? record(JSON.parse(coc.data.data)) : null;
  const crPlayer = cr.data?.ok ? record(JSON.parse(cr.data.data)) : null;

  return (
    <View style={[s.row, active && s.rowActive]}>
      <View style={s.rowHead}>
        <View style={s.rowName}>
          <Text style={s.name} numberOfLines={1}>
            {entry.name || 'Unnamed'}
          </Text>
          {active ? <Text style={s.activeChip}>ACTIVE</Text> : null}
        </View>

        <View style={s.rowActions}>
          {/*
            The tick is the primary action and reads as a state, so it stays
            visible once set rather than disappearing on the active row --
            a row with two buttons where its neighbours have three is harder
            to scan than one with a filled tick.
          */}
          <Button
            variant={active ? 'default' : 'outline'}
            size="icon"
            accessibilityLabel={active ? `${entry.name} is active` : `Use ${entry.name}`}
            disabled={active}
            onPress={onActivate}
          >
            ✓
          </Button>
          <Button
            variant="outline"
            size="icon"
            accessibilityLabel={`Edit ${entry.name}`}
            onPress={onEdit}
          >
            ✎
          </Button>
          <Button
            variant="destructive"
            size="icon"
            accessibilityLabel={`Delete ${entry.name}`}
            onPress={onDelete}
          >
            ×
          </Button>
        </View>
      </View>

      <View style={s.games}>
        <GameLine
          label="Clash of Clans"
          tag={entry.coc}
          loading={coc.isFetching}
          failed={Boolean(coc.data && !coc.data.ok)}
          art={cocPlayer ? townHallArt(cocPlayer['townHallLevel']) : undefined}
          title={cocPlayer ? text(cocPlayer['name']) : ''}
          detail={
            cocPlayer
              ? `Town Hall ${text(cocPlayer['townHallLevel'])} · ${num(cocPlayer['trophies'])} trophies`
              : ''
          }
        />
        <GameLine
          label="Clash Royale"
          tag={entry.cr}
          loading={cr.isFetching}
          failed={Boolean(cr.data && !cr.data.ok)}
          art={crPlayer ? arenaBadgeArt(record(crPlayer['arena'])['id']) : undefined}
          title={crPlayer ? text(crPlayer['name']) : ''}
          detail={
            crPlayer
              ? `${text(record(crPlayer['arena'])['name'])} · ${num(crPlayer['trophies'])} trophies`
              : ''
          }
        />
        {/* No live line: no Brawl Stars screens, and its proxy is blocked. */}
        {entry.bs ? (
          <View style={s.game}>
            <View style={s.gameArt} />
            <View style={s.gameText}>
              <Text style={s.gameLabel}>Brawl Stars</Text>
              <Text style={s.gameDetail} numberOfLines={1}>
                {entry.bs} · saved, no Brawl screens yet
              </Text>
            </View>
          </View>
        ) : null}

        {!entry.coc && !entry.cr && !entry.bs ? (
          <Text style={s.noTags}>No tags on this passport.</Text>
        ) : null}
      </View>
    </View>
  );
}

/** One game's line: art, the account's name, and what it resolved to. */
function GameLine({
  label,
  tag,
  loading,
  failed,
  art,
  title,
  detail,
}: {
  label: string;
  tag: string;
  loading: boolean;
  failed: boolean;
  art?: Parameters<typeof Image>[0]['source'];
  title: string;
  detail: string;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  if (!tag) return null;

  return (
    <View style={s.game}>
      <View style={s.gameArt}>
        {art ? (
          <Image
            source={art}
            style={s.gameIcon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <View style={s.gameText}>
        <Text style={s.gameLabel}>{label}</Text>
        <Text style={s.gameDetail} numberOfLines={1}>
          {/*
            Four states, and they have to be told apart: a tag that has not
            resolved yet is not the same as one the service rejected, and
            neither is the same as a tag that simply is not saved.
          */}
          {detail || (loading ? 'Loading…' : failed ? `${tag} · not found` : tag)}
        </Text>
        {title ? (
          <Text style={s.gameName} numberOfLines={1}>
            {title} · {tag}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Asks before a delete. Tags are typed by hand and a mistap loses them. */
export function DeleteConfirm({
  entry,
  onCancel,
  onConfirm,
}: {
  entry: Passport;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  return (
    <View style={s.confirm}>
      <Text style={s.confirmTitle}>Delete “{entry.name || 'Unnamed'}”?</Text>
      <Text style={s.confirmBody}>
        Its tags are removed from this device. Nothing happens to the game accounts themselves.
      </Text>
      <View style={s.confirmBtns}>
        <Button variant="destructive" size="sm" accessibilityLabel="Confirm delete" onPress={onConfirm}>
          Delete
        </Button>
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    list: { gap: 10 },
    row: {
      padding: 12,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
      backgroundColor: t.card,
      gap: 10,
    },
    rowActive: { borderColor: t.primary },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowName: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { flexShrink: 1, fontFamily: t.fonts.display, fontSize: 16, color: t.cardForeground },
    activeChip: {
      fontFamily: t.fonts.display,
      fontSize: 9,
      letterSpacing: 0.6,
      color: t.primaryForeground,
      backgroundColor: t.primary,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: t.radius.sm,
      overflow: 'hidden',
    },
    rowActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },

    games: { gap: 8 },
    game: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    // A fixed box whether or not art resolved, so the three lines stay aligned
    // down their left edge.
    gameArt: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    gameIcon: { width: 34, height: 34 },
    gameText: { flex: 1, minWidth: 0 },
    gameLabel: { fontFamily: t.fonts.sans, fontSize: 9, color: t.mutedForeground },
    gameDetail: { fontFamily: t.fonts.display, fontSize: 12, marginTop: 2, color: t.foreground },
    gameName: { fontFamily: t.fonts.sans, fontSize: 9, marginTop: 2, color: t.mutedForeground },
    noTags: { fontFamily: t.fonts.sans, fontSize: 11, color: t.mutedForeground },

    empty: {
      paddingVertical: 24,
      paddingHorizontal: 12,
      borderWidth: 2,
      borderColor: t.border,
      borderRadius: t.radius.md,
      alignItems: 'center',
    },
    emptyTitle: { fontFamily: t.fonts.display, fontSize: 15, color: t.foreground },
    emptyBody: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 6,
      textAlign: 'center',
      color: t.mutedForeground,
    },

    confirm: { padding: 16, gap: 10 },
    confirmTitle: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    confirmBody: {
      fontFamily: t.fonts.sans,
      fontSize: 12,
      lineHeight: 19,
      color: t.mutedForeground,
    },
    confirmBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  });
