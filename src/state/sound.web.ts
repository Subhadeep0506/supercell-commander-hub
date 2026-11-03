export type Tone = 'tap' | 'ok' | 'err';

/**
 * Browser target: the Web Audio oscillator from lib/hub.tsx, unchanged.
 *
 * The AudioContext is created lazily because browsers refuse to start one
 * before a user gesture.
 */
let audio: AudioContext | null = null;

export function beep(tone: Tone): void {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'square';
    const f: [number, number] = tone === 'ok' ? [660, 990] : tone === 'err' ? [220, 140] : [520, 520];
    o.frequency.setValueAtTime(f[0], audio.currentTime);
    o.frequency.linearRampToValueAtTime(f[1], audio.currentTime + 0.08);
    g.gain.setValueAtTime(0.05, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.13);
  } catch {
    /* ignore */
  }
}
