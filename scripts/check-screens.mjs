// Screen tests for the data-driven Clash of Clans views, run against the
// fixtures in scripts/fixtures.
//
//   node scripts/check-screens.mjs
//
// These screens cannot be exercised against the live API here -- the network
// blocks cocproxy.royaleapi.dev -- so without fixtures the village profile,
// clan, war and roster layouts could never be rendered or regression-tested.
//
// The account flow is the main thing under test: searching a tag on /coc must
// adopt it as the saved passport, because clan, war and builder all resolve
// their account from there. When that was missing those screens sat empty
// with nothing on screen explaining why.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serveFixtures } from './fixture-route.mjs';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932 });

await serveFixtures(page);

// The dev server moves to 5174/5175 when an earlier one is still holding the
// default port, so the base is overridable rather than hardcoded.
const BASE = process.env.CHECK_BASE ?? 'http://localhost:5173';

const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));
const body = () => page.evaluate(() => document.body?.innerText ?? '');
const go = (path) => page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });

/**
 * Clicks the *visible* element carrying an exact aria-label, scrolling it into
 * view first.
 *
 * Both qualifications matter. The detail sheet keeps every layer of its
 * back-stack mounted (hidden with display:none), so a plain querySelector
 * finds the copy on a buried layer first -- which Puppeteer cannot click, and
 * which is not what a user would be touching either. And the clan sheet runs
 * to several thousand pixels, so a target below the fold has no click point.
 */
const findVisible = (label) =>
  page.evaluateHandle((l) => {
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (n) => n.getAttribute('aria-label') === l && n.getClientRects().length > 0,
    );
    el?.scrollIntoView({ block: 'center' });
    return el ?? null;
  }, label);

const clickLabel = async (label, wait = 1200) => {
  const el = (await findVisible(label)).asElement();
  if (!el) throw new Error(`no visible element labelled "${label}"`);
  await settle(200);
  await el.click();
  await settle(wait);
};

/** Whether a visible element with that label exists at all. */
const hasLabel = async (label) => Boolean((await findVisible(label)).asElement());

/**
 * Shape of an HGrid scroller: how many columns it laid out, and whether it
 * actually overflows. RNW renders ScrollView as an outer div (which carries
 * the aria-label) wrapping the content container, so the columns are the
 * grandchildren.
 */
const gridShape = (label) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (n) => n.getAttribute('aria-label') === l && n.getClientRects().length > 0,
    );
    if (!el) return null;
    const track = el.firstElementChild;
    return {
      columns: track ? track.children.length : 0,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  }, label);
