// Metro resolves an image import to an opaque asset id (a number); Vite
// resolves it to a URL string. Both are accepted by <Image source>, so the
// shared type is ImageSourcePropType.
declare module '*.webp' {
  const value: import('react-native').ImageSourcePropType;
  export default value;
}

declare module '*.png' {
  const value: import('react-native').ImageSourcePropType;
  export default value;
}

// Fonts are only imported by theme/fonts.web.ts, where the bundler hands back
// a URL for the @font-face rule. On native they are linked at build time by
// react-native.config.js and never imported.
declare module '*.otf' {
  const url: string;
  export default url;
}

declare module '*.ttf' {
  const url: string;
  export default url;
}
