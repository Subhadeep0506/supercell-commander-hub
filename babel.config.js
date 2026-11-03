module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
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
