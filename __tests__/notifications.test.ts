import notifee from '@notifee/react-native';
import { cancelBuilderJobs, scheduleBuilderJobs } from '@/lib/notifications';
import type { Upgrade, VillageImport, VillageSide } from '@/lib/village-export';

/*
 * Builder notification scheduling.
 *
 * The rule under test is the one that cannot be seen on screen and would be
 * discovered by a user as a burst of wrong notifications: a village export
 * freezes its timers at the moment it was copied, so every job in a day-old
 * import has already finished. Scheduling those would fire a handful of
 * "finishes in a minute" alerts for upgrades that completed yesterday.
 *
 * notifee itself is mocked globally in jest.setup.js with the mock the package
 * ships, whose methods are jest.fn() -- so the calls are assertable without a
 * device.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const job = (name: string, finishesAt: number): Upgrade => ({
  catalogId: `home/${name}`,
  name,
  category: 'defense',
  fromLevel: 1,
  toLevel: 2,
  finishesAt,
});

const side = (base: 'home' | 'builder', inProgress: Upgrade[]): VillageSide => ({
  base,
  hallLevel: 16,
  builders: 6,
  helpers: [],
  owned: [],
  inProgress,
});

const village = (home: Upgrade[], builder: Upgrade[] = []): VillageImport => ({
  tag: '#ABC',
  exportedAt: Date.now(),
  importedAt: Date.now(),
  home: side('home', home),
  builder: side('builder', builder),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('scheduleBuilderJobs', () => {
  it('schedules one trigger per unfinished job, a minute before it lands', async () => {
    const finishesAt = Date.now() + 2 * HOUR;
    const count = await scheduleBuilderJobs(village([job('Cannon', finishesAt)]));

    expect(count).toBe(1);
    expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(1);

    const [notification, trigger] = (notifee.createTriggerNotification as jest.Mock).mock
      .calls[0] as [{ id: string; title: string }, { timestamp: number }];
    expect(trigger.timestamp).toBe(finishesAt - MINUTE);
    expect(notification.title).toContain('Cannon');
    // Deterministic id, so re-importing the same village replaces the trigger
    // rather than stacking a second copy of it.
    expect(notification.id).toBe(`builder:Home Village:home/Cannon:${finishesAt}`);
  });

  it('skips jobs whose lead time has already passed', async () => {
    const count = await scheduleBuilderJobs(
      village([
        job('Finished Yesterday', Date.now() - 24 * HOUR),
        // Inside the one-minute lead: the notification would be for a moment
        // that has already gone, so it is dropped too.
        job('Finishing Right Now', Date.now() + 10_000),
        job('Still Going', Date.now() + HOUR),
      ]),
    );

    expect(count).toBe(1);
    expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notification] = (notifee.createTriggerNotification as jest.Mock).mock.calls[0] as [
      { title: string },
    ];
    expect(notification.title).toContain('Still Going');
  });

  it('schedules nothing at all for a wholly stale import', async () => {
    const count = await scheduleBuilderJobs(
      village([job('Cannon', Date.now() - HOUR), job('Archer Tower', Date.now() - 2 * HOUR)]),
    );

    expect(count).toBe(0);
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('covers both villages, not just the home one', async () => {
    const count = await scheduleBuilderJobs(
      village([job('Cannon', Date.now() + HOUR)], [job('Double Cannon', Date.now() + 2 * HOUR)]),
    );

    expect(count).toBe(2);
    const bases = (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
      (call) => (call[0] as { id: string }).id,
    );
    expect(bases.some((id) => id.includes('Home Village'))).toBe(true);
    expect(bases.some((id) => id.includes('Builder Base'))).toBe(true);
  });

  it('names the other running jobs in the body', async () => {
    await scheduleBuilderJobs(
      village([
        job('Cannon', Date.now() + HOUR),
        job('Archer Tower', Date.now() + 2 * HOUR),
        job('Wizard Tower', Date.now() + 3 * HOUR),
      ]),
    );

    const [first] = (notifee.createTriggerNotification as jest.Mock).mock.calls[0] as [
      { body: string },
    ];
    expect(first.body).toContain('Archer Tower');
    expect(first.body).toContain('Wizard Tower');
  });

  it('says so when a job is the only one running', async () => {
    await scheduleBuilderJobs(village([job('Cannon', Date.now() + HOUR)]));
    const [only] = (notifee.createTriggerNotification as jest.Mock).mock.calls[0] as [
      { body: string },
    ];
    expect(only.body).toContain('Nothing else is upgrading');
  });

  it('leaves triggers it does not own alone when rescheduling', async () => {
    // The mock reports two pre-existing trigger ids, neither carrying our
    // prefix. Cancelling indiscriminately here would delete another app's
    // scheduled notifications.
    await scheduleBuilderJobs(village([job('Cannon', Date.now() + HOUR)]));
    expect(notifee.cancelTriggerNotifications).not.toHaveBeenCalled();
  });

  it('cancels everything and schedules nothing when the village is cleared', async () => {
    const count = await scheduleBuilderJobs(undefined);
    expect(count).toBe(0);
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });
});

describe('cancelBuilderJobs', () => {
  it('only cancels triggers this app owns', async () => {
    (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValueOnce([
      'builder:Home Village:home/Cannon:123',
      'someone-elses-notification',
    ]);

    await cancelBuilderJobs();

    expect(notifee.cancelTriggerNotifications).toHaveBeenCalledWith([
      'builder:Home Village:home/Cannon:123',
    ]);
  });
});