const results = [];
const check = (label, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

// Start with an empty profile: nothing saved, as a first-time user would be.
await go('/coc');
await settle(2200);

/**
 * The active passport's tag for a game, read straight out of storage.
 *
 * Passport holds a list now -- `{ passports: [...], activeId }` -- so a tag
 * adopted here lands in whichever record is active rather than in a single
 * `passport` object.
 */
const savedTag = (game) =>
  page.evaluate((g) => {
    const raw = localStorage.getItem('sch');
    if (!raw) return null;
    const { passports = [], activeId } = JSON.parse(raw);
    return passports.find((p) => p.id === activeId)?.[g] ?? null;
  }, game);

check('starts with no saved tag', !(await savedTag('coc')), String(await savedTag('coc')));

// Type a tag into the search box and submit.
const input = await page.evaluateHandle(
  () => [...document.querySelectorAll('[aria-label]')].find((n) => n.getAttribute('aria-label') === 'Player tag') ?? null,
);
if (!input.asElement()) {
  check('search field present', false);
} else {
  await input.asElement().click();
  await page.keyboard.type('#LJ9V8LCYQ');
  await page.keyboard.press('Enter');
  await settle(2500);
  check('player loaded from search', (await body()).includes('DenCT'));

  // Adopting into the *active* passport, not creating a second one: searching
  // a tag on Home means "this is my account", not "here is another passport".
  const tag = await savedTag('coc');
  check('tag auto-saved to the active passport', tag === '#LJ9V8LCYQ', String(tag));
  const count = await page.evaluate(
    () => JSON.parse(localStorage.getItem('sch') ?? '{}').passports?.length ?? 0,
  );
  check('and did not add a second passport', count === 1, `${count} passports`);
}

/*
 * The hall progress card.
 *
 * Everything in it is derived from the player endpoint and the catalog, so it
 * renders for any player -- which is the point of it, and why these checks run
 * on a plain search result rather than on an imported village. The
 * denominator is the *catalog's*: 548 army levels at Town Hall 13, which is
 * what proves Super Troops are being left out (they would take it past 700)
 * and that hero equipment is off the headline (it would more than double it).
 */
const card = await body();
check('hall progress card renders', /Town Hall 13 progress/.test(card), '');
check('completion is level-weighted and stated', /\d+ \/ \d+ levels/.test(card), '');
check(
  'the headline counts the army, not the whole book',
  /\b224 \/ 548 levels\b/.test(card),
  card.match(/\d+ \/ \d+ levels/)?.[0] ?? 'no level count',
);
check('a rushed account is flagged with how far short it is', /Rushed · \d+%/.test(card), '');
check(
  'each category carries a bar and a behind-the-last-hall count',
  /Heroes\s+\d+%\s+⚠ 3/.test(card),
  card.match(/Heroes[\s\S]{0,24}/)?.[0] ?? '',
);
// Hero equipment is bought with ore rather than levelled against a hall, so it
// is reported below the divider and never contributes a warning.
check('hero equipment is listed but never called behind', /Hero Equipment\s+\d+%\s*\n/.test(card), '');
check('the card says what it did and did not measure', /publishes no building levels/.test(card), '');

await clickLabel('Spells, 38 percent');
const opened = await body();
check('a category expands to what is left', /Left to upgrade for TH13/.test(opened), '');
check('and each tile says how many levels that is', /\+\d+ to go/.test(opened), '');
const leftGrid = await gridShape('Spells left to upgrade');
check('the remaining grid is its own scroller', Boolean(leftGrid), JSON.stringify(leftGrid));
await clickLabel('Spells, 38 percent');

/*
 * Buildings are gone from this screen entirely.
 *
 * They used to render as a wall of grey "?" tiles above a prompt to paste a
 * village export -- which exists only for your own account, never for the clan
 * member whose profile this same component draws.
 */
const noBuildings = await body();
check('buildings are not listed on a player profile', !/no building levels\. Import/.test(noBuildings), '');
check('the army panel is named for what it holds', /\bArmy\b/.test(noBuildings), '');

// The village switch governs the card as well as the grids, which is why it
// moved above the card.
await clickLabel('Builder Base');
const builderCard = await body();
check('the card follows the village tabs', /Builder Hall 9 progress/.test(builderCard), '');
check(
  'and measures only what the Builder Base has',
  /Measured over heroes and troops/.test(builderCard),
  builderCard.match(/Measured over [^.]*/)?.[0] ?? '',
);
await clickLabel('Home Village');

// The army grids are horizontal scrollers, not wrapping lists, and the row
// count is a function of group size: one row up to eight items, three above.
// Column counts are asserted because they are what proves which branch ran.
//
// The sizes are the *catalog's*, not the fixture's: these sections list every
// item in the book and mark each as owned, ready or locked, so a Town Hall 13
// account shows all 18 Home Village spells rather than the 8 it owns.
const heroes = await gridShape('Heroes summary');
check('hero strip is one row (4 owned heroes)', heroes?.columns === 4, JSON.stringify(heroes));

const spells = await gridShape('Spells');
check(
  'all 18 spells listed, over three rows',
  spells?.columns === Math.ceil(18 / 3),
  JSON.stringify(spells),
);

const troops = await gridShape('Troops');
check(
  'all 33 troops listed, over three rows',
  troops?.columns === Math.ceil(33 / 3),
  JSON.stringify(troops),
);

// The reported bug: the service returns no pet rows for an account below Town
// Hall 14, so a section built from the response was missing entirely.
const pets = await gridShape('Pets');
check('every pet is listed, owned or not', pets?.columns === Math.ceil(12 / 3), JSON.stringify(pets));

const collection = await body();
check('locked entries say so', collection.includes('Locked'), '');

// Super Troops are their own group now. They used to sit inside Troops with no
// catalog entry behind them, so every tile fell back to a text placeholder and
// tapping one said the reference had no stats.
const supers = await gridShape('Super Troops');
check('super troops have their own group', supers?.columns === Math.ceil(17 / 3), JSON.stringify(supers));
check(
  'army grid actually scrolls sideways',
  Boolean(troops && troops.scrollWidth > troops.clientWidth),
  troops ? `${troops.scrollWidth} > ${troops.clientWidth}` : 'missing',
);

/*
 * The item card, opened from a player rather than from the Clash Book.
 *
 * The service's own `maxLevel` is the *game* maximum -- 18 for a Barbarian
 * Puppet -- while 15 is all a Town Hall 13 Blacksmith can reach, and 15 is the
 * number a player is actually asking for. Asserting both is what would catch
 * the cap silently reverting to the game figure.
 */
await clickLabel('View Barbarian Puppet level 13');
const itemCard = await body();
check('the card caps the item at this hall', /Level 13 \/ 15 for TH13/.test(itemCard), '');
check('and still names the game maximum', /Game max: 18/.test(itemCard), '');
check(
  'the rest of the way is totalled',
  /To reach the TH13 max · 2 levels to go/.test(itemCard),
  itemCard.match(/To reach[^\n]*/)?.[0] ?? '',
);
// Equipment costs ore and no time at all, so no total-time row should appear.
check('no time is claimed for an ore-bought upgrade', !/Total time/.test(itemCard), '');
check('equipment names the hero wearing it', /Worn by\s*\n\s*Barbarian King/.test(itemCard), '');
await clickLabel('Close item details', 1200);

// The Battles section. Clash of Clans has no battle log, so this is war
// attacks: the live war plus the league rounds, both of which the generated
// fixtures seed the calibration account into (see `adopt` in make-fixtures).
let home = await body();
check('battles section renders', /Battles/.test(home) && /War attacks/i.test(home), home);
check('counts the stars taken and conceded', /Stars taken/i.test(home) && /Stars conceded/i.test(home), home);
check('counts the defences faced', /Defences faced/i.test(home), home);
check('offers attack and defence filters', /\bAttacks\b/.test(home) && /\bDefences\b/.test(home), home);
check('lists an attack', /Attacked /.test(home), home);
check('lists a defence', /Defended against /.test(home), home);
check('names the live war', /Current war/i.test(home), home);
check('reaches the league rounds too', /War league · round \d/i.test(home), home);
// Not "says there is no battle log" any more -- Clash of Clans has one since
// the League Tier update, this section just does not read it yet. The
// assertion is that the copy still describes what is actually on screen.
check('says these are war attacks only', /War attacks only/i.test(home), home);
// Collapsed rows carry no attack length or map position detail.
check('keeps attack detail collapsed', !/Attack length/i.test(home), home);

const openedAttack = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find((n) =>
    /^Attacked .*show details$/i.test(n.getAttribute('aria-label') ?? ''),
  );
  el?.click();
  return Boolean(el);
});
check('an attack row is tappable', openedAttack);
await settle(1200);
home = await body();
check('expands to the attack detail', /Attack length/i.test(home), home);
check('shows the defender’s base', /Map position \d/.test(home), home);
check('shows the attack order', /in the war/i.test(home), home);
check('shows the attack length as mm:ss', /\d+:\d{2}/.test(home), home);
check('offers to open the defender', /View /.test(home), home);

