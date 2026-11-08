import notifee, {
  AlarmType,
  AndroidImportance,
  AuthorizationStatus,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';
import type { Upgrade, VillageImport, VillageSide } from './village-export';

/**
 * Local notifications for builder and Laboratory timers.
 *
 * **What the app can and cannot know.** Supercell's player API returns no
 * construction timers for anyone -- not an endpoint we are missing, it simply
 * is not published. The only source is a village export the player copies out
 * of the game and pastes into the Builder screen, parsed in village-export.ts
 * into `Upgrade { finishesAt }` as `exportedAt + timer * 1000`.
 *
 * Two consequences that run through everything below:
 *
 *  - **Timers freeze at copy time.** An import from yesterday describes a
 *    village that has moved on, so every trigger in it is in the past and must
 *    be dropped rather than fired. Scheduling is therefore only ever as fresh
 *    as the last paste, and BuildersPanel says so when an import ages out.
 *  - **A re-import replaces the schedule.** There is no merging to do: the new
 *    export is the truth, so the old triggers are cancelled wholesale.
 *
 * There is a parallel `notifications.web.ts` that no-ops all of this. Nothing
 * outside this module imports notifee, so the browser bundle never sees it.
 */

/** Everything this module schedules is prefixed, so nothing else is cancelled. */
const PREFIX = 'builder:';
const CHANNEL = 'builder';
/** How long before a job finishes the notification lands. */
const LEAD_MS = 60_000;

/**
 * Asks for notification permission.
 *
 * Android 13+ needs this at runtime; below that it resolves granted without a
 * prompt. Returns whether notifications can actually be posted, so a caller
 * can avoid scheduling work that would be silently dropped.
 */
export async function ensurePermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus !== AuthorizationStatus.DENIED;
}

/** Drops every trigger this module owns, leaving any other app alone. */
export async function cancelBuilderJobs(): Promise<void> {
  const ids = await notifee.getTriggerNotificationIds();
  const ours = ids.filter((id) => id.startsWith(PREFIX));
  if (ours.length) await notifee.cancelTriggerNotifications(ours);
}

/**
 * Replaces the whole schedule from a freshly imported village.
 *
 * Passing `undefined` -- which is what clearing the village does -- cancels
 * everything and schedules nothing.
 */
export async function scheduleBuilderJobs(village?: VillageImport): Promise<number> {
  await cancelBuilderJobs();
  if (!village) return 0;
  if (!(await ensurePermission())) return 0;

  await notifee.createChannel({
    id: CHANNEL,
    name: 'Builder timers',
    // HIGH, not DEFAULT: the whole value of this is a heads-up a minute before
    // a builder frees, which is useless if it waits silently in the shade.
    importance: AndroidImportance.HIGH,
  });

  const jobs = [
    ...tagged(village.home, 'Home Village'),
    ...tagged(village.builder, 'Builder Base'),
  ];

  const now = Date.now();
  // Anything whose lead time has already passed. Scheduling these would fire a
  // burst of stale notifications the moment a day-old export was re-opened.
  const pending = jobs
    .filter((job) => job.upgrade.finishesAt - LEAD_MS > now)
    .sort((a, b) => a.upgrade.finishesAt - b.upgrade.finishesAt);

  for (const job of pending) {
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: job.upgrade.finishesAt - LEAD_MS,
      // Exact, because "one minute before" is the entire promise. An inexact
      // alarm on Android 14 can drift by several minutes, by which time the
      // upgrade has finished and the notification is a lie. Paid for with
      // USE_EXACT_ALARM in the manifest.
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
    };

    await notifee.createTriggerNotification(
      {
        // Deterministic, so re-importing an unchanged village replaces each
        // trigger rather than stacking a second copy of it.
        id: `${PREFIX}${job.base}:${job.upgrade.catalogId}:${job.upgrade.finishesAt}`,
        title: `${job.upgrade.name} finishes in a minute`,
        body: bodyFor(job, pending),
        android: { channelId: CHANNEL, pressAction: { id: 'default' }, smallIcon: 'ic_launcher' },
      },
      trigger,
    );
  }

  return pending.length;
}

type Job = { base: string; upgrade: Upgrade };

function tagged(side: VillageSide, base: string): Job[] {
  return side.inProgress.map((upgrade) => ({ base, upgrade }));
}

/**
 * The line under the title: what else is still running.
 *
 * Requested explicitly -- one job finishing is rarely the whole picture, and
 * opening the game to find three other things also done is the situation this
 * is meant to prevent. Capped at three so the notification stays one glance;
 * Android collapses anything longer anyway.
 */
function bodyFor(job: Job, all: Job[]): string {
  const others = all.filter((other) => other !== job);
  const where = `${job.base} · ${job.upgrade.fromLevel} → ${job.upgrade.toLevel}`;
  if (!others.length) return `${where}. Nothing else is upgrading.`;
  const names = others.slice(0, 3).map((other) => other.upgrade.name);
  const rest = others.length - names.length;
  const list = names.join(', ') + (rest > 0 ? ` and ${rest} more` : '');
  return `${where}. Still running: ${list}.`;
}
