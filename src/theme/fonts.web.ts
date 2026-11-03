import clashBold from '@/assets/fonts/Clash-Bold.otf';
import clashRegular from '@/assets/fonts/Clash-Regular.otf';
import lilitaOne from '@/assets/fonts/LilitaOne.ttf';

/**
 * Browser target: register the bundled fan-kit fonts as @font-face.
 *
 * The family names match the ones styles.css uses, so tokens.ts can name the
 * same families on both platforms. Lilita One is only used by the Brawl Stars
 * skin; it is registered now so that skin needs no extra wiring later.
 */
const FACES = [
  { family: 'Clash Display', url: clashBold, format: 'opentype' },
  { family: 'Clash Regular', url: clashRegular, format: 'opentype' },
  { family: 'Fan Kit Lilita', url: lilitaOne, format: 'truetype' },
];

let done = false;

export function registerFonts(): void {
  if (done || typeof document === 'undefined') return;
  done = true;

  const style = document.createElement('style');
  style.id = 'fan-kit-fonts';
  style.textContent = FACES.map(
    ({ family, url, format }) =>
      `@font-face{font-family:"${family}";src:url("${url}") format("${format}");font-display:swap;}`,
  ).join('\n');
  document.head.appendChild(style);
}
