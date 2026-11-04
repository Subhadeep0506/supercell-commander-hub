module.exports = {
  preset: '@react-native/jest-preset',

  // AsyncStorage is a native module, so under Jest every call throws
  // "Native module is null". state/storage.ts swallows that and reports a
  // miss, which is why rendering the app still works -- but it also means a
  // test of anything that *persists* would silently assert against nothing.
  // The package ships an in-memory mock for exactly this.
  setupFiles: ['<rootDir>/jest.setup.js'],

  // `@/...` is resolved by babel-plugin-module-resolver for Metro, but Jest
  // resolves modules itself and never consults that plugin.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Several dependencies ship ESM only -- @react-navigation's `lib/module`
  // build is `export {...}` source. Jest does not transform node_modules by
  // default, so requiring App.tsx died on an unexpected `export` token before
  // a single assertion ran. The preset's own pattern covers react-native but
  // not these.
  transformIgnorePatterns: [
    'node_modules/(?!(?:' +
      [
        '@react-native',
        'react-native',
        '@react-navigation',
        'react-native-safe-area-context',
        'react-native-screens',
        'react-native-svg',
        '@react-native-async-storage',
      ].join('|') +
      ')/)',
  ],
};
