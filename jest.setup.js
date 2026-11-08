// AsyncStorage has no native module under Jest; this is the in-memory stand-in
// the package ships for tests. Without it every read is a miss and every write
// is dropped -- quietly, because state/storage.ts treats storage errors as
// "nothing saved".
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

// Notifee is a native module too, and HubProvider reaches it through
// lib/notifications.ts on import -- so without this, five suites that only
// wanted to render a screen died on "Notifee native module not found" before
// a single assertion ran. The package ships this mock for the purpose.
//
// Note this is the *native* path, not notifications.web.ts: Jest resolves
// plain `.ts` like Metro does, so tests exercise the same module the APK runs.
jest.mock('@notifee/react-native', () => require('@notifee/react-native/jest-mock'));
