import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { normalizeTag, type Game } from '@/api/game-api';
import { DetailSheet } from './DetailSheet';

/**
 * One screen in the sheet's back-stack.
 *
 * `game` decides which renderer the layer gets, and therefore which API the
 * tag is looked up against. **It is required**, and deliberately so.
 *
 * It used to default to the hub's current game when a caller did not say,
 * which let the fourteen Clash of Clans call sites stay untouched when Clash
 * Royale arrived. That default shipped a bug: the hub's game is set by exactly
 * one thing, the three-logo picker in `TopBar`, and nothing about navigating
 * to a screen or opening a sheet updates it. Whenever it pointed at `cr`,
 * every Clash of Clans clan was looked up on `proxy.royaleapi.dev` instead of
 * `cocproxy`, where that tag does not exist -- so *every* clan answered 404
 * while the player screens, which never go through this sheet, stayed fine.
 *
 * A tag is meaningless without the game it belongs to. Making the caller say
 * so is what stops the next call site reintroducing this silently; the type
 * error is the whole point of the field being required.
 *
 * `capital`, `warLog` and `cwlWar` are Clash of Clans only. Clash Royale's
 * equivalents are tabs inside its clan layer rather than layers of their own,
 * because River Race is one view of a clan rather than a separate history.
 *
 * `brawler` is Brawl Stars only, and is the one kind that is not addressed by
 * its tag alone: the tag names the *player* whose collection is being read --
 * which is what decides whether the global ladder can say "that is you" -- and
 * `brawlerId` picks one entry out of it. It lives in this stack rather than in
 * its own Modal because React Native will not stack a second Modal over the
 * sheet, which is why a brawler tile used to be inert on anyone else's profile.
 */
export type SheetEntry =
  | { game: Game; kind: 'clan'; tag: string }
  | { game: Game; kind: 'player'; tag: string }
  | { game: Game; kind: 'capital'; tag: string }
  | { game: Game; kind: 'warLog'; tag: string }
  /** `tag` is a *war* tag. `clanTag` orients the board, when it is known. */
  | { game: Game; kind: 'cwlWar'; tag: string; clanTag?: string }
  /** `tag` is the *player* whose collection this brawler is read from. */
  | { game: Game; kind: 'brawler'; tag: string; brawlerId: number };

/** What a caller passes. Identical to the entry: there is nothing to infer. */
export type SheetRequest = SheetEntry;

/*
 * The identity of a view, for the double-tap guard below.
 *
 * `brawlerId` has to be part of it. Without it, opening Shelly and then Colt
 * from the same profile would read as the same view and the second tap would
 * do nothing -- the tag is identical in both cases because it names the player.
 */
function entryKey(entry: SheetEntry): string {
  const extra = entry.kind === 'brawler' ? `:${entry.brawlerId}` : '';
  return `${entry.game}:${entry.kind}:${entry.tag}${extra}`;
}

type Ctx = {
  openClan: (tag: string, game: Game) => void;
  openPlayer: (tag: string, game: Game) => void;
  /** Pushes a sub-view of the clan already on screen. */
  pushView: (entry: SheetRequest) => void;
  back: () => void;
  close: () => void;
};

const DetailSheetCtx = createContext<Ctx | null>(null);

/**
 * Makes clan and player profiles reachable from anywhere, and navigable once
 * open.
 *
 * The stack lives here rather than in the sheet because the things that push
 * onto it -- a war log opponent, a raid attacker, a roster row, a battle
 * opponent -- are nested several levels down and reach it through context. A
 * clan opened from a player's profile, whose roster opens another player, is
 * just three entries.
 *
 * Mounted in AppShell, *outside* the stack navigator, for the same reason the
 * top bar and bottom nav are: one instance serves every screen, and the sheet
 * survives navigation rather than being torn down with the screen that opened
 * it. Children of this provider therefore cannot use `useNavigation` and
 * address navigation through navigationRef instead.
 */
export function DetailSheetProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SheetEntry[]>([]);

  const pushView = useCallback(
    (entry: SheetRequest) => {
      const clean = normalizeTag(entry.tag);
      // "#" alone is what normalizeTag returns for an empty string; pushing it
      // would open a view onto a guaranteed 400.
      if (clean.length <= 1) return;
      const next = { ...entry, tag: clean } as SheetEntry;
      setStack((current) => {
        const top = current[current.length - 1];
        // A double tap must not stack the same view twice -- the back arrow
        // would then have to be pressed twice to undo one press.
        if (top && entryKey(top) === entryKey(next)) return current;
        return [...current, next];
      });
    },
    [],
  );

  const openClan = useCallback(
    (tag: string, game: Game) => pushView({ kind: 'clan', tag, game }),
    [pushView],
  );
  const openPlayer = useCallback(
    (tag: string, game: Game) => pushView({ kind: 'player', tag, game }),
    [pushView],
  );
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
