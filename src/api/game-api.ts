// Ported from frontend/src/lib/game-api.ts.
//
// Nothing here is transport-specific: the schema, tag normalisation and the
// endpoint builder are otherwise identical between the SSR app and this one.
// Only client.ts changes.
//
// Deliberate divergence: `capitalRaids` and `warLog` exist here only. They back
// the clan detail sheet, which the SSR app has no equivalent of, so porting
// them back would be dead code there. Everything else stays in step, and the
// vitest suite in frontend/ still covers the shared half.
//
// The ten Clash Royale resources below are a second, larger divergence. The SSR
// app only ever asked CR for `player`, `clan`, `battles`, `catalog` and a single
// hardcoded global ladder; the RN app covers the whole live surface.
import { z } from 'zod';

/**
 * Clash Royale resources. Rejected for `coc` and `bs`, which have no
 * equivalent -- asking the CoC proxy for `/v1/leaderboards` 404s, and a 404 is
 * indistinguishable from "this clan has no history" at the call site.
 */
const CR_ONLY = [
  'upcomingChests',
  'riverRace',
  'riverRaceLog',
  'pathOfLegend',
  'seasons',
  'leaderboards',
  'leaderboardRankings',
  'globalTournaments',
  'tournament',
  'tournamentSearch',
] as const;

/** Clash of Clans resources, rejected for the other two games. */
const COC_ONLY = ['war', 'capitalRaids', 'warLog', 'leagueGroup', 'leagueWar'] as const;

/** Every resource addressed by a player, clan, war or tournament tag. */
const TAGGED = [
  'player',
  'clan',
  'war',
  'battles',
  'capitalRaids',
  'warLog',
  'leagueGroup',
  'leagueWar',
  'upcomingChests',
  'riverRace',
  'riverRaceLog',
  'tournament',
] as const;

