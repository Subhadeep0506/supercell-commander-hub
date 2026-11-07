import { KEYS } from '@/config/keys';
import { apiBase } from './base';
import { endpoint, gameRequestSchema, type GameRequest, type GameResult } from './game-api';


export async function getGameData(input: GameRequest): Promise<GameResult> {
  const parsed = gameRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };
  }
  const data = parsed.data;

  const key = KEYS[data.game];
  if (!key) {
    return {
      ok: false,
      status: 503,
      error: `The ${data.game.toUpperCase()} connection is not configured. Add its token to .env and re-run \`bun run keys\`.`,
    };
  }

  try {
    const response = await fetch(`${apiBase(data.game)}${endpoint(data)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Game provider failed [${response.status}]: ${body}`);
      return { ok: false, status: response.status, error: body };
    }
    return { ok: true, data: await response.text(), fetchedAt: new Date().toISOString() };
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'The game service could not be reached. Please try again.',
    };
  }
}