// Filtering to defences must leave only defences.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find(
    (n) => (n.getAttribute('aria-label') ?? '') === 'Defences',
  );
  el?.click();
});
await settle(1200);
home = await body();
check('filters to defences only', !/Attacked /.test(home) && /Defended against /.test(home), home);

// The actual symptom: clan, reached without ever opening Passport.
await go('/coc/clan');
await settle(2500);
check('clan card resolves without visiting Passport', (await body()).includes('bruh'));

// Tapping the card opens the profile sheet over the finder.
await clickLabel('View bruh', 2500);
const sheet = await body();
check('clan sheet opens', sheet.includes('Clan War') && sheet.includes('#2PP'));
check('war record and rate shown', /66% win rate|68% win rate|\d+% win rate/.test(sheet), '');
check('clan capital section present', sheet.includes('Clan Capital (Lv. 10)'));
check('language and labels read from the clan record', sheet.includes('English'));

// Nine districts is over the single-row threshold, so they lay out as three
// rows of three.
const districts = await gridShape('Clan Capital districts');
check('nine districts over three rows', districts?.columns === 3, JSON.stringify(districts));
check('district names resolved', sheet.includes('Capital Peak') && sheet.includes('Goblin Mines'));

check('member roster renders', sheet.includes('Chief 1') && sheet.includes('Members'));
check('member rank movement shown', /[▲▼]\s*\d/.test(sheet));