export const gameRequestSchema = z
  .object({
    game: z.enum(['coc', 'cr', 'bs']),
    resource: z.enum([
      'player',
      'clan',
      'war',
      'battles',
      'catalog',
      'leaderboard',
      'events',
      'clanSearch',
      'locations',
      'capitalRaids',
      'warLog',
      'leagueGroup',
      'leagueWar',
      ...CR_ONLY,
    ]),
    tag: z.string().optional(),
    name: z.string().optional(),
    /**
     * Page size for the cursor-paged clan histories, and the ranking ladders.
     *
     * Raised from 50 to 100 for the ladders: a board capped at 50 was the
     * reason "show more players" had nowhere to go. 100 is the largest page
     * the services are documented to accept; anything past the first page
     * comes through `after`.
     */
    limit: z.number().int().positive().max(100).optional(),
    /** `paging.cursors.after` from the previous page of the same resource. */
    after: z.string().optional(),
    /** Leaderboard only: which ladder to read. */
    board: z.enum(['players', 'clans']).optional(),
    /**
     * Leaderboard only. `capital` is a CoC clan ladder and has no player form;
     * `war` is the CR clan-wars ladder and has no CoC form.
     */
    mode: z.enum(['home', 'builder', 'capital', 'war']).optional(),
    /**
     * A location id from the `locations` resource, or 'global'.
     *
     * Used by the leaderboards, and by `clanSearch` as a filter.
     */
    locationId: z.union([z.string(), z.number()]).optional(),

    /*
     * ---- clanSearch filters ------------------------------------------------
     *
     * Both games filter server side, which matters: the name search returns a
     * single capped page, so filtering it in the app would hide clans that
     * match rather than find them.
     *
     * The two games do not accept the same parameters. Clash of Clans scores
     * clans in points and knows about clan level and war frequency; Clash
     * Royale has a single `minScore` and neither of the others. Sending a
     * CoC-only filter to Royale is a 400, so `endpoint()` emits each only for
     * the game that has it.
     */
    minMembers: z.number().int().min(1).max(50).optional(),
    maxMembers: z.number().int().min(1).max(50).optional(),
    /** Clash of Clans only. */
    minClanPoints: z.number().int().nonnegative().optional(),
    /** Clash of Clans only. */
    minClanLevel: z.number().int().min(1).max(30).optional(),
    /** Clash of Clans only. */
    warFrequency: z
      .enum(['always', 'moreThanOncePerWeek', 'oncePerWeek', 'lessThanOncePerWeek', 'never'])
      .optional(),
    /** Clash Royale only -- its equivalent of `minClanPoints`. */
    minScore: z.number().int().nonnegative().optional(),
    /**
     * `pathOfLegend` only: a season id from the `seasons` resource, like
     * "2026-10". The *current* season 404s until it closes, so the picker must
     * offer finished seasons only.
     */
    season: z.string().optional(),
    /** `leaderboardRankings` only: an `id` from the `leaderboards` resource. */
    leaderboardId: z.union([z.string(), z.number()]).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.resource === 'clanSearch' &&
      (value.game === 'bs' ||
        (value.name?.trim().length ?? 0) < 3 ||
        (value.name?.length ?? 0) > 60)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a clan name of 3–60 characters.',
        path: ['name'],
      });
    }
    // A filter the target game does not have is a 400 from the service, so it
    // is caught here where the message can say which game is the problem.
    if (value.resource === 'clanSearch' && value.game === 'cr') {
      for (const key of ['minClanPoints', 'minClanLevel', 'warFrequency'] as const) {
        if (value[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `Clash Royale clan search has no ${key} filter.`,
            path: [key],
          });
        }
      }
    }
    if (value.resource === 'clanSearch' && value.game === 'coc' && value.minScore !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Clash of Clans clan search uses minClanPoints, not minScore.',
        path: ['minScore'],
      });
    }
    if (
      value.minMembers !== undefined &&
      value.maxMembers !== undefined &&
      value.minMembers > value.maxMembers
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'The smallest clan size must not be larger than the largest.',
        path: ['maxMembers'],
      });
    }
    if (
      value.resource === 'tournamentSearch' &&
      ((value.name?.trim().length ?? 0) < 3 || (value.name?.length ?? 0) > 60)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a tournament name of 3–60 characters.',
        path: ['name'],
      });
    }
    if (
      (TAGGED as readonly string[]).includes(value.resource) &&
      !/^#[0289PYLQGRJCUV]{3,14}$/.test(normalizeTag(value.tag ?? ''))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid player or clan tag.',
        path: ['tag'],
      });
    }
    if (value.resource === 'leaderboard' && value.mode === 'capital' && value.board !== 'clans') {
      ctx.addIssue({
        code: 'custom',
        message: 'Capital rankings are a clan ladder.',
        path: ['mode'],
      });
    }
    // The trap this whole schema exists to catch. Clash Royale's player trophy
    // ladder is gone: /v1/locations/{country}/rankings/players 404s, and the
    // global one answers 200 with an empty `items` array. An empty list reads
    // as "no data yet" at every call site, so without this the Players tab
    // would render blank forever and look like our bug. Path of Legend and the
    // /v1/leaderboards mode ladders replaced it.
    if (value.resource === 'leaderboard' && value.game === 'cr' && value.board !== 'clans') {
      ctx.addIssue({
        code: 'custom',
        message:
          "Clash Royale has no player trophy ladder. Use the 'pathOfLegend' or 'leaderboardRankings' resource.",
        path: ['board'],
      });
    }
    if (value.resource === 'leaderboard' && value.mode === 'war' && value.game !== 'cr') {
      ctx.addIssue({
        code: 'custom',
        message: 'The clan-wars ladder is Clash Royale only.',
        path: ['mode'],
      });
    }
    // A bad or current season id 404s, which is indistinguishable from an
    // outage at the call site.
    if (value.resource === 'pathOfLegend' && !/^\d{4}-\d{2}$/.test(value.season ?? '')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a finished season, like 2026-10.',
        path: ['season'],
      });
    }
    if (
      value.resource === 'leaderboardRankings' &&
      String(value.leaderboardId ?? '').trim().length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a leaderboard.',
        path: ['leaderboardId'],
      });
    }
    if (value.resource === 'locations' && value.game === 'bs') {
      ctx.addIssue({ code: 'custom', message: 'This data is not available for this game.' });
    }
    if (
      // Clash of Clans has no events endpoint of any kind. Clash Royale and
      // Brawl Stars each have one, but they are different endpoints returning
      // different shapes -- see the `events` case in `endpoint()`.
      (value.resource === 'events' && value.game === 'coc') ||
      (value.resource === 'catalog' && value.game === 'coc') ||
      (value.resource === 'battles' && value.game === 'coc') ||
      ((COC_ONLY as readonly string[]).includes(value.resource) && value.game !== 'coc') ||
      ((CR_ONLY as readonly string[]).includes(value.resource) && value.game !== 'cr')
    ) {
      ctx.addIssue({ code: 'custom', message: 'This data is not available for this game.' });
    }
  });

