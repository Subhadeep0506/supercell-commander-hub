// Drives the running dev server through a click path and asserts the URL and
// on-screen text after each step.
//
//   node scripts/check-nav.mjs
//
// This is the check that browser-only testing is actually for: URL parity, the
// browser back button, and state surviving a reload. None of it is observable
// from a screenshot.
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!CHROME) throw new Error('No Chrome or Edge found at the usual Windows paths');

const BASE = 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932 });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const results = [];
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));

function check(label, pass, detail = '') {
  results.push({ label, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const path = () => new URL(page.url()).pathname;
// document.body, not #root: react-native-web portals <Modal> outside the app
// root, so reading #root alone cannot see a sheet at all.
const body = () => page.evaluate(() => document.body?.innerText ?? '');

/** Clicks the first element whose aria-label matches exactly. */
async function clickLabel(label) {
  const handle = await page.evaluateHandle((l) => {
    const nodes = [...document.querySelectorAll('[aria-label]')];
    return nodes.find((n) => n.getAttribute('aria-label') === l) ?? null;
  }, label);
  const element = handle.asElement();
  if (!element) throw new Error(`no element with aria-label "${label}"`);
  await element.click();
  await settle();
}

await page.goto(`${BASE}/coc`, { waitUntil: 'networkidle2' });
await settle(2000);
check('/coc loads', path() === '/coc', path());

await clickLabel('Clash Book');
check('book shortcut navigates', path() === '/coc/book', path());
check('book content rendered', (await body()).includes('Army Camp'));

await clickLabel('War');
check('war tab navigates', path() === '/coc/war', path());

await page.goBack();
await settle();
check('back button returns to book', path() === '/coc/book', path());

await page.goBack();
await settle();
check('back button returns to /coc', path() === '/coc', path());

// Clash Book sheet: open, interact, close.
await page.goto(`${BASE}/coc/book`, { waitUntil: 'networkidle2' });
await settle(2000);
await clickLabel('View Laboratory');
const sheetBody = await body();
check('book sheet opens', sheetBody.includes('Laboratory · Level 16'));
// The title alone is not evidence the sheet works. Sheet's body is `flex: 1`,
// and against a card with no definite height Yoga resolved that to zero --
// every sheet on Android rendered as a title above an empty strip while this
// check stayed green. Assert something only the *body* can produce.
check(
  'book sheet renders its body, not just the title',
  /Game max/.test(sheetBody) && /Home Village|Builder Base/.test(sheetBody),
  sheetBody.slice(0, 80).replace(/\n/g, ' '),
);

// Guards the react-native-web bubbling trap: Pressable is DOM-event based on
// web, so a scrim nested as the card's parent would close on any inner tap.
await clickLabel('Select item level');
const afterSlider = await body();
check('sheet survives an inner tap', afterSlider.includes('Laboratory ·'));
check('slider changes level', /Laboratory · Level (?!16)\d+/.test(afterSlider), afterSlider.match(/Laboratory · Level \d+/)?.[0] ?? '');

await clickLabel('Close item details');
check('sheet closes', !(await body()).includes('Laboratory ·'));

// Super Troops: the catalog shipped all 17 nested inside their base troop and
// nothing ever read them, so each one rendered as a text tile that reported no
// stats when tapped. Both directions of the cross-link are asserted, plus the
// back arrow, because the modal now keeps its own stack.
await clickLabel('View Barbarian');
check('base troop card opens', (await body()).includes('Barbarian · Level'));
await clickLabel('Open related Super Barbarian');
const superBody = await body();
check('related tile pushes the super troop', /Super Barbarian · Level \d+/.test(superBody), superBody.match(/Super Barbarian · Level \d+/)?.[0] ?? '');
check('super troop shows real stats', /Boost Cost|Dark Elixir/i.test(superBody));
await clickLabel('Back');
check('back pops to the base troop', /(?<!Super )Barbarian · Level/.test(await body()));
await clickLabel('Close item details');

// Crafted defenses carry `modules` instead of `levels`, so this modal used to
// render a description and nothing else -- no slider, no stats.
await clickLabel('View Bomb Hive');
const craftedBody = await body();
check('crafted defense lists its module tracks', ['Hitpoints', 'Damage', 'Range'].every((m) => craftedBody.includes(m)), craftedBody.slice(0, 90).replace(/\n/g, ' '));
check('crafted defense shows upgrade costs', /Build Cost/i.test(craftedBody));
await clickLabel('Close item details');

// Clan Capital was absent from the book entirely.
await clickLabel('Clan Capital');
await settle(1200);
const capitalBody = await body();
check('clan capital tab renders', capitalBody.includes('Super Barbarian') && capitalBody.includes('Troops'), capitalBody.slice(0, 90).replace(/\n/g, ' '));
check('capital tab excludes magic items', !/Magic Items/.test(capitalBody));

// Passport round-trip: type a tag, save, reload, confirm it persisted.
await page.goto(`${BASE}/passport`, { waitUntil: 'networkidle2' });
await settle(1500);
check('/passport loads', path() === '/passport', path());

const tagField = await page.evaluateHandle(() => {
  const nodes = [...document.querySelectorAll('[aria-label]')];
  return nodes.find((n) => n.getAttribute('aria-label') === 'Clash of Clans tag') ?? null;
});
const input = tagField.asElement();
if (input) {
  await input.click();
  await page.keyboard.type('#2PP');
  await settle(300);
  await clickLabel('Save Passport').catch(async () => {
    // The save button is a Pressable whose label comes from its text.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="button"]')].find((n) =>
        n.innerText?.includes('Save Passport'),
      );
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
  });
  check('passport saved', (await body()).includes('Passport saved!'));

  await page.reload({ waitUntil: 'networkidle2' });
  await settle(2000);
  const after = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[aria-label]')];
    const el = nodes.find((n) => n.getAttribute('aria-label') === 'Clash of Clans tag');
    return el?.value ?? '';
  });
  check('tag survived reload', after === '#2PP', `value=${JSON.stringify(after)}`);
} else {
  check('passport tag field present', false);
}

if (pageErrors.length) {
  console.log('\n--- page errors ---');
  for (const e of [...new Set(pageErrors)]) console.log(`  ${e}`);
}

await browser.close();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${failed ? '✗ FAIL' : '✓ OK'} — ${results.length - failed}/${results.length} checks passed`);
process.exit(failed || pageErrors.length ? 1 : 0);