/**
 * Member rows in their rendered order, read off their own labels.
 *
 * Visible only: buried stack layers stay mounted, so their rows would
 * otherwise be counted alongside the ones actually on screen.
 */
const memberOrder = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-label^="View "]')]
      .filter((n) => n.getClientRects().length > 0)
      .map((n) => n.getAttribute('aria-label').replace('View ', ''))
      .filter((n) => n !== 'bruh'),
  );

check('rank sort leads with rank 1', (await memberOrder())[0] === 'Chief 1');

// Sorting is local to the memberList already in hand -- no second request.
// Name order is the unambiguous one to assert: "Archer 11" sorts above
// "Archer 5" because localeCompare reads the digits as text.
await clickLabel('Name', 900);
check('name sort reorders the roster', (await memberOrder())[0] === 'Archer 11', (await memberOrder())[0]);

// --- Capital raids -------------------------------------------------------
await clickLabel('Capital raids', 3000);
const raids = await body();
check('capital raids opens', raids.includes('Raid Weekends'));
check('countdown rendered', /Raid Weekend (ends|in)|Next Raid Weekend in/.test(raids));
check('weekend totals computed', /per attack/.test(raids) && /Districts/.test(raids));
check('offense/defense split shown', /\d+ offense · \d+ defense/.test(raids));

// Expanding a raider shows their breakdown without another request.
const raider = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((n) =>
    / looted .* capital gold$/.test(n.getAttribute('aria-label') ?? ''),
  );
  return el?.getAttribute('aria-label') ?? null;
});
if (!raider) {
  check('raid member row present', false);
} else {
  await clickLabel(raider, 700);
  const expanded = await body();
  check('raid member expands in place', expanded.includes('Looted') && expanded.includes('Average'));
  check('expanded raider offers a profile link', await hasLabel(`View ${raider.split(' looted ')[0]}`));
}

