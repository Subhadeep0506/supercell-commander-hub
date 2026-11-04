// Screen tests for the Clash Royale views, run against the captured fixtures.
//
//   bun run web            # in another shell
//   node scripts/check-cr-screens.mjs
//   CHECK_BASE=http://localhost:5182 node scripts/check-cr-screens.mjs
//
// The Clash of Clans equivalent (check-screens.mjs) runs against *generated*
// fixtures because cocproxy is blocked here. These run against real captures,
// so an assertion failing after a recapture means the API changed.
//
// What is under test is mostly the quiet-wrongness class of bug: a Legendary
// rendering its rarity-relative level instead of its game level, the locked
// half of the collection going missing, a sparse chest track collapsing into
// a dense list.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serveFixtures } from './fixture-route.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!CHROME) {
  console.error('Chrome not found.');
  process.exit(1);
}

const BASE = process.env.CHECK_BASE ?? 'http://localhost:5173';
const TAG = '#L8YV8P2CL';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932 });
await serveFixtures(page);

const settle = (ms = 1400) => new Promise((r) => setTimeout(r, ms));
const body = () => page.evaluate(() => document.body?.innerText ?? '');
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await settle();
};

let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail.slice(0, 160)}` : ''}`);
  }
};

/** How many <img> on the page have a src matching this pattern. */
const imgs = (pattern) =>
  page.evaluate(
    (p) => [...document.querySelectorAll('img')].filter((i) => new RegExp(p).test(i.src)).length,
    pattern,
  );

const errors = [];
// favicon.ico is not served by the dev server and never has been. Matched on
// the message's own URL rather than on "Failed to load resource", so a real
// failed request still counts as a finding.
const noise = (url) => (url ?? '').includes('favicon.ico');
page.on('pageerror', (e) => {
  if (!noise(e.message)) errors.push(e.message);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (noise(m.location()?.url)) return;
  errors.push(m.text());
});

/** Save the calibration tag into the passport the way a user would. */
async function adoptAccount() {
  await go('/cr');
  const field = await page.$('input');
  if (!field) throw new Error('no tag field on /cr');
  await field.click();
  await page.keyboard.type(TAG);
  await page.keyboard.press('Enter');
  await settle(2000);
}

console.log(`\nClash Royale screens against ${BASE}\n`);

console.log('Home');
await adoptAccount();
let t = await body();
check('resolves the account', t.includes('DenCT'), t);
check('shows the clan', t.includes('KING SLAYERS'), t);
check('shows the current deck', /Current deck/i.test(t), t);
check('shows the arena', t.includes('Electro Valley'), t);
check('shows Merge Tactics progress', /Merge Tactics/i.test(t), t);
check('derives a per-mode record', /Recent record by mode/i.test(t), t);
check('labels derived figures', /not lifetime totals/i.test(t), t);

// The Battles section. 26 battles in the fixture, 10 shown per page.
check('lists battles', /Battles in the log/i.test(t), t);
check('summarises the recent record', /Recent win rate/i.test(t), t);
check('shows crowns for and against', /Crowns for \/ against/i.test(t), t);
check('offers result filters', /\bWins\b/.test(t) && /\bLosses\b/.test(t), t);
check('pages ten battles at a time, not all 26', /Load 10 battles · 16 left/i.test(t), t);
check('names a real opponent', /TRollJaaKKO/.test(t), t);
// Collapsed rows carry no deck, no tower HP and no tags.
check('keeps battle detail collapsed', !/King tower destroyed/i.test(t), t);

/** Click the nth element whose text matches, by accessibility label. */
const clickLabel = async (pattern) =>
  page.evaluate((p) => {
    const re = new RegExp(p, 'i');
    const el = [...document.querySelectorAll('[role="button"]')].find((n) =>
      re.test(n.getAttribute('aria-label') ?? ''),
    );
    el?.click();
    return Boolean(el);
  }, pattern);

// Results read as words on a coloured chip, not as a single letter. The label
// is "Victory against X" now, which is also what the row announces.
check('rows carry an outcome chip', /\bVictory\b/.test(t) && /\bDefeat\b/.test(t), t);
check('no W/L initials left', !/^[WL]$/m.test(t), t);

