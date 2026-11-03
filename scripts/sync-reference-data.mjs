// Copies the Clash Book reference data out of the TanStack app into src/data/.
//
//   node scripts/sync-reference-data.mjs
//
// Two files come across:
//
//   catalog.json     the community item reference, bundled as-is
//   art-titles.json  { itemId: fanKitTitle } distilled from the fan-kit
//                    provenance file. The titles exist for exactly one reason:
//                    styles.css scales portraits whose artwork title ends in
//                    "_face" by 2.8x, and there is no attribute-selector
//                    equivalent in React Native.
//
// The original provenance.json also holds Lovable CDN URLs, which are dead
// here, so only the titles are carried over.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REF = resolve(root, '../../frontend/src');
const OUT = resolve(root, 'src/data/clash-book');

mkdirSync(OUT, { recursive: true });

copyFileSync(resolve(REF, 'data/clash-book/catalog.json'), resolve(OUT, 'catalog.json'));
copyFileSync(resolve(REF, 'data/clash-book/LICENSE'), resolve(OUT, 'LICENSE'));

const provenance = JSON.parse(
  readFileSync(resolve(REF, 'assets/fankit/coc-book/provenance.json'), 'utf8'),
);
const titles = Object.fromEntries(
  Object.entries(provenance)
    .map(([id, entry]) => [id, entry.title])
    .filter(([, title]) => typeof title === 'string'),
);
writeFileSync(resolve(OUT, 'art-titles.json'), `${JSON.stringify(titles, null, 2)}\n`);

const catalog = JSON.parse(readFileSync(resolve(OUT, 'catalog.json'), 'utf8'));
const faces = Object.values(titles).filter((t) => t.endsWith('_face')).length;
console.log(
  `reference data: ${catalog.length} catalog items, ${Object.keys(titles).length} art titles (${faces} face crops)`,
);
