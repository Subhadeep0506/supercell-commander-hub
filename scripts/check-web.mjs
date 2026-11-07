// Loads the running dev server in headless Chrome, reports console errors,
// failed requests and the rendered text, and saves a screenshot.
//
// There is no USB access to a device, so the browser is the test surface --
// this is the harness that makes a change verifiable rather than assumed.
//
//   node scripts/check-web.mjs [path] [--shot name] [--wait ms] [--after ms]
//
// Examples:
//   node scripts/check-web.mjs /coc
//   node scripts/check-web.mjs /coc/book --shot book --wait 4000
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serveFixtures } from './fixture-route.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!CHROME) throw new Error('No Chrome or Edge found at the usual Windows paths');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
// Passed without a leading slash (`--path coc/book`): Git Bash on Windows
// rewrites a bare `/coc` argument into a filesystem path before node sees it.
const path = `/${(flag('path', '') ?? '').replace(/^\/+/, '')}`;
const wait = Number(flag('wait', 3500));
const shot = flag('shot', null);
const base = flag('base', 'http://localhost:5173');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=430,932'],
});

const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });

// `--scheme light` exercises the other half of the token table; the theme
// follows prefers-color-scheme, exactly as the reference stylesheet does.
const scheme = flag('scheme', 'dark');
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);

// `--fixture` answers the Clash of Clans proxy from scripts/fixtures instead
// of the network. cocproxy.royaleapi.dev is blocked here, so without this the
// village, clan, war and ranking screens can never be rendered for review.
if (argv.includes('--fixture')) await serveFixtures(page);

const errors = [];
const warnings = [];
const failed = [];
// Chrome always asks for a favicon we do not ship; that 404 is not a defect.
const NOISE = /favicon\.ico/;