export type GameRequest = z.infer<typeof gameRequestSchema>;
export type Game = GameRequest['game'];
export type Resource = GameRequest['resource'];
export type ApiRecord = Record<string, unknown>;
export type GameResult =
  | { ok: true; data: string; fetchedAt: string }
  | { ok: false; status: number; error: string };

export function normalizeTag(tag: string) {
  const clean = tag.trim().toUpperCase();
  return clean.startsWith('#') ? clean : `#${clean}`;
}

export function record(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ApiRecord) : {};
}

export function rows(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

export function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
}

/**
 * `/v1/clans` with whichever filters the game actually supports.
 *
 * Each parameter is emitted only when set, because the services treat an empty
 * value as a malformed one rather than as "no filter" -- `&minMembers=` is a
 * 400, not a no-op. `locationId=global` is the app's own sentinel for "no
 * location filter" and is dropped here rather than sent.
 */
function clanSearchPath(input: GameRequest): string {
  const params = new URLSearchParams();
  params.set('name', input.name?.trim() ?? '');

  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  };

  put('minMembers', input.minMembers);
  put('maxMembers', input.maxMembers);
  if (input.locationId !== undefined && input.locationId !== 'global') {
    put('locationId', input.locationId);
  }

  if (input.game === 'coc') {
    put('minClanPoints', input.minClanPoints);
    put('minClanLevel', input.minClanLevel);
    put('warFrequency', input.warFrequency);
  } else {
    put('minScore', input.minScore);
  }

  params.set('limit', '25');
  return `/v1/clans?${params.toString()}`;
}

