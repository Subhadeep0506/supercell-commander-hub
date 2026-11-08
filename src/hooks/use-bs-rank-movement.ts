import { useEffect, useRef, useState } from 'react';
import { text, type ApiRecord } from '@/api/game-api';
import { readSnapshot, writeSnapshot, type RankSnapshot } from '@/lib/bs-rank-history';

/**
 * The baseline a ladder's movement arrows are measured against.
 *
 * The ordering here is the whole point and is easy to get backwards: the
 * stored snapshot is **read into state before the new one is written**, and
 * the baseline is then frozen for as long as the board is open. Write first
 * and every row compares against what was just saved, so nothing ever appears
 * to have moved.
 *
 * `saved` guards against the rewrite that the rows arriving page by page would
 * otherwise cause — only the first full set for a board is recorded, so
 * pressing "Load more" does not reset the comparison mid-read.
 */
export function useBsRankMovement(
  key: string,
  rows: ApiRecord[],
): { baseline?: RankSnapshot; ready: boolean } {
  const [baseline, setBaseline] = useState<RankSnapshot | undefined>();
  const [ready, setReady] = useState(false);
  const saved = useRef<string | undefined>(undefined);

  // Board changed: forget the old baseline and read the new one.
  useEffect(() => {
    let live = true;
    setReady(false);
    setBaseline(undefined);
    saved.current = undefined;
    readSnapshot(key).then((snapshot) => {
      if (!live) return;
      setBaseline(snapshot);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [key]);

  // Record the current standing, once the baseline is safely in hand.
  useEffect(() => {
    if (!ready || !rows.length || saved.current === key) return;
    saved.current = key;
    void writeSnapshot(
      key,
      rows
        .map((row) => ({ tag: text(row['tag']), rank: Number(row['rank']) }))
        .filter((row) => row.tag !== '—' && Number.isFinite(row.rank)),
    );
  }, [ready, rows, key]);

  return { baseline, ready };
}
