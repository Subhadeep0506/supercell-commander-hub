module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // zod's package exports send Metro to its ESM build, whose first line is
    // `export * as core from "../core/index.js"`. The React Native preset does
    // not enable that transform, so the release bundle dies on a node_modules
    // file with "Export namespace should be first transformed by
    // @babel/plugin-transform-export-namespace-from".
    //
    // Only the release build hits it: debuggable variants skip the bundling
    // task entirely and load from Metro at runtime, which is why `bun run web`
    // and the dev builds never showed it.
    '@babel/plugin-transform-export-namespace-from',
    // Metro cannot resolve a bare "@/..." specifier on its own -- it reads the
    // leading @ as a package scope. Vite handles the same alias in its own
    // resolve.alias, and @vitejs/plugin-react does not read this file.
    [
      'module-resolver',
      {
        root: ['./'],
        alias: { '@': './src' },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
  ],
};
