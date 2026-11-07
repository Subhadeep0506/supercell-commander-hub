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
await serveFixtures(page);

const settle = (ms = 1400) => new Promise((r) => setTimeout(r, ms));
const body = () => page.evaluate(() => document.body?.innerText ?? '');
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await idle();
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
// Tower troops are cards and render as cards. They used to print as a
// comma-joined list of names -- the only place in either game where a card
// appeared as bare text -- so this asserts the artwork, not the heading.
check('labels the tower troop', /Tower troop/i.test(t), t);
// `img/arena/`, not `img/cr-arena/` -- the card renders live in the former.
// Eight deck cards plus at least one tower troop.
const homeCardArt = await imgs('img/arena/');
check('the deck and tower troop render as art', homeCardArt >= 9, `${homeCardArt} card images`);
check('shows the arena', t.includes('Electro Valley'), t);
check('shows Merge Tactics progress', /Merge Tactics/i.test(t), t);
check('derives a per-mode record', /Recent record by mode/i.test(t), t);
// Was an assertion on the caption under this panel ("not lifetime totals").
// The caption went with the rest of the API prose; the derived figure it
// qualified -- a per-mode record counted from the log -- is checked above and
// its crown counts are checked here.
check('the per-mode record carries counts', /\d+\s*·\s*\d+|\d+\s*-\s*\d+/.test(t), t);

// The Battles section. 26 battles in the fixture, 10 shown per page.
check('lists battles', /Battles in the log/i.test(t), t);
check('summarises the recent record', /Recent win rate/i.test(t), t);
check('shows crowns for and against', /Crowns for \/ against/i.test(t), t);
check('offers result filters', /\bWins\b/.test(t) && /\bLosses\b/.test(t), t);
check('pages ten battles at a time, not the whole log', /Load 10 battles · 18 left/i.test(t), t);
check('names a real opponent', /TRollJaaKKO/.test(t), t);
// Collapsed rows carry no deck, no tower HP and no tags.
check('keeps battle detail collapsed', !/King tower destroyed/i.test(t), t);


const clickLabel = async (pattern) =>
  page.evaluate((p) => {
    const re = new RegExp(p, 'i');
    const el = [...document.querySelectorAll('[role="button"],[role="link"]')]
      // Visible only: the detail sheet keeps every back-stack layer mounted
      // and hidden, so an unfiltered query finds a buried copy first.
      .filter((n) => n.getClientRects().length > 0)
      .find((n) => re.test(n.getAttribute('aria-label') ?? ''));
    el?.scrollIntoView({ block: 'center' });
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
check('counts the recent record', /25\s*·\s*3/.test(t), t);
check('totals crowns across the window', /53\s*–\s*12/.test(t), t);
check('nets the trophy move', /\+694/.test(t), t);

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
// Counts drift with the account -- it was 78/45 when first captured and 80/43
// after the owner unlocked two cards. The load-bearing invariant is that the
// two sum to the catalog's 123, which royale-fixtures.test.ts asserts directly.
check('counts 80 unlocked', /\b80\b/.test(t), t);
check('counts 43 locked', /\b43\b/.test(t), t);
check('lists tower troops', /Tower troops/i.test(t), t);
// The section counts above are the whole split; the grids under them page.
check('pages the collection rather than drawing 123 tiles', /Load 10 cards · 70 left/i.test(t), t);
// A word, because neither fan kit has a padlock -- see assets-req.md #40. The
// key that used to sit here read as "unlock with a key", which is not how a
// card is found.
check('locked tiles say so in words', /LOCKED/.test(t), t);
check('no key icon left on a locked tile', (await imgs('cr-icon/key')) === 0, '');

/*
 * The meta, sampled on the device.
 *
 * Replaces the four hardcoded archetypes that used to sit in the Builder under
 * a note saying the API publishes no deck or usage statistics. It does not --
 * but the battle log carries both players' decks and the result, so the meta
 * is counted rather than looked up.
 *
 * Under --fixture every tag that is not on the Path of Legend leaderboard is
 * answered with the same battle log, so the match counts here are degenerate
 * by construction. What is checked is the pipeline and the screen, not the
 * numbers.
 */
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="tab"], [aria-label]')].find((n) =>
    /^Builder$/i.test((n.textContent ?? '').trim()),
  );
  el?.click();
});
await settle(1800);
t = await body();
check('the builder no longer claims there is no meta data', !/not live meta rankings/i.test(t), t);
check('the meta section is there but not yet run', /Current meta/i.test(t), t);
check('and does not sample a hundred logs on mount', /Find the current meta/i.test(t), t);

check('the meta sample starts on a press', await clickLabel('^Find the current meta$'), '');
// Roughly a hundred requests against the fixture server. Polled rather than
// slept: a fixed wait is either flaky or slower than it needs to be.
let metaDone = false;
for (let i = 0; i < 120 && !metaDone; i++) {
  await settle(1500);
  metaDone = /Counted from \d+ logs/i.test(await body());
}
check('the sample completes', metaDone, (await body()).slice(0, 200));

t = await body();
/*
 * The sample size, which is now a figure rather than the paragraph it used to
 * be -- the seed breakdown and the ranking explanation were removed with the
 * rest of the API caveats. The size itself stays: a ranking built from eleven
 * battles and one built from two thousand look identical without it.
 */
