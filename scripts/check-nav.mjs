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

const BASE = process.env.CHECK_BASE ?? 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932 });
/*
 * The dev server hands back one module per bundled image, and the registries
 * now total roughly 6,700 of them -- 1,771 Clash Book levels, 1,405 Brawl
 * Stars profile icons, 1,191 Royale player badges and the rest. A cold load
 * therefore takes tens of seconds, and `networkidle2` -- which these
 * navigations used to wait for -- may never be reached at all.
 *
 * So they wait for `domcontentloaded` and lean on the `settle()` after each
 * one for render timing, with a generous ceiling for a cold start. None of
 * it changes what is asserted. A production build bundles these, so the
 * problem is the dev server only.
 */
page.setDefaultNavigationTimeout(120000);


const idle = () => page.waitForNetworkIdle({ idleTime: 600, timeout: 45000 }).catch(() => {});

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

await page.goto(`${BASE}/coc`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await idle();
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
await page.goto(`${BASE}/coc/book`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await idle();
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


await page.goto(`${BASE}/passport`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await idle();
await settle(1500);
check('/passport loads', path() === '/passport', path());


async function fill(label, value) {
  const handle = await page.evaluateHandle(
    (l) => [...document.querySelectorAll('[aria-label]')].find((n) => n.getAttribute('aria-label') === l) ?? null,
    label,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no field labelled "${label}"`);
  await el.click();
  await page.keyboard.type(value);
}


async function press(label) {
  const ok = await page.evaluate((l) => {
    const el = [...document.querySelectorAll('[role="button"]')].find(
      (n) => (n.getAttribute('aria-label') ?? '') === l || (n.innerText ?? '').trim() === l,
    );
    el?.scrollIntoView({ block: 'center' });
    el?.click();
    return Boolean(el);
  }, label);
  await settle();
  return ok;
}

await fill('Display name', 'Primary');
await fill('Clash of Clans tag', '#2PP');
await press('Save Passport');
check('passport saved', (await body()).includes('Passport saved!'));
check('and is listed below the form', (await body()).includes('Primary'));

// A display name is required now: a list of rows called "" is unusable, and
// the name is the only thing that distinguishes one passport from another.
await fill('Clash of Clans tag', '#2PP');
await press('Save Passport');
check('a passport without a name is refused', (await body()).includes('display name'));

await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
await idle();
await settle(2000);
check('the list survives a reload', (await body()).includes('Primary'));
check('the saved tag survives with it', (await body()).includes('#2PP'));

// A second passport, which is the whole point of the list.
await fill('Display name', 'Second');
await fill('Clash of Clans tag', '#2PP');
await press('Save Passport');
const both = await body();
check('a second passport is added, not substituted', both.includes('Primary') && both.includes('Second'));
// Newly saved becomes active; the tick switches back.
check('the new passport is active', /Second[\s\S]{0,40}ACTIVE/.test(both), '');
await press('Use Primary');
check('the tick switches the active passport', /Primary[\s\S]{0,40}ACTIVE/.test(await body()), '');

// Saving over a name updates that row rather than adding a twin.
await fill('Display name', 'Second');
await fill('Clash of Clans tag', '#2PP');
await press('Save Passport');
const updated = await body();
check('saving a name twice updates it', updated.includes('Passport updated!'));
check('and does not leave two rows', (updated.match(/Second/g) ?? []).length === 1, '');

// Delete asks first -- these tags are typed by hand.
await press('Delete Second');
check('delete asks for confirmation', (await body()).includes('Delete “Second”?'));
await press('Confirm delete');
const afterDelete = await body();
check('delete removes the row', !afterDelete.includes('Second'));
check('and leaves the other one alone', afterDelete.includes('Primary'));

if (pageErrors.length) {
  console.log('\n--- page errors ---');
  for (const e of [...new Set(pageErrors)]) console.log(`  ${e}`);
}

await browser.close();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${failed ? '✗ FAIL' : '✓ OK'} — ${results.length - failed}/${results.length} checks passed`);
process.exit(failed || pageErrors.length ? 1 : 0);