// The stepper walks back through the weekends it has loaded.
const firstWeekend = await page.evaluate(
  () => document.body.innerText.match(/[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+/)?.[0] ?? '',
);
await clickLabel('Older weekend', 1000);
const secondWeekend = await page.evaluate(
  () => document.body.innerText.match(/[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+/)?.[0] ?? '',
);
check(
  'weekend stepper moves to an older weekend',
  Boolean(firstWeekend) && firstWeekend !== secondWeekend,
  `${firstWeekend} -> ${secondWeekend}`,
);

// "Load older" pages through the API's own cursor; the fixture serves a
// second page of six, so the strip grows past the first ten.
const weekendCount = () =>
  page.evaluate(
    () => document.querySelectorAll('[aria-label^="Weekend of "]').length,
  );
const before = await weekendCount();
await clickLabel('Load older weekends', 2500);
const afterLoad = await weekendCount();
check('cursor pagination appends older weekends', afterLoad > before, `${before} -> ${afterLoad}`);

// --- Attacks and Defences ------------------------------------------------
// Both logs come off the selected weekend. The per-capital average is computed
// from each log separately; reusing the season's own totalAttacks would print
// the offence figure under Defences.
const logs = await body();
check('attacks log renders', /Attacks\s+13\s+[\d.]+ attacks per capital/.test(logs), '');
check('defences log renders', /Defences\s+8\s+[\d.]+ attacks per capital/.test(logs), '');
const averages = [...logs.matchAll(/([\d.]+) attacks per capital/g)].map((m) => m[1]);
check('each log averages over its own entries', averages.length === 2, averages.join(' / '));
check(
  'perfect and partial raids both render',
  /Perfect raid/.test(logs) && /\d of 9 districts/.test(logs),
);

// A raid collapses to its districts, and a district to its individual attacks.
await clickLabel('Raid on animal brothers', 900);
const raidOpen = await body();
check(
  'raid expands to its districts',
  raidOpen.includes('Capital Peak') && raidOpen.includes('Goblin Mines'),
);

await clickLabel('Capital Peak in the raid on animal brothers', 800);
check('district expands to its attackers', await hasLabel('View Twitch Lurmii'));

// The point of the back-stack: push a player on from three levels down, then
// come back to a capital raids page that is still exactly as it was left.
await clickLabel('View Twitch Lurmii', 2500);
const sheetPlayer = await body();
check('attacker opens a player inside the sheet', sheetPlayer.includes('Town Hall 13'));
/*
 * The whole point of deriving progress from the player endpoint rather than
 * from a village export: it works for somebody else's account.
 *
 * The screen underneath is the clan finder, which never renders a player, so
 * this string can only have come from the sheet.
 */
check(
  'and that player gets the same progress card',
  /Town Hall \d+ progress/.test(sheetPlayer) && /Rushed · \d+%|Heroes\s+\d+%/.test(sheetPlayer),
  sheetPlayer.match(/Town Hall \d+ progress/)?.[0] ?? 'no card',
);
await clickLabel('Back', 1500);
check(
  'back restores the expanded raid rather than resetting the page',
  (await body()).includes('Goblin Mines'),
);

// --- War history ---------------------------------------------------------
await clickLabel('Back', 1200);
await clickLabel('War History', 3000);
const warLog = await body();
if (process.env.FIXTURE_WARLOG === 'private') {
  // A 403 is a clan setting, not a fault, and gets its own explanation
  // rather than the generic service-error panel.
  check(
    'private war log explains itself',
    warLog.includes('This war log is private') && !/Game service error/.test(warLog),
  );
} else {
  check(
    'war history lists wars',
    /WIN|LOSS|TIE/.test(warLog) && warLog.includes('Confusion'),
    warLog.replace(/\n/g, ' ').slice(0, 80),
  );

  // A row expands to the two split bars and the stat grid. `expEarned` and
  // `attacks` exist only on our side of a war log entry, so they are labelled
  // as ours rather than shown as a pair.
  await clickLabel('War against Confusion', 900);
  const warOpen = await body();
  check('war row expands to stars and destruction bars', /Stars/.test(warOpen) && /Destruction/.test(warOpen));
  check(
    'war stat grid renders',
    ['Members', 'Attacks used', 'Attacks per member', 'XP earned', 'Opponent level', 'Ended'].every(
      (l) => warOpen.includes(l),
    ),
  );

  // Tapping the opponent's name pushes their clan; the war log underneath is
  // untouched and one back press away.
  await clickLabel('View Confusion', 2500);
  check('war log opponent opens their clan', (await body()).includes('Clan Capital'));
  await clickLabel('View Chief 1', 2500);
  check('their roster opens a player', (await body()).includes('Town Hall 13'));
  await clickLabel('Back', 1200);
  await clickLabel('Back', 1200);
  check('back lands on the war log still expanded', (await body()).includes('Attacks per member'));
}

await clickLabel('Back', 1200);
check('back returns to the clan page', (await body()).includes('Clan Capital (Lv. 10)'));

await clickLabel('Close sheet', 1200);
check('sheet closes back to the finder', !(await body()).includes('Clan Capital (Lv. 10)'));

await go('/coc/war');
await settle(3000);

// The screen opens on whichever war is live. The fixture clan is in a league
// season, so that is the tab that must come up -- a clan in CWL landing on an
// empty "no active war" board is the bug this screen was rebuilt to fix.
const season = await body();
check('war opens on the live league season', season.includes('Round 4 of 7'));
check('league phase is named', season.includes('Battle day'));
check('war league badge and name resolve', season.includes('Gold League II'));

// Standings are summed across the season, not read off one war.
check('standings include the win bonus', /\b1\d\d\b/.test(season) && season.includes('Standings'));
check('promotion and relegation lines are drawn', season.includes('Promotion') && season.includes('Relegation'));

// Participating clans: average Town Hall, roster size, and the legend's caps.
check('participating clans are listed', season.includes('Participating Clans'));
check('clan rows carry an average Town Hall', /Avg\. TH \d+\.\d/.test(season));
check('Town Hall legend spans the whole group', season.includes('TH18') && season.includes('TH3'));

// Rounds 6 and 7 are `#0` placeholders in the fixture, as the API sends them.
check('undrawn rounds read as upcoming', season.includes('Upcoming'));

// Expanding a clan must show its roster, not just flip a chevron -- a heading
// that renders above a dead body has passed a check here before.
await clickLabel('Roster of THE DRAGONS', 1200);
const roster = await body();
check('a clan expands to its roster', roster.includes('THE DRAGONS 1') && roster.includes('THE DRAGONS 10'));
check('roster rows carry a tag', /#[0289PYLQGRJCUV]{3,}/.test(roster));

// Rosters page ten at a time like every other long list, so the fifteenth
// member is deliberately not in the first page -- and the button has to
// actually produce them, which is the half of paging that can silently fail.
check('the roster pages rather than listing every member', !roster.includes('THE DRAGONS 15'), roster.slice(0, 80));
await clickLabel('Load more', 1000);
check('load more reveals the rest of the roster', (await body()).includes('THE DRAGONS 15'));
await clickLabel('View THE DRAGONS 1', 2500);
check('a league roster row opens that player', (await body()).includes('Town Hall 13'));
await clickLabel('Close sheet', 1200);
await clickLabel('Roster of THE DRAGONS', 1000);

// A round now opens its own screen: match tabs, then Summary / War Events /
// both rosters.
await clickLabel('Round 4', 2500);
const round = await body();
check('a round opens its own screen', round.includes('Round 4') && round.includes('Season:'));
check('matches are tabbed, yours first', round.includes('Your Match') && round.includes('Match 2'));
check('summary counts what is still to attack', /attacks left/.test(round));
check('summary compares the two clans', round.includes('Head to head') && round.includes('Avg. stars'));

await clickLabel('War Events', 1500);
const events = await body();
check('war events list every attack', /\d+%/.test(events) && events.includes('War has begun!'));
check('events carry a running score', /\d+-\d+/.test(events));

await clickLabel('bruh', 1500);
const warRoster = await body();
check('a clan tab shows its war roster', warRoster.includes('#2PP') && warRoster.includes('War Stars'));
check('roster rows show the attack made', /→ #\d+/.test(warRoster));
check('roster rows show the defence taken', warRoster.includes('Not attacked'));

await clickLabel('Back', 1500);
check('back returns to the season', (await body()).includes('Round 4 of 7'));

// The regular war board is behind its own tab, with the same views.
await clickLabel('Current War', 1500);
const board = await body();
check('the current war tab renders', board.includes('Still to attack'));
check('the board counts down', /Ends in \d+h/.test(board));

await clickLabel('View bruh 4', 2500);
check('war roster row opens a player', (await body()).includes('Town Hall 13'));
await clickLabel('Close sheet', 1200);

await go('/coc/leaderboard');
await settle(2500);
const players = await body();
check('players ladder loads', players.includes('Legend 1'));
check('rank movement shown', /[▲▼]\s*\d/.test(players), players.match(/[▲▼]\s*\d+/)?.[0] ?? '');
// 25 rows a tap, so the first network page is on screen at once -- but only
// that page: the second is behind the cursor and must not be there yet.
check('the first page is on screen', players.includes('Legend 25'));
check('and the second has not been fetched', !players.includes('Legend 26'));

/*
 * Paging past the first response.
 *
 * The ladder path used to hardcode `limit=25`, so the board stopped there
 * whatever the button said. Load more now reveals the rest of the page it has,
 * then follows `paging.cursors.after` for the next one -- and the fixture's
 * second page is ranks 26-50, so "Legend 50" proves a real second request
 * rather than the first page served twice.
 */
for (let i = 0; i < 6; i++) {
  const more = await page.$$eval('[aria-label="Load more"]', (els) =>
    els.some((e) => e.getClientRects().length > 0),
  );
  if (!more) break;
  await clickLabel('Load more', 900);
}
const paged = await body();
check('the first page is reachable in full', paged.includes('Legend 25'));
check('the cursor fetches a real second page', paged.includes('Legend 50'));
check('the button retires when the service offers no cursor', !/Load more/.test(paged));

await clickLabel('Clans');
await settle(1500);
const clans = await body();
check('clans ladder loads', clans.includes('ABO_FAHAD CLAN 1'));
// The two now sit either side of a clan icon rather than a "·" separator.
check(
  'clan rows show location and size',
  /United States/.test(clans) && /50\/50/.test(clans),
);

await clickLabel('Capital');
await settle(1500);
// clanCapitalPoints, not clanPoints -- proves the capitals endpoint was used.
check('capital ladder uses its own score', (await body()).includes('3771'));

await clickLabel('Choose location');
await settle(1200);
await clickLabel('Japan');
await settle(1500);
check('location picker applies', (await body()).includes('JAPAN'));

// --- Builder Plan ---------------------------------------------------------
// Driven entirely by a pasted village export -- the API returns no upgrade
// timers, no building levels and no Builder Base troops -- so the import is
// performed here exactly as a player would, by typing into the field.
await go('/coc/builder');
await settle(2000);
check('builder asks for an import first', (await body()).includes('No village imported'));

await clickLabel('Import village data now', 1200);
check('import sheet explains where the export lives', (await body()).includes('More Settings'));

const exported = readFileSync(resolve(FIXTURES, 'coc-village-export.json'), 'utf8');
await page.evaluate((json) => {
  const field = [...document.querySelectorAll('[aria-label]')].find(
    (n) => n.getAttribute('aria-label') === 'Village export JSON',
  );
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter.call(field, json);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}, exported);
await settle(600);
await clickLabel('Import pasted data', 2500);

const plan = await body();
check('hall level read from the export', /Town Hall 13/.test(plan));
check('builder count read from the placed huts', /builder(s)? free|All builders busy/.test(plan));
check(
  'in-progress upgrades resolve to real items',
  /Dark Barracks/.test(plan) && /Eagle Artillery/.test(plan),
);
check('walls counted against the hall allowance', /300\s*\n?\s*Walls left/.test(plan), '');
check('plan projects a completion date', /Everything maxed by/.test(plan));
check('village grid sections render', /Defenses/.test(plan) && /Traps/.test(plan));

// The timeline used to be the one place on this screen where an upgrade was
// not tappable, and its bars carried text only -- name, level and duration
// crammed into 9px inside a 24px bar. They carry the item's artwork now and
// open the same Clash Book entry the lists below do.
const ganttBars = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label]')]
    .map((n) => n.getAttribute('aria-label') ?? '')
    .filter((l) => / to level \d+, /.test(l)),
);
check('the plan timeline has tappable bars', ganttBars.length > 0, `${ganttBars.length} bars`);
if (ganttBars.length) {
  // clickLabel matches the label exactly, so the raw string is what it wants.
  const barName = ganttBars[0].replace(/ to level \d+,.*$/, '');
  await clickLabel(ganttBars[0], 1600);
  const opened = await body();
  // Asserted against *this item's* catalog heading ("Cannon · Level 8"), not a
  // bare /Level \d+/ -- the builder page behind the sheet is full of levels, so
  // a loose match would pass even if the sheet never opened.
  check(
    'a timeline bar opens that item in the catalog',
    new RegExp(`${barName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · Level \\d+`).test(opened),
    `${barName} — ${opened.slice(0, 120)}`,
  );
  await page.keyboard.press('Escape');
  await settle(800);
}

// Crafted defenses live inside the Crafting Station's `types` array, not the
// building list, so the parser walked past all three and the Defenses grid
// never showed them. Their module levels ride on the tile's label because a
// crafted defense has no single level to print.
const craftedTile = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label]')]
    .map((n) => n.getAttribute('aria-label'))
    .find((l) => l?.startsWith('View Hero Hunter')),
);
check('crafted defenses reach the builder plan', Boolean(craftedTile), String(craftedTile));
check(
  'crafted defense tile names its module levels',
  /Hitpoints 2/.test(craftedTile ?? ''),
  String(craftedTile),
);

await clickLabel('Builder Base', 2000);
const bb = await body();
check('builder base reads the *2 arrays', /Builder Hall 8/.test(bb));
check('rushed villages are flagged', /Rushed/.test(bb));
// Grid tiles carry no visible name -- art, count and level only -- so the
// aria-label is where an item proves it reached the grid at all.
const shackTile = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label]')]
    .map((n) => n.getAttribute('aria-label'))
    .find((l) => l?.includes('B.O.T.O')),
);
check("B.O.T.O's Shack is recognised, not dropped", Boolean(shackTile), String(shackTile));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${failed ? '✗ FAIL' : '✓ OK'} — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