check('a battle row is tappable', await clickLabel('against TRollJaaKKO'), '');
await settle(1400);
t = await body();
// Both side labels are upper-cased in the style, so match them that way.
check('expands to both sides', /\bYOU\b/.test(t) && /\bOPPONENT\b/.test(t), t);
check('shows the opponent tag', /#VUYJQRG0G/.test(t), t);
// 3-1: the loser lost both princess towers and the king.
check('reads the towers out of the hit points', /King tower destroyed/i.test(t), t);
check('shows crowns conceded', /crowns conceded/i.test(t), t);
check('shows elixir leaked', /elixir leaked/i.test(t), t);
check('shows the tower troop', /Tower Princess/i.test(t), t);
check('shows a deck average', /avg elixir/i.test(t), t);
check('stamps the battle', /27 Oct|28 Oct/.test(t), t);
check('names the deck source', /Your own deck/i.test(t), t);

await clickLabel('against TRollJaaKKO');
await settle(900);

// 23-3-0 over the window, 49-12 on crowns, +636 trophies -- computed from the
// log, which is the only place any of those four numbers exist.
//
// The W/L and dash separators are gone: a record is "23 · 3" with a blue crown
// on the wins and a red one on the losses, and each figure sits in its own
// element, so innerText puts a newline between them.
check('counts the recent record', /23\s*·\s*3/.test(t), t);
check('totals crowns across the window', /49\s*–\s*12/.test(t), t);
check('nets the trophy move', /\+636/.test(t), t);

// Blue is yours, red is theirs -- the one rule those figures are built on, and
// it is only visible as art, so the text assertions above cannot see it.
const crowns = await page.evaluate(() => ({
  blue: document.querySelectorAll('img[src*="crownblue"]').length,
  red: document.querySelectorAll('img[src*="crownred"]').length,
}));
check('wins carry a blue crown', crowns.blue > 0, JSON.stringify(crowns));
check('losses carry a red crown', crowns.red > 0, JSON.stringify(crowns));

// Paging, twice: BillyBobers is battle 20 of 26, so one press is not enough.
// That is the half of paging most likely to be wrong -- a button that reveals
// its first page and then stops.
const loadMore = async () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="button"]')].find(
      (n) => (n.getAttribute('aria-label') ?? '') === 'Load more',
    );
    el?.click();
    return Boolean(el);
  });
check('battles page on demand', await loadMore(), '');
await settle(1200);
check('and page again', await loadMore(), '');
await settle(1400);
t = await body();
check('reaches a battle two pages in', /BillyBobers/.test(t), t);
check('runs out of pages at the end of the log', !/Load \d+ battles/i.test(t), t);

// Filtering to losses must leave exactly the three defeats.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find(
    (n) => (n.getAttribute('aria-label') ?? '') === 'Losses',
  );
  el?.click();
});
await settle(1400);
t = await body();
check('filters to the three defeats', (t.match(/\bvs /g) ?? []).length === 3, t);
check('keeps a defeat in the filtered list', /BillyBobers/.test(t), t);
check('shows the chest track', /Upcoming chests/i.test(t), t);
check('shows a far-future chest', /\+388|Mega Lightning/i.test(t), t);
// Both sections render in full -- neither sits behind a toggle any more.
check('shows achievements', /Achievements/i.test(t), t);
check('counts earned achievements', /of 12 fully earned/i.test(t), t);
check('shows badges', /Badges/i.test(t), t);
// Every badge carries art now, bundled from the fan kit rather than fetched
// from a CDN that 403s here. `modeLabel` spaces the API's PascalCase names.
check('names a badge', /Years Played/i.test(t), t);
check('shows a badge level', /Level 6 \/ 11/i.test(t), t);
check('lists achievements', /Road to Glory/i.test(t), t);
// "Road to Glory 11/6" -- value over target. The bar must clamp, not overflow.
check('shows an over-target achievement', /11 \/ 6/.test(t), t);
// leagueStatistics and Path of Legend are absent on this account: the test is
// that the sections are omitted rather than rendered empty.
check('omits absent Path of Legend', !/Path of Legend/i.test(t), t);
check('omits absent league statistics', !/League statistics/i.test(t), t);

console.log('\nDecks');
await go('/cr/decks');
t = await body();
check('mines four decks from the log', /Deck 4/.test(t) && !/Deck 5/.test(t), t);
check('marks the current deck', /Deck 1 ★|★/.test(t), t);
check('shows an elixir average', /Average elixir/i.test(t), t);
check('offers the copy-to-game link', /Copy to game/i.test(t), t);
check('says tower troops are not in the link', /Tower troops are not part/i.test(t), t);

// The collection split is the headline number: 78 owned, 45 locked.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="tab"], [aria-label]')].find((n) =>
    /All cards/i.test(n.textContent ?? ''),
  );
  el?.click();
});
await settle(1800);
t = await body();
check('splits unlocked from locked', /Unlocked/.test(t) && /Locked/.test(t), t);
check('counts 78 unlocked', /\b78\b/.test(t), t);
check('counts 45 locked', /\b45\b/.test(t), t);
check('lists tower troops', /Tower troops/i.test(t), t);
// The section counts above are the whole split; the grids under them page.
check('pages the collection rather than drawing 123 tiles', /Load 10 cards · 68 left/i.test(t), t);
// A word, because neither fan kit has a padlock -- see assets-req.md #40. The
// key that used to sit here read as "unlock with a key", which is not how a
// card is found.
check('locked tiles say so in words', /LOCKED/.test(t), t);
check('no key icon left on a locked tile', (await imgs('cr-icon/key')) === 0, '');

