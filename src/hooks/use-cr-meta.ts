import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiRecord } from '@/api/game-api';
import { aggregate, type MetaSnapshot } from '@/lib/royale-meta';
import { DEFAULT_BUDGET, sampleMeta } from '@/lib/royale-meta-sample';
import { readJson, writeJson } from '@/state/storage';




const KEY = 'sch:cr-meta';


const MAX_AGE = 7 * 24 * 60 * 60 * 1000;


const KEEP_PER_BRACKET = 20;

type Entry = {

  tag: string;
  fetchedAt: string;
  sampled: number;
  failed: number;
  seeds: { opponents: number; clanmates: number; topLadder: number };
  snapshot: MetaSnapshot;
};

export type MetaState = {
  snapshot?: MetaSnapshot;
  fetchedAt?: string;
  sampled: number;
  failed: number;
  seeds?: Entry['seeds'];
  running: boolean;

  progress: number;

  stale: boolean;

  loading: boolean;
  error?: string;
  run: () => void;
  cancel: () => void;
};

/**
 * Card art resolves from the bundled fan kit **by name**, and `iconUrls`
 * points at api-assets.clashroyale.com, which 403s on this network anyway. So
 * dropping it costs nothing on screen and takes roughly half the bytes out of
 * every stored card.
 */
function slim(card: ApiRecord): ApiRecord {
  const rest = { ...card };
  delete rest['iconUrls'];
  return rest;
}

function trim(snapshot: MetaSnapshot): MetaSnapshot {
  return {
    ...snapshot,
    brackets: snapshot.brackets.map((b) => ({
      ...b,
      decks: b.decks.slice(0, KEEP_PER_BRACKET).map((d) => ({
        ...d,
        cards: d.cards.map(slim),
        towerCard: d.towerCard ? slim(d.towerCard) : undefined,
      })),
      popularCards: b.popularCards.map((p) => ({ ...p, card: slim(p.card) })),
    })),
  };
}

export function useCrMeta({
  tag,
  player,
  ownBattles,
}: {
  tag: string;
  player: ApiRecord;
  ownBattles: ApiRecord[];
}): MetaState {
  const [entry, setEntry] = useState<Entry>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await readJson<Entry>(KEY);
      if (!live) return;
      setEntry(stored);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  // A sample in flight belongs to the screen that started it.
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(() => {
    if (running || !tag) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setProgress(0);
    setError(undefined);

    void (async () => {
      try {
        const result = await sampleMeta({
          tag,
          player,
          ownBattles,
          budget: DEFAULT_BUDGET,
          signal: controller.signal,
          onProgress: (done, total) => {
            if (!controller.signal.aborted) setProgress(total > 0 ? done / total : 0);
          },
        });
        if (controller.signal.aborted) return;
        const snapshot = trim(aggregate(result.battles));
        const next: Entry = {
          tag,
          fetchedAt: result.fetchedAt,
          sampled: result.sampled,
          failed: result.failed,
          seeds: result.seeds,
          snapshot,
        };
        setEntry(next);
        await writeJson(KEY, next);
        // Honest rather than silent: a sample that reached nobody produces an
        // empty snapshot, which would otherwise read as "no decks in the meta".
        if (snapshot.battles === 0) {
          setError(
            result.sampled === 0
              ? 'No battle logs came back. Check the connection and try again.'
              : 'The sampled logs held no competitive battles — only friendlies and party modes.',
          );
        }
      } catch {
        if (!controller.signal.aborted) setError('The sample could not be completed.');
      } finally {
        if (!controller.signal.aborted) setRunning(false);
      }
    })();
  }, [running, tag, player, ownBattles]);

  const cancel = useCallback(() => {
    abort.current?.abort();
    setRunning(false);
  }, []);

  const age = entry ? Date.now() - Date.parse(entry.fetchedAt) : Infinity;
  const stale = !entry || !Number.isFinite(age) || age > MAX_AGE || entry.tag !== tag;

  return {
    snapshot: entry?.snapshot,
    fetchedAt: entry?.fetchedAt,
    sampled: entry?.sampled ?? 0,
    failed: entry?.failed ?? 0,
    seeds: entry?.seeds,
    running,
    progress,
    stale,
    loading,
    error,
    run,
    cancel,
  };
}
