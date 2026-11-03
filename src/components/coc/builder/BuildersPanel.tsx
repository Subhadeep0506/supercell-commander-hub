import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Upgrade, VillageSide } from '@/lib/village-export';
import { laneOf, upgradeDuration } from '@/lib/village-plan';
import { Panel } from '@/components/ui/Panel';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ItemTile, briefDuration, clockLabel, remainingLabel, useNow } from './BuilderBits';

/**
 * What every builder and the Laboratory are working on.
 *
 * The export records a *relative* timer, which the parser converts to an
 * absolute finish time -- so these countdowns stay honest across restarts, and
 * an upgrade that completed since the export reads "Done" rather than
 * counting into the negative.
 */
export function BuildersPanel({
  side,
  onOpenItem,
}: {
  side: VillageSide;
  onOpenItem: (catalogId: string, level: number) => void;
}) {
  const theme = useTheme();
  const s = useMemo(() => build(theme), [theme]);
  const now = useNow();

  const builderJobs = side.inProgress.filter((u) => laneOf(u.category) === 'builder');
  const labJobs = side.inProgress.filter((u) => laneOf(u.category) !== 'builder');
  const free = Math.max(0, side.builders - builderJobs.filter((u) => u.finishesAt > now).length);

  return (
    <Panel>
      <Text style={s.title}>Builders</Text>

      {side.inProgress.length === 0 ? (
        <Text style={s.idle}>Nothing was upgrading when you copied it.</Text>
      ) : null}

      {free > 0 && side.inProgress.length > 0 ? (
        <View style={s.free}>
          <Text style={s.freeTitle}>
            {free} builder{free === 1 ? '' : 's'} free
          </Text>
          <Text style={s.freeBody}>Start an upgrade in the game.</Text>
        </View>
      ) : null}

      {builderJobs.map((job, i) => (
        <Job key={`b${i}`} job={job} now={now} theme={theme} onOpen={onOpenItem} />
      ))}

      {labJobs.length ? (
        <>
          <Text style={s.lane}>Laboratory</Text>
          {labJobs.map((job, i) => (
            <Job key={`l${i}`} job={job} now={now} theme={theme} onOpen={onOpenItem} />
          ))}
        </>
      ) : null}

      <View style={s.status}>
        <ItemTile catalogId="home/builders-hut" size={30} />
        <Text style={s.statusText}>{free > 0 ? 'Ready' : 'All builders busy'}</Text>
      </View>
    </Panel>
  );
}

function Job({
  job,
  now,
  theme,
  onOpen,
}: {
  job: Upgrade;
  now: number;
  theme: Theme;
  onOpen: (catalogId: string, level: number) => void;
}) {
  const s = useMemo(() => build(theme), [theme]);
  const done = job.finishesAt <= now;
  // The export says how long is left, never how long the step was. The
  // catalog's duration for this exact level is what turns that into a
  // fraction -- otherwise the bar would be decoration.
  const total = upgradeDuration(job.catalogId, job.toLevel) * 1000;
  const elapsed = total > 0 ? Math.max(0, Math.min(1, 1 - (job.finishesAt - now) / total)) : 1;
  return (
    <View style={s.job}>
      <ItemTile
        catalogId={job.catalogId}
        level={job.fromLevel}
        size={40}
        onPress={() => onOpen(job.catalogId, job.fromLevel)}
        accessibilityLabel={`View ${job.name}`}
      />
      <View style={s.jobText}>
        <Text style={s.jobName} numberOfLines={1}>
          {job.name}
        </Text>
        <Text style={s.jobMeta} numberOfLines={1}>
          {job.fromLevel} → {job.toLevel} ·{' '}
          {done
            ? `Finished ${briefDuration(now - job.finishesAt)} ago`
            : clockLabel(job.finishesAt)}
        </Text>
        <View style={s.bar}>
          <View
            style={[s.barFill, done && s.barFillDone, { width: `${(done ? 1 : elapsed) * 100}%` }]}
          />
        </View>
      </View>
      <Text style={[s.jobRight, done && s.jobDone]}>{remainingLabel(job.finishesAt, now)}</Text>
    </View>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    title: { fontFamily: t.fonts.display, fontSize: 16, color: t.foreground },
    idle: { marginTop: 12, fontSize: 12, color: t.mutedForeground, fontFamily: t.fonts.sans },

    free: {
      marginTop: 12,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.border,
    },
    freeTitle: { fontFamily: t.fonts.display, fontSize: 13, color: t.primary },
    freeBody: { marginTop: 3, fontSize: 11, color: t.mutedForeground, fontFamily: t.fonts.sans },

    lane: { marginTop: 14, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },

    job: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    jobText: { flex: 1, minWidth: 0 },
    jobName: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    jobMeta: { marginTop: 2, fontSize: 10, color: t.mutedForeground, fontFamily: t.fonts.sans },
    bar: { height: 4, marginTop: 5, borderRadius: 999, backgroundColor: t.border, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: t.cocHighlight },
    barFillDone: { backgroundColor: t.success },
    jobRight: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
    jobDone: { color: t.success },

    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    statusText: { fontFamily: t.fonts.display, fontSize: 12, color: t.foreground },
  });
