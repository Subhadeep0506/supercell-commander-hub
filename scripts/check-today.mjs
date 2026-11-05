// Screen tests for Today, the cross-game board.
//
//   bun run web                      # in another shell
//   node scripts/check-today.mjs
//   CHECK_BASE=http://localhost:5174 node scripts/check-today.mjs
//
// Today belongs to neither game, so it gets its own script rather than
// additions to the two per-game ones. `fixture-route.mjs` already serves both
// games' fixtures from a single route table -- /currentwar, /leaguegroup,
// /clanwarleagues/wars/{tag}, /capitalraidseasons, /globaltournaments and
// /currentriverrace are all there -- so nothing new has to be mocked.
//
// What is under test is the screen's one rule: **real timestamps only**. The
// assertions therefore check for *digits* rather than headings, because a card
// that renders its title above a dead clock is the exact failure this screen
// can have and still look fine in a screenshot.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serveFixtures } from './fixture-route.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, 'fixtures');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!CHROME) {
  console.error('Chrome not found.');
  process.exit(1);
}

const BASE = process.env.CHECK_BASE ?? 'http://localhost:5173';
const COC_TAG = '#LJ9V8LCYQ';
const CR_TAG = '#L8YV8P2CL';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932 });
await serveFixtures(page);

const settle = (ms = 1600) => new Promise((r) => setTimeout(r, ms));
const body = () => page.evaluate(() => document.body?.innerText ?? '');

let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
};

const errors = [];
const NOISE = /favicon\.ico/;
page.on('console', (m) => {
  const entry = m.text();
  if (NOISE.test(entry) || entry.includes('status of 404')) return;
  if (m.type() === 'error') errors.push(entry);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

/**
 * Seeds one passport holding *both* games' tags.
 *
 * Today resolves each game independently off the same passport, so a seed
 * with only one filled in would exercise half the screen and quietly pass.
 */
async function seed({ coc = COC_TAG, cr = CR_TAG } = {}) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (c, r) => {
      localStorage.setItem(
        'sch',
        JSON.stringify({
          game: 'coc',
          passports: [{ id: 'seed', name: 'Test Chief', coc: c, cr: r, bs: '' }],
          activeId: 'seed',
        }),
      );
    },
    coc,
    cr,
  );
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await settle(2600);
}

/** A "3d 10h" / "40m 12s" clock, which is what proves a card is live. */
const CLOCK = /\b\d+[dhms]\b/;

/**
 * The Clash of Clans war fixture carries an `endTime` a few hours out, so it
 * expires. That is never a regression -- it is `make-fixtures.mjs` doing what
 * it was written to do -- but it silently removes the war card, so the run
 * says so rather than letting an assertion fail with a confusing message.
 */
function warFixtureLive() {
  const file = resolve(FIXTURES, 'coc-war.json');
  if (!existsSync(file)) return false;
  const raw = JSON.parse(readFileSync(file, 'utf8')).endTime ?? '';
  const iso = raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
  return new Date(iso).getTime() > Date.now();
}

console.log(`\nToday against ${BASE}\n`);

if (!warFixtureLive()) {
  console.log('  note  the Clash of Clans war fixture has expired — run `bun run build:fixtures`');
  console.log('        (war and league assertions are skipped, not failed)\n');
}
const live = warFixtureLive();

// --- the board ------------------------------------------------------------
console.log('Board');
await seed();
let t = await body();

check('Today is the landing screen', t.includes('Next up') || t.includes('No accounts yet'), t);
check('lists what is next', /Next up/i.test(t), t);

if (live) {
  check('shows the clan war', /Clan War\b/.test(t), t);
  check('the war card carries a live clock', CLOCK.test(t), t);
  // Battle day counts to endTime, preparation to startTime -- either way the
  // phase has to be named, or the clock is a number with no meaning.
  check('names the war phase', /Battle day|Preparation/.test(t), t);
  check('shows the Clan War League round', /Clan War League/.test(t), t);
  check('numbers the league round', /Round \d+ of \d+/.test(t), t);
}

check('shows the raid weekend', /Raid Weekend/i.test(t), t);

// --- Clash Royale ---------------------------------------------------------
// The two branches are mutually exclusive, so each only asserts under the flag
// state that produces it. Running the quiet assertions with a tournament live
// would fail on the app doing exactly the right thing.
const LIVE_TOURNAMENT = process.env.FIXTURE_CR_TOURNAMENT === 'live';

if (!LIVE_TOURNAMENT) {
  console.log('\nClash Royale · no tournament');
  check('states that no tournament is running', /No global tournament is running/i.test(t), t);
  // The river race genuinely has no end time in the API. Saying so is the
  // whole point -- deriving a countdown from periodIndex would be quietly
  // wrong.
  check('says the river race has no published end time', /without an end time/i.test(t), t);
  check('names the river race period', /Training|War Day|Colosseum/i.test(t), t);
}

// --- accounts -------------------------------------------------------------
console.log('\nAccounts');
check('lists the saved accounts', /Your accounts/i.test(t), t);
check('shows the Clash of Clans account', /Town Hall 13/.test(t), t);
check('shows both games, not just one', (t.match(/DenCT/g) ?? []).length >= 2, t);

const accountOpens = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')]
    .filter((n) => n.getClientRects().length > 0)
    .find((n) => /^Open /.test(n.getAttribute('aria-label') ?? ''));
  el?.scrollIntoView({ block: 'center' });
  el?.click();
  return Boolean(el);
});
await settle(1800);
check('an account row opens its game', accountOpens && !/Next up/.test(await body()), '');

// --- Brawl Stars ----------------------------------------------------------
console.log('\nBrawl Stars');
await seed();
t = await body();
check('states that Brawl Stars is still to come', /Arriving in a later update/i.test(t), t);

// --- Clash Royale, live tournament ----------------------------------------
// Unreachable without the flag: the real capture is an empty list, so this
// branch would otherwise ship having never been rendered.
console.log('\nClash Royale · live tournament');
if (LIVE_TOURNAMENT) {
  check('shows the tournament', /Mega Draft/i.test(t), t);
  check('the tournament card carries a live clock', CLOCK.test(t), t);
  // A real clock replaces the sentence rather than sitting beside it.
  check('the quiet notice is gone', !/No global tournament is running/i.test(t), t);
} else {
  console.log('  skip  re-run with FIXTURE_CR_TOURNAMENT=live to exercise this branch');
}

// --- empty state ----------------------------------------------------------
console.log('\nNo accounts');
await seed({ coc: '', cr: '' });
t = await body();
check('explains what to do with no account saved', /No accounts yet/i.test(t), t);
check('points at the passport', /Saved accounts/i.test(t), t);
// With no account there is no clan, so none of the Clash of Clans timers can
// resolve. A global tournament is the exception and legitimately still shows:
// it is global, not tied to an account -- so this only holds without the flag.
if (!LIVE_TOURNAMENT) {
  check('invents no countdown without an account', !CLOCK.test(t.split('Brawl Stars')[0] ?? t), t);
} else {
  check('a global tournament shows without an account', /Mega Draft/i.test(t), t);
}

// --- runtime --------------------------------------------------------------
console.log('\nRuntime');
check('no page errors', errors.length === 0, errors.join(' | '));

console.log(failed ? `\n✗ ${failed} failed\n` : '\nAll Today checks passed.\n');
await browser.close();
process.exit(failed ? 1 : 0);
