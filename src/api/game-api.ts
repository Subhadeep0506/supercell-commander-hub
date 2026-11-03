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
import { z } from 'zod';

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
    ]),
    tag: z.string().optional(),
    name: z.string().optional(),
    /** Page size for the cursor-paged clan histories. */
    limit: z.number().int().positive().max(50).optional(),
    /** `paging.cursors.after` from the previous page of the same resource. */
    after: z.string().optional(),
    /** Leaderboard only: which ladder to read. */
    board: z.enum(['players', 'clans']).optional(),
    /** Leaderboard only. `capital` is a clan ladder and has no player form. */
    mode: z.enum(['home', 'builder', 'capital']).optional(),
    /** Leaderboard only: a location id from the `locations` resource, or 'global'. */
    locationId: z.union([z.string(), z.number()]).optional(),
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
    if (
      [
        'player',
        'clan',
        'war',
        'battles',
        'capitalRaids',
        'warLog',
        'leagueGroup',
        'leagueWar',
      ].includes(value.resource) &&
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
    if (value.resource === 'locations' && value.game === 'bs') {
      ctx.addIssue({ code: 'custom', message: 'This data is not available for this game.' });
    }
    if (
      (value.resource === 'events' && value.game !== 'bs') ||
      (value.resource === 'catalog' && value.game === 'coc') ||
      (value.resource === 'war' && value.game !== 'coc') ||
      (value.resource === 'battles' && value.game === 'coc') ||
      (['capitalRaids', 'warLog', 'leagueGroup', 'leagueWar'].includes(value.resource) &&
        value.game !== 'coc')
    ) {
      ctx.addIssue({ code: 'custom', message: 'This data is not available for this game.' });
    }
  });

export type GameRequest = z.infer<typeof gameRequestSchema>;
export type Game = GameRequest['game'];
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

export function endpoint(input: GameRequest) {
  const tag = encodeURIComponent(normalizeTag(input.tag ?? ''));
  switch (input.resource) {
    case 'clanSearch':
      return `/v1/clans?name=${encodeURIComponent(input.name?.trim() ?? '')}&limit=25`;
    case 'player':
      return `/v1/players/${tag}`;
    case 'clan':
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
      return `/v1/${input.game === 'cr' ? 'cards' : 'brawlers'}`;
    case 'events':
      return '/v1/events/rotation';
    case 'locations':
      // isCountry filtering happens client side; the API has no such filter.
      return '/v1/locations?limit=300';
    case 'leaderboard': {
      // Brawl Stars ranks by country code on a different path entirely and is
      // left on its original endpoint.
      if (input.game === 'bs') return '/v1/rankings/global/players?limit=25';
      const location = encodeURIComponent(String(input.locationId ?? 'global'));
      const board = input.board ?? 'players';
      const mode = input.mode ?? 'home';
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
      return `/v1/locations/${location}/rankings/${ladder}?limit=25`;
    }
  }
}