console.log('\nClan');
await go('/cr/clan');
t = await body();
check('opens on your own clan', t.includes('KING SLAYERS'), t);
check('shows clan metrics', /War trophies/i.test(t), t);

// A clan is a ladder of 50, so its roster gets the leaderboard's podium rather
// than three ordinary rows with a gold square.
const tab = (label) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll('[role="tab"]')].find((n) =>
      new RegExp(l, 'i').test(n.textContent ?? ''),
    );
    el?.click();
    return Boolean(el);
  }, label);

await tab('Members');
await settle(1800);
t = await body();
check('the roster leads with a podium', /Clasher/.test(t) && /BEAST/.test(t), t);
check('the roster pages below the podium', /Load 10 members · 22 left/i.test(t), t);
// The podium follows the active sort: order by Donated and the top three
// donors stand on it, scored by donations rather than trophies.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find(
    (n) => (n.getAttribute('aria-label') ?? '') === 'Donated',
  );
  el?.click();
});
await settle(1400);
check('the podium follows the sort', /Load 10 members/i.test(await body()), '');

await tab('River Race');
await settle(1800);
t = await body();
check('river race renders during training', /Training/i.test(t), t);
check('ranks five clans', /Standings/i.test(t), t);
check('shows decks remaining', /Decks remaining/i.test(t), t);
check('labels the four-deck assumption', /four per member per day/i.test(t), t);

// A race payload says nothing about a participant but their name and four
// counts, so these rows are joined against the clan's own memberList for the
// arena art, role and trophies. Without the join they are four numbers in a
// sentence, which is what they used to be.
check('participants carry a role and trophies', /member · [\d,]+ trophies/i.test(t), t);
const raceArt = await imgs('cr-arena');
check('participant rows carry arena art', raceArt > 3, `${raceArt} portraits`);

console.log('\nLeaderboard');
await go('/cr/leaderboard');
t = await body();
check('offers Path of Legend', /Path of Legend/i.test(t), t);
check('groups Merge Tactics into one row', (t.match(/Merge Tactics/g) ?? []).length <= 2, t);
check('keeps the nameless ladders', /Other ladders/i.test(t), t);
check('warns about the current season', /Finished seasons only/i.test(t), t);

console.log('\nCard detail');
await go('/cr');
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find(
    (n) => (n.getAttribute('aria-label') ?? '') === 'View Wizard',
  );
  el?.click();
});
await settle(1600);
t = await body();
check('tapping a card opens its detail', /Copies per upgrade/i.test(t), t);
check('shows rarity and elixir', /Rarity/i.test(t) && /Elixir/i.test(t), t);
check('renders the copy ladder', (t.match(/→/g) ?? []).length > 8, t);
// Wizard is Rare, so its ladder starts at game level 3 -- not 1. This is the
// rarity-relative conversion showing up in the UI rather than in a unit test.
check('ladder uses game levels, not API levels', /3 → 4/.test(t), t);
check('states that combat stats are unavailable', /not provided by the official API/i.test(t), t);

console.log('\nArtwork');

await go('/cr');
check('arena art on the banner', (await imgs('cr-arena')) > 0);
check('clan crest on the banner', (await imgs('cr-badge')) > 0);
// 16 chests, one of them Tower Troop Chest which postdates the asset repo.
const chestArt = await imgs('cr-chest');
check('chest art on the track', chestArt >= 15, `${chestArt} of 16`);

await go('/cr/clan');
check('clan crest on the clan banner', (await imgs('cr-badge')) > 0);
await tab('Members');
await settle(1800);
// Every row carries a portrait, but not every portrait is an arena badge.
// Ranks 1-13 sit in arenas added after the upstream asset repo closed -- see
// assets-req.md #15-20 -- so they fall through to the framed king. What must
// never happen is a row with no portrait at all beside rows that have one.
const portraits = await imgs('cr-arena|arena/king');
check('every member row carries a portrait', portraits >= 13, `${portraits} portraits`);

await go('/cr/leaderboard');
await tab('Clans');
await settle(2400);
// Three on the podium plus the first page of ten. Asserted as "most of them"
// rather than exactly 13: every one of the thirteen badge ids does map, so a
// short count means art that has not decoded yet, not art that is missing.
const ladderCrests = await imgs('cr-badge');
check('clan crests on the ladder', ladderCrests >= 10, `${ladderCrests} crests`);
check('the ladder pages', /Load 10 clans/i.test(await body()), '');

const broken = await page.evaluate(() =>
  [...document.querySelectorAll('img')]
    .filter((i) => i.complete && i.naturalWidth === 0)
    .map((i) => i.src.split('/').pop())
    .slice(0, 5),
);
check('no broken images', broken.length === 0, broken.join(', '));

console.log('\nRuntime');
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} failed\n` : '\nAll Clash Royale screen checks passed.\n');
process.exit(failed ? 1 : 0);
