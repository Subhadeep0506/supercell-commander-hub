// Screen tests for the Brawl Stars views, run against the captured fixtures.
//
//   bun run web            # in another shell
//   node scripts/check-bs-screens.mjs
//   CHECK_BASE=http://localhost:5174 node scripts/check-bs-screens.mjs
//
// bsproxy.royaleapi.dev answers a Zscaler 403 on this network, so unlike the
// Clash Royale checks these can never be pointed at the live service -- the
// fixtures in scripts/fixtures are the only way these screens render here at
// all. They are real captures regardless (scripts/make-bs-fixtures.mjs), so an
// assertion failing after a recapture means the API changed, not us.
//
// What is under test is the quiet-wrongness class of bug, the same as the
// other two games' checks: a battle whose teams are the wrong way round, a
// trophy ladder labelled "Ranked", an absent trophyChange printed as 0, a
// locked brawler silently dropped from the grid.
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
const SHOTS = resolve(here, '../.shots');
/** The capture's owner. His in-game name really is "ERROR 404". */
const TAG = '#Q8R0UP09R';

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

/**
 * Best-effort network idle after a navigation.
 *
 * Navigating with `networkidle2` used to be enough, but the dev server now
 * serves roughly 6,700 image modules on a cold load and may never reach it
 * inside the timeout. Navigation therefore waits only for
 * `domcontentloaded`, and this mops up afterwards -- which the assertions
 * that count <img> elements need, because an image that has not loaded yet
 * reports naturalWidth 0 and looks exactly like missing artwork.
 *
 * It swallows its own timeout on purpose: not reaching idle is a slow dev
 * server, not a failing check.
 */
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
    console.log(`  FAIL ${label}${detail ? ` — ${detail.slice(0, 220)}` : ''}`);
  }
};

const imgs = (pattern) =>
  page.evaluate(
    (p) => [...document.querySelectorAll('img')].filter((i) => new RegExp(p).test(i.src)).length,
    pattern,
  );

