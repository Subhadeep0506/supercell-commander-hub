/**
 * Native target: fonts are copied into the Android project at build time by
 * react-native.config.js, so there is nothing to register at runtime.
 *
 * The browser target uses fonts.web.ts, which injects @font-face rules.
 */
export function registerFonts(): void {}
