module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Supercell API responses are Record<string, unknown>, and the TypeScript
    // config forbids dot access on an index signature. Bracket notation is
    // required here, not a style choice -- the reference app reads the same
    // fields the same way.
    'dot-notation': 'off',
    // `void somePromise()` is the explicit marker for a deliberately
    // unawaited call (storage writes, refetches). Flagging it would push the
    // code towards silently floating promises instead.
    'no-void': 'off',
    // Collapsible takes `summary` as a render prop so callers can draw their
    // own chevron and count. That is a prop, not a nested component.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
  ignorePatterns: ['src/assets/registry.*.ts', 'src/config/keys.ts', 'dist-web/', '.shots/'],
};
