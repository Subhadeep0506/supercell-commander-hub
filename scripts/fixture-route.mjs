// Shared fixture routing for the browser-check scripts.
//
// Both check-web.mjs and check-screens.mjs intercept the Clash of Clans proxy
// and answer from scripts/fixtures. Keeping the mapping here stops the two
// from drifting -- the first time they did, half the ranking assertions failed
// against a 404 rather than against the app.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, 'fixtures');

/** A bundled image stands in for Supercell's CDN, which is unreachable here. */
const CDN_STANDIN = resolve(here, '../src/assets/img/nav/clan.webp');

/**
 * Set FIXTURE_WARLOG=private to answer the war log with a bare 403, which is
 * what the real API returns for a clan that keeps its log private. That branch
 * has its own empty state and is otherwise unreachable from here.
 */
const PRIVATE_WAR_LOG = process.env.FIXTURE_WARLOG === 'private';

/**
 * Set FIXTURE_CDN=block to fail every CDN image instead of standing one in.
 *
 * That is what a restricted network actually does, and it is the only way to
 * see the bundled fallbacks -- with the stand-in answering, every remote badge
 * "succeeds" and the fallback branch never runs.
 */
const BLOCK_CDN = process.env.FIXTURE_CDN === 'block';

/**
 * Set FIXTURE_CWL=none to answer the league group with a 404.
 *
 * That is what the API returns for a clan that is not signed up, and it is the
 * only way to reach the "Not in war league" empty state -- which must not look
 * like a service error, because for eleven months of the year it is the normal
 * answer.
 */
const NO_LEAGUE = process.env.FIXTURE_CWL === 'none';

/**
 * The 56 possible league wars live in one file keyed by war tag rather than 56
 * files, so `/clanwarleagues/wars/{tag}` is looked up rather than mapped.
 */
const LEAGUE_WARS = resolve(FIXTURES, 'coc-league-wars.json');

/** Request path -> fixture filename. Most specific patterns first. */
export function fixtureFor(url) {
  // Must precede the /currentwar rule: the league group hangs off that same
  // path, so the looser pattern would answer it with the regular-war fixture
  // and the league tab would render a war that is not in any league.
  if (/\/currentwar\/leaguegroup/.test(url)) return 'coc-league-group.json';
  if (/\/currentwar/.test(url)) return 'coc-war.json';
  // Both sit under /clans/{tag}/, so they must precede the /clans/ catch-all.
  if (/\/capitalraidseasons/.test(url)) {
    return /[?&]after=/.test(url) ? 'coc-capital-raids-2.json' : 'coc-capital-raids.json';
  }
  if (/\/warlog/.test(url)) return 'coc-war-log.json';
  if (/rankings\/capitals/.test(url)) return 'coc-rank-clans-capital.json';
  if (/rankings\/clans-builder-base/.test(url)) return 'coc-rank-clans-builder.json';
  if (/rankings\/clans/.test(url)) return 'coc-rank-clans-home.json';
  if (/rankings\/players-builder-base/.test(url)) return 'coc-rank-players-builder.json';
  if (/rankings\/players/.test(url)) return 'coc-rank-players-home.json';
  if (/\/locations\?/.test(url)) return 'coc-locations.json';
  if (/\/clans\?name=/.test(url)) return 'coc-clans-search.json';
  if (/\/clans\//.test(url)) return 'coc-clan.json';
  if (/\/players\//.test(url)) return 'coc-player.json';
  return null;
}

/** Attaches interception to a Puppeteer page. */
export async function serveFixtures(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();

    if (url.includes('api-assets.clashofclans.com')) {
      if (BLOCK_CDN) return void req.abort();
      return void req.respond({
        status: 200,
        contentType: 'image/webp',
        body: readFileSync(CDN_STANDIN),
      });
    }
    if (!url.includes('/api/coc/')) return void req.continue();

    if (NO_LEAGUE && /\/currentwar\/leaguegroup/.test(url)) {
      return void req.respond({
        status: 404,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ reason: 'notFound' }),
      });
    }

    // One file, keyed by war tag. An unknown tag 404s exactly as the API does
    // once a season has rolled over and its wars have aged out.
    if (/\/clanwarleagues\/wars\//.test(url)) {
      const tag = decodeURIComponent(url.split('/clanwarleagues/wars/')[1] ?? '');
      const wars = existsSync(LEAGUE_WARS) ? JSON.parse(readFileSync(LEAGUE_WARS, 'utf8')) : {};
      const found = wars[tag];
      return void req.respond({
        status: found ? 200 : 404,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(found ?? { reason: 'notFound' }),
      });
    }

    if (PRIVATE_WAR_LOG && /\/warlog/.test(url)) {
      return void req.respond({
        status: 403,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ reason: 'accessDenied', message: 'War log is private.' }),
      });
    }

    const name = fixtureFor(url);
    const file = name ? resolve(FIXTURES, name) : null;
    if (!file || !existsSync(file)) {
      return void req.respond({ status: 404, contentType: 'application/json', body: '{}' });
    }
    req.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(file, 'utf8'),
    });
  });
}
