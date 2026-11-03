module.exports = {
  preset: '@react-native/jest-preset',

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
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