/** Click the first *visible* element whose accessibility label matches. */
const clickLabel = async (pattern) =>
  page.evaluate((p) => {
    const re = new RegExp(p, 'i');
    const el = [...document.querySelectorAll('[role="button"],[role="link"],[role="tab"]')]
      // Visible only: the detail sheet keeps every back-stack layer mounted
      // and hidden, so an unfiltered query finds a buried copy first.
      .filter((n) => n.getClientRects().length > 0)
      .find((n) => re.test(n.getAttribute('aria-label') ?? n.textContent ?? ''));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, pattern);

const errors = [];
const noise = (url) => (url ?? '').includes('favicon.ico') || (url ?? '').includes('brawlify.com');
page.on('pageerror', (e) => {
  if (!noise(e.message)) errors.push(e.message);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (noise(m.location()?.url)) return;
  errors.push(m.text());
});

/** Save the capture's tag into the passport the way a user would. */
async function adoptAccount() {
  await go('/bs');
  const field = await page.$('input');
  if (!field) throw new Error('no tag field on /bs');
  await field.click();
  await page.keyboard.type(TAG);
  await page.keyboard.press('Enter');
  await settle(2200);
}

console.log(`\nBrawl Stars screens against ${BASE}\n`);

/* ---- Home --------------------------------------------------------------- */

console.log('Home');
await adoptAccount();
let t = await body();
check('resolves the account', t.includes('ERROR 404'), t);
check('shows the club', t.includes('LA GANG DI KUS'), t);
check('shows trophies', /79,407/.test(t), t);

// Ranked populates on this account where it was all zeros on the first
// capture's two, which is why that dump could not settle the panel's design.
check('shows the ranked tier', /GOLD I/i.test(t), t);
check('shows the elo', /1,?968/.test(t), t);
check('counts elo to the next tier', /Elo to Gold II/i.test(t), t);
check('shows all-time best', /MYTHIC III/i.test(t), t);
check('shows fame', /93,582/.test(t), t);

// The two adjacent fields with different units. "Insane II" is the level
// reading of bestRoboRumbleTime: 6; printing "6s" would be the bug.
check('reads Robo Rumble as a level', /Insane II/.test(t), t);
check('does not print Robo Rumble as seconds', !/\b6s\b/.test(t), t);
// The paragraph spelling out why one is a level and the other a duration is
// gone; the per-metric hints that carry the same distinction are not.
check('labels the two units apart', /best level/i.test(t) && /best survival/i.test(t), t);

console.log('Collection');
check('counts the collection', /108\/111/.test(t), t);
check('counts power 11s', /\b61\b/.test(t), t);
const tiles = await imgs('img/bs-brawler/');
check('renders the whole roster, not just the owned', tiles >= 111, `${tiles} tiles`);
check('marks the locked three', /Locked/.test(t), t);
check('offers rarity filters', /Mythic/.test(t) && /Ultra Legendary/.test(t), t);
// mega_epic is "Mythic" in game; a mechanical de-snake-case would say this.
check('never prints the internal rarity name', !/Mega Epic/i.test(t), t);
check('offers class filters', /Damage/.test(t) && /Marksman/.test(t), t);
await page.screenshot({ path: resolve(SHOTS, 'bs-home.png'), fullPage: false });

console.log('Brawler detail');
await clickLabel('^RICO, power');
await settle(1600);
t = await body();
check('opens the brawler sheet', /Star Powers/i.test(t), t);
check('shows the full kit, not just what is owned', /Gadgets/i.test(t) && /Gears/i.test(t), t);
check('marks owned and locked kit', /Owned/.test(t), t);
check('shows the global ladder for that brawler', /Global ladder/i.test(t), t);
await page.screenshot({ path: resolve(SHOTS, 'bs-brawler.png') });

/*
 * It has to scroll, and `innerText` cannot say so.
 *
 * This sheet shipped unscrollable: it owned a Modal of its own whose body is a
 * plain overflow-hidden View, so everything below Star Powers was unreachable
 * on a phone while every assertion above still passed -- offscreen text is in
 * `innerText` exactly like onscreen text. It is a layer of the shared detail
 * sheet now, which brings the ScrollView with it; this proves the scroller is
 * really there and really overflows.
 */
const sheetScroll = await page.evaluate(() => {
  /*
   * Walk up from the sheet's *last* section rather than picking the first
   * scrollable div on the page: the screen underneath stays mounted beneath
   * the modal and its own scroller comes first in document order, so an
   * unscoped query scrolls the wrong thing and reports success.
   */
  const heading = [...document.querySelectorAll('div')]
    .filter((n) => n.getClientRects().length > 0)
    .find((n) => n.childElementCount === 0 && /^Global ladder$/.test(n.textContent ?? ''));
  if (!heading) return { found: false };

  let scroller = heading.parentElement;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight + 4) {
    scroller = scroller.parentElement;
  }
  if (!scroller) return { found: true, scrollable: false };

  scroller.scrollTop = scroller.scrollHeight;
  const r = heading.getBoundingClientRect();
  return {
    found: true,
    scrollable: true,
    moved: scroller.scrollTop > 0,
    inView: r.top >= 0 && r.bottom <= window.innerHeight,
  };
});
check('the brawler sheet has a scroller', sheetScroll.scrollable === true, JSON.stringify(sheetScroll));
check('scrolling reaches the last section', sheetScroll.inView === true, JSON.stringify(sheetScroll));
await settle(600);
await page.screenshot({ path: resolve(SHOTS, 'bs-brawler-scrolled.png') });

await page.keyboard.press('Escape');
await settle(800);

/* ---- Stats -------------------------------------------------------------- */

console.log('\nStats');
await go('/bs/stats');
t = await body();
check('lists the log', /Last 23 battles/i.test(t), t);
// 8 decided of 23; the 15 showdowns place rather than win and must not be
// counted as losses.
check('rates only the decided battles', /6W 2L of 8/.test(t), t);
check('counts showdowns apart', /Showdowns/.test(t) && /15/.test(t), t);
// Was an assertion on the caption under this panel ("no stats endpoint"); the
// caption is gone, so the figure it qualified is what gets checked instead.
check('reports the trophy swing over the log', /[+-][\d,]+/.test(t), t);

