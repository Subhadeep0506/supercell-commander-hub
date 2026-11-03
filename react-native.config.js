/**
 * No `assets` entry on purpose.
 *
 * scripts/build-assets.mjs copies the fonts straight into
 * android/app/src/main/assets/fonts/, which Gradle packages as-is. Listing
 * them here too would mean `npx react-native-asset` writes a second copy under
 * a different filename -- and on Android the filename is the font family name,
 * so that would silently give two families for the same typeface.
 */
module.exports = {
  project: {
    android: {},
  },
};
