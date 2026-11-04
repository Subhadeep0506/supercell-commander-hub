// AsyncStorage has no native module under Jest; this is the in-memory stand-in
// the package ships for tests. Without it every read is a miss and every write
// is dropped -- quietly, because state/storage.ts treats storage errors as
// "nothing saved".
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