// The trophy ladder is `type: "ranked"` on the wire. Calling it "Ranked"
// would mislabel 22 of these 23 battles.
check('calls a trophy match Trophies', /Trophies/.test(t), t);
check('shows a real map name', /Bustling Business/.test(t), t);
check('shows a mode played, not the event slot', /Solo Showdown/.test(t), t);
check('does not surface the event slot name', !/Mega Showdown/i.test(t), t);
check('groups by mode', /Breakdown/i.test(t), t);
const modeIcons = await imgs('img/bs-mode/');
check('mode icons resolve through the 48000000 offset', modeIcons >= 3, `${modeIcons} icons`);
await page.screenshot({ path: resolve(SHOTS, 'bs-stats.png') });

/*
 * The one `soloRanked` battle is the oldest of the 23, so it sits on the third
 * page of eight. Paging to it is the point: it is the only row in the capture
 * that should read "Ranked", and every other row must not.
 */
// LoadMore's accessibility label is "Load more"; its visible text carries the
// counts. clickLabel matches the label first, so match that.
await clickLabel('^Load more$');
await settle(900);
await clickLabel('^Load more$');
await settle(900);
t = await body();
check('calls the ranked queue Ranked', /\bRanked\b/.test(t), t);
check('labels the trophy ladder more often than the ranked queue', (t.match(/Trophies/g) ?? []).length > (t.match(/\bRanked\b/g) ?? []).length, t);

console.log('Battle detail');
await clickLabel('Brawl Ball on Bustling Business');
await settle(1200);
t = await body();
check('names both sides', /Your team/.test(t) && /Opponents/.test(t), t);
// The star is an icon now, not a glyph, so the name is what there is to match.
check('shows the star player', /Giorno Giovanna|まなあ|ERROR 404/.test(t), t);

/*
 * The real map, not the mode icon standing in for it.
 *
 * Maps used to be fetched from cdn.brawlify.com, which is unreachable here, so
 * this slot always showed its fallback and no check could tell the difference.
 * They are bundled now, and asserting on the *source directory* is what
 * distinguishes a map from the mode icon that replaces it when one is missing.
 */
const mapArt = await imgs('img/bs-map/');
check('the expanded battle shows the real map', mapArt >= 1, `${mapArt} map images`);
const fallbackMaps = await imgs('img/bs-mode/');
check('the map is not a mode icon fallback', mapArt >= 1, `${fallbackMaps} mode icons on screen`);
// Trophy art beside every participant's figure, and beside the battle delta.
const trophyArt = await imgs('img/arena/trophy');
check('participant scores carry a trophy icon', trophyArt >= 3, `${trophyArt} trophy icons`);
await page.screenshot({ path: resolve(SHOTS, 'bs-battle.png') });

/* ---- Club --------------------------------------------------------------- */

console.log('\nClub');
await go('/bs/club');
t = await body();
check('resolves the club', /LA GANG DI KUS/.test(t), t);
check('shows the type', /Invite only/i.test(t), t);
check('shows the roster size', /11\/30/.test(t), t);
check('shows roles', /President/.test(t) && /Senior/.test(t), t);
// Was an assertion on the "no club war endpoint" caption. The caption is gone;
// what it sat under -- the club's own totals, which really are everything the
// service will say about a club -- is what gets checked now.
check('shows the club totals', /527,385/.test(t), t);
// The fan-out is behind a button, not automatic: it is up to 30 requests.
check('does not fan out on open', /Load member details/i.test(t), t);
check('keeps member detail hidden until asked', !/Avg brawlers/i.test(t), t);
await page.screenshot({ path: resolve(SHOTS, 'bs-club.png') });

await clickLabel('Load member details');
await settle(2600);
t = await body();
check('loads member detail on request', /Avg brawlers/i.test(t), t);
check('counts power 11s across the club', /Power 11s/i.test(t), t);
// Two distinct captured profiles back the roster, so identical rows would
// mean the fan-out is ignoring the tag it was given -- which a single-profile
// fixture could never reveal.
check('maps each member to their own profile', /107 brawlers/.test(t) && /108 brawlers/.test(t), t);
check('reads each member’s own rank', /SILVER I/.test(t) && /GOLD I/.test(t), t);
await page.screenshot({ path: resolve(SHOTS, 'bs-club-loaded.png') });