page.on('console', (m) => {
  const entry = `${m.text()}`;
  if (NOISE.test(entry) || entry.includes('status of 404')) return;
  if (m.type() === 'error') errors.push(entry);
  else if (m.type() === 'warning') warnings.push(entry);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => {
  if (!NOISE.test(r.url())) failed.push(`${r.failure()?.errorText} ${r.url()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !NOISE.test(r.url())) failed.push(`HTTP ${r.status()} ${r.url()}`);
});

// `--click "View Laboratory"` presses the element with that aria-label after
// load, so modals and other interaction-only UI can be verified too. Repeat
// the flag to chain steps.
const clicks = argv.reduce((acc, a, i) => (a === '--click' ? [...acc, argv[i + 1]] : acc), []);

// `--tag #ABC` seeds the saved passport before the app boots, which is what
// every screen resolves its account from.
//
// `--game cr` puts the tag in the Royale slot *and* selects the Royale skin.
// Both matter. Without the first, the Royale screens render their "no account
// yet" finder whatever tag was passed. Without the second the whole settings
// blob is rewritten with no `game`, so it falls back to Clash of Clans -- and
// every Royale screenshot comes out in the wrong palette while looking
// perfectly plausible, because the layout is identical either way.
const seedTag = flag('tag', null);
const seedGame = flag('game', 'coc');
if (seedTag) {
  await page.evaluateOnNewDocument(
    (t, g) => {
      localStorage.setItem(
        'sch',
        JSON.stringify({
          game: g,
          passports: [{ id: 'seed', name: 'Test Chief', coc: '', cr: '', bs: '', [g]: t }],
          activeId: 'seed',
        }),
      );
    },
    seedTag,
    seedGame,
  );
}

const url = `${base}${path}`;
console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => {
  errors.push(`[navigation] ${e.message}`);
});
await new Promise((r) => setTimeout(r, wait));

/*
 * `--village` pastes the village-export fixture, the way a player would.
 *
 * The Builder Plan is driven entirely by that export -- the player API has no
 * upgrade timers, no building levels and no Builder Base troops -- so without
 * this the screen can only ever be screenshotted in its empty state, which is
 * exactly what happened the first time the plan timeline needed reviewing.
 */
if (argv.includes('--village')) {
  const importFlow = async (label) => {
    const handle = await page.evaluateHandle((l) => {
      const el = [...document.querySelectorAll('[aria-label]')].find(
        (n) => n.getAttribute('aria-label') === l && n.getClientRects().length > 0,
      );
      el?.scrollIntoView({ block: 'center' });
      return el ?? null;
    }, label);
    const el = handle.asElement();
    if (!el) {
      errors.push(`[village] no visible element with aria-label "${label}"`);
      return false;
    }
    await el.click();
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  };

  if (await importFlow('Import village data now')) {
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/coc-village-export.json'),
        'utf8',
      ),
    );
    /*
     * The capture time is moved to now before pasting.
     *
     * The fixture's own `timestamp` is fixed, and the parser turns each
     * relative `timer` into `timestamp + timer` -- so a fixture a few days old
     * has every in-progress upgrade already finished, and the Builder Plan can
     * only ever be screenshotted with nothing running. The timers themselves
     * are what is under review; when the export was taken is incidental.
     *
     * check-screens.mjs deliberately pastes it unshifted: its assertions are
     * about parsing, and a frozen input is what makes them repeatable.
     */
    raw.timestamp = Math.floor(Date.now() / 1000);
    const exported = JSON.stringify(raw);
    await page.evaluate((json) => {
      const field = [...document.querySelectorAll('[aria-label]')].find(
        (n) => n.getAttribute('aria-label') === 'Village export JSON',
      );
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(field, json);
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    }, exported);
    await new Promise((r) => setTimeout(r, 600));
    await importFlow('Import pasted data');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

for (const label of clicks) {
  const handle = await page.evaluateHandle((l) => {
    // Visible only, and scrolled into view before returning. The detail sheet
    // keeps every layer of its back-stack mounted (hidden with display:none),
    // so a plain querySelector finds the copy on a buried layer first -- which
    // is not clickable, and is not what a user would be touching either.
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (n) => n.getAttribute('aria-label') === l && n.getClientRects().length > 0,
    );
    el?.scrollIntoView({ block: 'center' });
    return el ?? null;
  }, label);
  const element = handle.asElement();
  if (!element) {
    errors.push(`[click] no visible element with aria-label "${label}"`);
    break;
  }
  console.log(`→ click "${label}"`);
  await new Promise((r) => setTimeout(r, 250));
  await element.click();
  await new Promise((r) => setTimeout(r, 1200));
}

/*
 * `--after ms` -- settle *after* the clicks, before reading or shooting.
 *
 * `--wait` lands between `goto` and the first click, and each click gets a
 * fixed 1.2s, so there was no way to let a slow interaction finish. The Clash
 * Royale meta sample reads about a hundred battle logs on a press and takes
 * minutes through the fixture server; without this the screenshot is always of
 * a progress bar.
 */
const after = Number(flag('after', 0));
if (after) await new Promise((r) => setTimeout(r, after));

// document.body, not #root: react-native-web renders <Modal> into a portal
// outside the app root, so reading #root alone silently misses every sheet.
// `--scroll 600` scrolls the deepest scrollable element (a sheet's own
// ScrollView, if one is open) so lower sections can be screenshotted.
// `--scroll-to "Raid on X"` brings the element with that aria-label into view.
// The clan sheet runs to several thousand pixels once a 50-row member list is
// in it, so targeting a section by pixel offset is guesswork.
const scrollTo = flag('scroll-to', null);
if (scrollTo) {
  const found = await page.evaluate((label) => {
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (n) => n.getAttribute('aria-label') === label,
    );
    if (!el) return false;
    el.scrollIntoView({ block: 'start' });
    return true;
  }, scrollTo);
  if (!found) errors.push(`[scroll-to] no element with aria-label "${scrollTo}"`);
  await new Promise((r) => setTimeout(r, 700));
}

const scrollBy = Number(flag('scroll', 0));
if (scrollBy) {
  await page.evaluate((px) => {
    const scrollers = [...document.querySelectorAll('*')].filter(
      (e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible',
    );
    // The one with the most to scroll, not the last in document order: a sheet
    // renders into a portal *after* the app root, but so does every horizontal
    // strip inside it, and those were winning the old tie-break.
    scrollers.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
    const target = scrollers[0] ?? document.scrollingElement;
    if (target) target.scrollTop += px;
  }, scrollBy);
  await new Promise((r) => setTimeout(r, 700));
}

const text = await page.evaluate(() => (document.body?.innerText ?? '').trim());

if (shot) {
  const dir = resolve(root, '.shots');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${shot}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`📷 ${file}`);
}

console.log('\n--- rendered text ---');
console.log(text || '(nothing rendered)');

const report = (label, list) => {
  if (!list.length) return;
  console.log(`\n--- ${label} (${list.length}) ---`);
  for (const line of [...new Set(list)].slice(0, 25)) console.log(`  ${line}`);
};
report('console errors', errors);
report('failed requests', failed);
report('console warnings', warnings);

await browser.close();

const fatal = errors.length || failed.length;
console.log(`\n${fatal ? '✗ FAIL' : '✓ OK'} — ${errors.length} errors, ${failed.length} failed requests`);
process.exit(fatal ? 1 : 0);
