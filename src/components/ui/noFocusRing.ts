import type { TextStyle } from 'react-native';

/**
 * Native: nothing to do.
 *
 * react-native-web draws a browser focus ring on inputs that the reference
 * stylesheet turns off (`.book-search input { outline: none }`), so the web
 * build overrides this with `outlineStyle: 'none'` -- a CSS property React
 * Native's types do not know about.
 */
export const noFocusRing: TextStyle = {};