/*
 * A brawler must open from *someone else's* profile too.
 *
 * It did not. The brawler view owned a Modal, React Native will not stack a
 * second one over the detail sheet, and the grid there was therefore rendered
 * with its tiles as plain views -- so every tile on every opponent's profile
 * was inert while the Home tab's worked fine. It is a layer of the same stack
 * now. The back arrow is the other half: this has to be a push onto the
 * player, not a replacement of it.
 */
console.log('A brawler inside the sheet');
// A roster row is labelled with the member's name alone; Alex2610 is the
// first in the captured club and has its own captured profile.
await clickLabel('^Alex2610$');
await settle(2400);
t = await body();
check('a roster row opens the member in the sheet', /Trophies/i.test(t) && /Ranked/i.test(t), t);

const tileOpened = await clickLabel(', power \\d+$');
check('a brawler tile in the sheet is tappable', tileOpened === true, String(tileOpened));
await settle(2000);
t = await body();
check('it opens the brawler, not a dead tap', /Star Powers/i.test(t) && /Gears/i.test(t), t);
// The back arrow only exists with something underneath, so it is the proof
// that this pushed onto the member rather than replacing them.
const canGoBack = await page.evaluate(() =>
  [...document.querySelectorAll('[role="button"]')]
    .filter((n) => n.getClientRects().length > 0)
    .some((n) => /^Back$/i.test(n.getAttribute('aria-label') ?? '')),
);
check('and stacks on the player rather than replacing them', canGoBack, String(canGoBack));
await page.screenshot({ path: resolve(SHOTS, 'bs-brawler-in-sheet.png') });

await clickLabel('^Back$');
await settle(1200);
t = await body();
check('back returns to the member, not the club', /Ranked/i.test(t) && !/Star Powers/i.test(t), t);
await page.keyboard.press('Escape');
await settle(800);

/* ---- Leaderboard -------------------------------------------------------- */

console.log('\nLeaderboard');
await go('/bs/leaderboard');
t = await body();
check('shows the player ladder', /Top players/i.test(t), t);
check('offers all three ladders', /Players/.test(t) && /Clubs/.test(t) && /By brawler/.test(t), t);
// The explanatory paragraph is gone; the fact it asserted -- global only, no
// country picker -- is still checked, by its absence on the next line.
check('has no location picker', !/Global\s*▾/.test(t), t);
await page.screenshot({ path: resolve(SHOTS, 'bs-leaderboard.png') });

await clickLabel('^Clubs$');
await settle(1400);
t = await body();
check('switches to the club ladder', /Top clubs/i.test(t), t);
check('shows member counts', /\/30 members/.test(t), t);

await clickLabel('By brawler');
await settle(1600);
t = await body();
check('offers a brawler picker', /Choose a brawler|Brawler/i.test(t), t);

/* ---- the ghost ---------------------------------------------------------- */

console.log('\nA reset account');
// Re-serving every player lookup as the zero profile is the only way to reach
// this: it is a real 200, and without the notice it reads as our bug.
process.env.FIXTURE_BS_PLAYER = 'ghost';
const ghostPage = await browser.newPage();
await ghostPage.setViewport({ width: 430, height: 932 });
await serveFixtures(ghostPage);
await ghostPage.goto(`${BASE}/bs`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await settle(2000);
const ghostText = await ghostPage.evaluate(() => document.body?.innerText ?? '');
check('explains a zeroed profile', /reset or inactive/i.test(ghostText), ghostText);
check('survives every optional field being absent', !/undefined|NaN/.test(ghostText), ghostText);
await ghostPage.screenshot({ path: resolve(SHOTS, 'bs-ghost.png') });
await ghostPage.close();

/* ---- runtime ------------------------------------------------------------ */

console.log('\nRuntime');
const broken = await page.evaluate(() =>
  [...document.querySelectorAll('img')]
    .filter((i) => i.complete && i.naturalWidth === 0)
    .map((i) => i.src.split('/').pop())
    .slice(0, 5),
);
check('no broken images', broken.length === 0, broken.join(', '));
// The text-node trap: `{someString && …}` inside a View is a browser warning
// and an Android crash, and most fields on these screens are optional.
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} failed\n` : '\nAll Brawl Stars screen checks passed.\n');
process.exit(failed ? 1 : 0);