export function endpoint(input: GameRequest) {
  const tag = encodeURIComponent(normalizeTag(input.tag ?? ''));
  switch (input.resource) {
    case 'clanSearch':
      return clanSearchPath(input);
    case 'player':
      return `/v1/players/${tag}`;
    case 'clan':
      // Clash Royale also exposes /v1/clans/{tag}/members, which is byte for
      // byte the `memberList` already inside this response. One call, not two.
      return `/v1/${input.game === 'bs' ? 'clubs' : 'clans'}/${tag}`;
    case 'war':
      return `/v1/clans/${tag}/currentwar`;
    // Clan War League. `currentwar` answers `notInWar` for a clan that is in
    // CWL, so the league has to be asked for separately -- the season lives on
    // `leaguegroup`, and each of its 56 wars on its own war tag.
    case 'leagueGroup':
      return `/v1/clans/${tag}/currentwar/leaguegroup`;
    case 'leagueWar':
      return `/v1/clanwarleagues/wars/${tag}`;
    case 'capitalRaids':
      // `after` is Supercell's own opaque cursor from paging.cursors; it is
      // already base64 and must not be re-encoded.
      return `/v1/clans/${tag}/capitalraidseasons?limit=${input.limit ?? 10}${
        input.after ? `&after=${input.after}` : ''
      }`;
    case 'warLog':
      return `/v1/clans/${tag}/warlog?limit=${input.limit ?? 10}${
        input.after ? `&after=${input.after}` : ''
      }`;
    case 'battles':
      return `/v1/players/${tag}/battlelog`;
    case 'catalog':
      // Clash Royale answers with `items` (123 cards) *and* `supportItems`
      // (4 tower troops). Reading only `items` silently drops the tower troops.
      return `/v1/${input.game === 'cr' ? 'cards' : 'brawlers'}`;
    case 'events':
      /*
       * Two different endpoints behind one resource name.
       *
       * Brawl Stars' `/v1/events/rotation` is a *schedule*: every slot carries
       * a real `startTime` and `endTime`. Clash Royale's `/v1/events` is a
       * plain list of what is running -- `{eventTag, title, description}` and
       * **no timestamps at all** (probed live 2026-11-06: six events, bare
       * array, `description` sometimes null).
       *
       * So the Royale half can be listed but never counted down, which is why
       * Today renders it as its own section rather than in the timeline.
       */
      return input.game === 'cr' ? '/v1/events' : '/v1/events/rotation';
    case 'locations':
      // isCountry filtering happens client side; the API has no such filter.
      return '/v1/locations?limit=300';

    // ---- Clash Royale ----------------------------------------------------
    case 'upcomingChests':
      // Indices are sparse, not contiguous -- a real account returns 0-8, then
      // 14, 23, 39, 61, 276, 284, 388. The track is a gapped timeline.
      return `/v1/players/${tag}/upcomingchests`;
    case 'riverRace':
      // Replaces `currentwar`, which answers 410 Gone on this API.
      // `periodLogs` is an empty array for the whole of a training week.
      return `/v1/clans/${tag}/currentriverrace`;
    case 'riverRaceLog':
      // Replaces `warlog`, which answers 404 "temporarily disabled". Same
      // opaque-cursor paging as capitalRaids.
      return `/v1/clans/${tag}/riverracelog?limit=${input.limit ?? 10}${
        input.after ? `&after=${input.after}` : ''
      }`;
    case 'pathOfLegend':
      // Global only. The per-country form 404s, as does the current season.
      return `/v1/locations/global/pathoflegend/${encodeURIComponent(
        input.season ?? '',
      )}/rankings/players?limit=${input.limit ?? 25}`;
    case 'seasons':
      // 145 ids, "2016-02" through the last closed month, with duplicates --
      // de-duplicate before building a picker.
      return '/v1/locations/global/seasons';
    case 'leaderboards':
      // The 34 mode ladders: Merge Tactics, Touchdown, 2v2 League, Retro
      // Royale and the rest. Many carry a null `name`.
      return '/v1/leaderboards';
    case 'leaderboardRankings':
      // Note the singular path segment: /v1/leaderboard/{id}, not /leaderboards/.
      // The plural 404s.
      return `/v1/leaderboard/${encodeURIComponent(String(input.leaderboardId ?? ''))}?limit=${
        input.limit ?? 25
      }`;
    case 'globalTournaments':
      // 200 with an empty `items` whenever no global tournament is running,
      // which is most of the time. An empty list is the normal answer here.
      return '/v1/globaltournaments';
    case 'tournament':
      return `/v1/tournaments/${tag}`;
    case 'tournamentSearch':
      return `/v1/tournaments?name=${encodeURIComponent(input.name?.trim() ?? '')}&limit=25`;

    case 'leaderboard': {
      // Brawl Stars ranks by country code on a different path entirely and is
      // left on its original endpoint.
      if (input.game === 'bs') return '/v1/rankings/global/players?limit=25';
      const location = encodeURIComponent(String(input.locationId ?? 'global'));
      const board = input.board ?? 'players';
      const mode = input.mode ?? 'home';
      // `after` is Supercell's own opaque cursor from `paging.cursors`; it is
      // already base64 and must not be re-encoded, exactly as the capital raid
      // and war log paths treat it.
      const page = `limit=${input.limit ?? 50}${input.after ? `&after=${input.after}` : ''}`;
      if (input.game === 'cr') {
        // Clan ladders only -- the schema rejects `board: 'players'` above.
        // Both of these accept a country id as well as 'global'.
        return `/v1/locations/${location}/rankings/${
          mode === 'war' ? 'clanwars' : 'clans'
        }?${page}`;
      }
      const ladder =
        mode === 'capital'
          ? 'capitals'
          : board === 'clans'
            ? mode === 'builder'
              ? 'clans-builder-base'
              : 'clans'
            : mode === 'builder'
              ? 'players-builder-base'
              : 'players';
      // This used to hardcode `limit=25` and ignore `input.limit` entirely,
      // which is why the Clash of Clans boards stopped at 25 rows however far
      // you scrolled.
      return `/v1/locations/${location}/rankings/${ladder}?${page}`;
    }
  }
}
