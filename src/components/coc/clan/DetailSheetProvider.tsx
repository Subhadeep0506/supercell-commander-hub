import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { normalizeTag } from '@/api/game-api';
import { DetailSheet } from './DetailSheet';

/** One screen in the sheet's back-stack. */
export type SheetEntry =
  | { kind: 'clan'; tag: string }
  | { kind: 'player'; tag: string }
  | { kind: 'capital'; tag: string }
  | { kind: 'warLog'; tag: string }
  /** `tag` is a *war* tag. `clanTag` orients the board, when it is known. */
  | { kind: 'cwlWar'; tag: string; clanTag?: string };

function entryKey(entry: SheetEntry): string {
  return `${entry.kind}:${entry.tag}`;
}

type Ctx = {
  openClan: (tag: string) => void;
  openPlayer: (tag: string) => void;
  /** Pushes a sub-view of the clan already on screen. */
  pushView: (entry: SheetEntry) => void;
  back: () => void;
  close: () => void;
};

const DetailSheetCtx = createContext<Ctx | null>(null);

/**
 * Makes clan and player profiles reachable from anywhere, and navigable once
 * open.
 *
 * The stack lives here rather than in the sheet because the things that push
 * onto it -- a war log opponent, a raid attacker, a roster row -- are nested
 * several levels down and reach it through context. A clan opened from a
 * player's profile, whose roster opens another player, is just three entries.
 *
 * Mounted in AppShell, *outside* the stack navigator, for the same reason the
 * top bar and bottom nav are: one instance serves every screen, and the sheet
 * survives navigation rather than being torn down with the screen that opened
 * it. Children of this provider therefore cannot use `useNavigation` and
 * address navigation through navigationRef instead.
 */
export function DetailSheetProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SheetEntry[]>([]);

  const pushView = useCallback((entry: SheetEntry) => {
    const clean = normalizeTag(entry.tag);
    // "#" alone is what normalizeTag returns for an empty string; pushing it
    // would open a view onto a guaranteed 400.
    if (clean.length <= 1) return;
    const next = { ...entry, tag: clean };
    setStack((current) => {
      const top = current[current.length - 1];
      // A double tap must not stack the same view twice -- the back arrow
      // would then have to be pressed twice to undo one press.
      if (top && entryKey(top) === entryKey(next)) return current;
      return [...current, next];
    });
  }, []);

  const openClan = useCallback((tag: string) => pushView({ kind: 'clan', tag }), [pushView]);
  const openPlayer = useCallback((tag: string) => pushView({ kind: 'player', tag }), [pushView]);
  const back = useCallback(() => setStack((c) => c.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);

  const value = useMemo(
    () => ({ openClan, openPlayer, pushView, back, close }),
    [openClan, openPlayer, pushView, back, close],
  );

  return (
    <DetailSheetCtx.Provider value={value}>
      {children}
      {stack.length ? <DetailSheet stack={stack} onBack={back} onClose={close} /> : null}
    </DetailSheetCtx.Provider>
  );
}

export function useDetailSheet(): Ctx {
  const ctx = useContext(DetailSheetCtx);
  if (!ctx) throw new Error('useDetailSheet outside DetailSheetProvider');
  return ctx;
}
