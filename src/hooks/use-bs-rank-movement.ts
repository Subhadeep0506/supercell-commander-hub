import { useEffect, useRef, useState } from 'react';
import { text, type ApiRecord } from '@/api/game-api';
import { readSnapshot, writeSnapshot, type RankSnapshot } from '@/lib/bs-rank-history';


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
