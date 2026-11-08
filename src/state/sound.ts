export type Tone = 'tap' | 'ok' | 'err';

/**
 * Native target: no-op for now.
 *
 * The reference app's click sound is a Web Audio oscillator, which has no
 * React Native equivalent. Replacing it means bundling three short audio files
 * and playing them through a native module -- deferred, because nothing can be
 * heard on the browser-only test surface this phase targets.
 *
 * The browser target uses sound.web.ts, which keeps the original oscillator.
 */
export function beep(_tone: Tone): void {}
