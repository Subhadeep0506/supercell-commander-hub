import type { VillageImport } from './village-export';

/**
 * Browser target: notifications do not exist here.
 *
 * The native module behind `notifications.ts` is `@notifee/react-native`,
 * which has no web build at all -- importing it into the vite bundle fails the
 * build outright. So this file matches its surface and does nothing, the same
 * split `state/sound.ts` / `sound.web.ts` and `api/base.ts` / `base.web.ts`
 * already use. Vite resolves `.web.ts` ahead of `.ts`, so callers import
 * `@/lib/notifications` and never learn which one they got.
 *
 * **Not a stub waiting to be filled in.** The Web Notifications API could post
 * a message, but it cannot schedule one for a timestamp hours away without a
 * service worker and a push subscription -- and the thing being scheduled is a
 * builder timer that exists only inside an APK on a phone. Pretending
 * otherwise here would make the browser look like it supported a feature that
 * silently never fires.
 */

/** Always false: there is no permission worth asking for. */
export async function ensurePermission(): Promise<boolean> {
  return false;
}

export async function cancelBuilderJobs(): Promise<void> {
  // Nothing was ever scheduled.
}

/** Returns 0 scheduled, so callers reporting a count stay truthful. */
export async function scheduleBuilderJobs(_village?: VillageImport): Promise<number> {
  return 0;
}