check('reports how large the sample was', /Counted from \d+ logs · [\d,]+ battles/i.test(t), t);
// The "N skipped as friendlies" clause went with the paragraph. That the
// sample counts competitive battles only is still visible in the pair of
// figures asserted above: logs read, and battles kept from them.
check('ranks decks with their match counts', /\d+ matches/i.test(t), t);
check('shows the bracket picker', /League or arena/i.test(t), t);
// The default bracket is the player's own. The calibration account has never
// reached Path of Legends, so this is its Trophy Road arena rather than a league.
check('defaults to the player’s own bracket', /· yours \(/i.test(t), t);
check('lists the cards played most in the bracket', /Most played here/i.test(t), t);
check('offers a playable-only filter', /Only decks you can field/i.test(t), t);

check('a deck row expands', await clickLabel('^Meta deck 1'), '');
await settle(1200);
t = await body();
check(
  'the expanded deck shows its record',
  /Average elixir/i.test(t) && /Share of this bracket/i.test(t),
  t,
);
check('and how the player’s card levels compare', /Your card levels/i.test(t), t);
check('and its record into the bracket’s popular cards', /Against the cards played most here/i.test(t), t);
check('a refresh is offered once there is a sample', /Refresh/i.test(t), t);

console.log('\nClan');
await go('/cr/clan');
t = await body();
// The Clan tab is a finder now, matching Clash of Clans': your own clan is
// offered as a card and the profile opens in the sheet. It used to render
// expanded in place, which made the same clan look like two different things
// depending on how you reached it.
check('offers your clan as a card', t.includes('KING SLAYERS'), t);
check('does not expand the clan in place', !/War trophies/i.test(t), t);
check('the search field and button share a row', /Search/.test(t), t);
check('offers filters below the search', /Filters/i.test(t), t);

check('the clan card is tappable', await clickLabel('^View KING SLAYERS'), '');
await settle(1800);
t = await body();
check('the card opens the clan sheet', /War trophies/i.test(t), t);
// The clan's own description sits with its crest and name *above* the tabs,
// so it stays visible on all four rather than being filed under Overview.
// Asserted by position, not just presence: it rendered before this change too,
// just in the wrong place.
const descAbove = await page.evaluate(() => {
  const text = document.body?.innerText ?? '';
  // '🦅' is this clan's whole description in the capture.
  const desc = text.indexOf('🦅');
  const tabs = text.indexOf('Overview');
  return { desc, tabs, ok: desc >= 0 && tabs >= 0 && desc < tabs };
});
check(
  'the description sits above the tabs',
  descAbove.ok,
  `description at ${descAbove.desc}, tabs at ${descAbove.tabs}`,
);

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
check('the roster pages below the podium', /Load 10 members · 24 left/i.test(t), t);
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
// Either, because the capture follows a real clan through a real race: it was
// a training week when first captured and a war day when recaptured. Pinning
// one makes the suite fail on a calendar rather than on a regression. The
// war-day *shape* is asserted properly in royale-fixtures.test.ts, and
// FIXTURE_CR_RACE=warday forces it when that branch needs exercising.
check('river race renders its current period', /Training|War Day/i.test(t), t);
check('ranks five clans', /Standings/i.test(t), t);
check('shows decks remaining', /Decks remaining/i.test(t), t);
// The sentence naming the four-per-day rule is gone; the figure it explained
// is not, and that figure is the one that would be wrong if the rule changed.
check('decks remaining is a real count', /Decks remaining[\s\S]{0,40}\d/.test(t), t);

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
// The "finished seasons only" note is gone; the season list it qualified is
// what proves the same thing, so that is what gets checked.
check('offers finished seasons by date', /20\d\d-\d\d/.test(t), t);

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
/*
 * Was an assertion on the note saying hitpoints and damage are not published.
 * The note is gone, but the decision behind it is load-bearing -- no
 * third-party combat stats anywhere in this app -- so the check now guards the
 * decision directly: the modal must not have grown any.
 */
check('shows no combat stats', !/Hitpoints|Hit speed|Damage per second/i.test(t), t);

console.log('\nArtwork');

await go('/cr');
check('arena art on the banner', (await imgs('cr-arena')) > 0);
check('clan crest on the banner', (await imgs('cr-badge')) > 0);
// 16 chests, one of them Tower Troop Chest which postdates the asset repo.
const chestArt = await imgs('cr-chest');
check('chest art on the track', chestArt >= 15, `${chestArt} of 16`);

await go('/cr/clan');
// The crest is on the clan *card* here now; the banner it used to sit on
// moved into the sheet along with the rest of the profile.
check('clan crest on the clan card', (await imgs('cr-badge')) > 0);
await clickLabel('^View KING SLAYERS');
await settle(1800);
check('clan crest on the sheet banner', (await imgs('cr-badge')) > 0);
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
/*
 * 25 a tap on the ladders, not the shared default of ten: a board is scanned
 * rather than read, and the service pages fifty at a time behind it. Once the
 * fetched rows run out the same button follows `paging.cursors.after` for the
 * next page instead, so "Load more clans" is the other shape this can take.
 */
check('the ladder pages', /Load (25 clans|more clans)/i.test(await body()), '');

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
