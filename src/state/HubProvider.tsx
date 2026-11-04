import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Game } from '@/api/game-api';
import type { VillageImport } from '@/lib/village-export';
import { beep, type Tone } from './sound';
import { patchJson, readJson, writeJson } from './storage';

export type { Game };
export type Passport = {
  /**
   * Stable across edits and renames, which is what the active pointer and the
   * list keys hang off. A display name cannot do that job -- renaming a
   * passport would silently deactivate it.
   */
  id: string;
  coc: string;
  cr: string;
  bs: string;
  name: string;
};

type Ctx = {
  game: Game;
  setGame: (g: Game) => void;
  sound: boolean;
  setSound: (s: boolean) => void;
  click: (tone?: Tone) => void;
  /**
   * The active passport.
   *
   * Every game screen resolves its account from this, so it stays a single
   * object however many are saved -- switching passports is what changes it.
   */
  passport: Passport;
  /** Updates the active passport in place. */
  setPassport: (p: Passport) => void;
  /** All saved passports, in the order they were added. */
  passports: Passport[];
  /**
   * Adds a passport, or overwrites the one with the same display name.
   *
   * Saving the same name twice is nearly always a correction rather than an
   * intent to keep two "Main" entries, and a list of indistinguishable rows is
   * worse than losing the older tags. Returns the saved record so the caller
   * can report which happened. A new passport becomes active.
   */
  savePassport: (p: Omit<Passport, 'id'>) => { passport: Passport; replaced: boolean };
  /** Edits an existing passport by id, leaving the active pointer alone. */
  updatePassport: (id: string, p: Omit<Passport, 'id'>) => void;
  /**
   * Removes a passport.
   *
   * Deleting the active one promotes the first that remains, so the app is
   * never left resolving its screens from nothing.
   */
  deletePassport: (id: string) => void;
  activatePassport: (id: string) => void;
  /** The imported village export, or undefined until one is pasted in. */
  village?: VillageImport;
  setVillage: (v: VillageImport | undefined) => void;
  /** False until the stored settings have been read back. */
  ready: boolean;
};

const HubCtx = createContext<Ctx | null>(null);
export const DEFAULT_PASSPORT: Passport = {
  id: 'guest',
  name: 'Guest Chief',
  coc: '',
  cr: '',
  bs: '',
};

/**
 * Good enough for a list a person types by hand.
 *
 * Not crypto.randomUUID(): it is absent from Hermes and from older Android
 * WebViews, and this only has to be unique within one device's handful of
 * passports.
 */
let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

const KEY = 'sch';
/**
 * The village lives under its own key rather than inside the settings blob.
 *
 * It is roughly 8 KB once parsed, and `patchJson` re-reads and rewrites the
 * whole blob on every settings change -- so folding it in would mean
 * serialising the entire village every time the sound toggle moved.
 */
const VILLAGE_KEY = 'sch:village';
type Stored = {
  game?: Game;
  sound?: boolean;
  /** Written by every version before passports became a list. */
  passport?: Omit<Passport, 'id'> & { id?: string };
  passports?: Passport[];
  activeId?: string;
};

/**
 * Reads whichever shape is on disk.
 *
 * The single-passport key is still honoured and promoted to the first entry of
 * the list: a user who has already typed three tags by hand should not open the
 * app to an empty form. The old key is left in place rather than deleted, so
 * rolling back does not lose it either.
 */
function restore(stored: Stored | undefined): { list: Passport[]; activeId: string } {
  const list = (stored?.passports ?? []).filter((p) => p && typeof p.id === 'string');
  if (list.length) {
    const activeId = list.some((p) => p.id === stored?.activeId)
      ? stored!.activeId!
      : list[0]!.id;
    return { list, activeId };
  }
  const legacy = stored?.passport;
  if (legacy && (legacy.coc || legacy.cr || legacy.bs || legacy.name)) {
    const migrated: Passport = { ...DEFAULT_PASSPORT, ...legacy, id: legacy.id ?? newId() };
    return { list: [migrated], activeId: migrated.id };
  }
  return { list: [], activeId: '' };
}

/**
 * Ported from frontend/src/lib/hub.tsx.
 *
 * Two changes from the original:
 *
 *  - localStorage became AsyncStorage behind state/storage.ts. Reads are now
 *    asynchronous, so `ready` tells screens whether a blank passport means
 *    "none saved" or "not loaded yet" -- without it, useLiveAccount fires a
 *    request for an empty tag on first render.
 *  - Setting `document.documentElement.dataset.game` is gone. The game skin is
 *    a React context now (theme/ThemeProvider), not a CSS attribute selector.
 */
export function HubProvider({ children }: { children: ReactNode }) {
  const [game, setGameS] = useState<Game>('coc');
  const [sound, setSoundS] = useState(false);
  const [passports, setPassportsS] = useState<Passport[]>([]);
  const [activeId, setActiveIdS] = useState('');
  const [village, setVillageS] = useState<VillageImport | undefined>();
  const [ready, setReady] = useState(false);

  // The active record, or the empty default when nothing is saved yet. Screens
  // read this and nothing else, so none of them had to learn about the list.
  const passport = passports.find((p) => p.id === activeId) ?? DEFAULT_PASSPORT;

  const persist = useCallback((list: Passport[], active: string) => {
    setPassportsS(list);
    setActiveIdS(active);
    void patchJson(KEY, { passports: list, activeId: active });
  }, []);

  // `click` is rebuilt whenever `sound` changes; the ref keeps the callback
  // identity stable so it can be passed to memoised children.
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, saved] = await Promise.all([
        readJson<Stored>(KEY),
        readJson<VillageImport>(VILLAGE_KEY),
      ]);
      if (cancelled) return;
      if (stored?.game) setGameS(stored.game);
      if (stored?.sound) setSoundS(true);
      const { list, activeId: active } = restore(stored);
      setPassportsS(list);
      setActiveIdS(active);
      if (saved) setVillageS(saved);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setGame = useCallback((g: Game) => {
    setGameS(g);
    void patchJson(KEY, { game: g });
  }, []);

  const setSound = useCallback((v: boolean) => {
    setSoundS(v);
    void patchJson(KEY, { sound: v });
  }, []);

  /**
   * Updates the active passport in place.
   *
   * This is what the lookup screens call when a searched tag is adopted. It
   * must not create a second entry: searching a tag on Home is "this is my
   * account", not "here is another passport".
   *
   * With nothing saved at all it creates the first one, so a user who types a
   * tag before ever opening Passport still ends up with a record.
   */
  const setPassport = useCallback(
    (p: Passport) => {
      setPassportsS((list) => {
        const next = list.some((x) => x.id === p.id)
          ? list.map((x) => (x.id === p.id ? p : x))
          : [...list, { ...p, id: p.id || newId() }];
        const active = p.id || next[next.length - 1]!.id;
        setActiveIdS(active);
        void patchJson(KEY, { passports: next, activeId: active });
        return next;
      });
    },
    [],
  );

  const savePassport = useCallback(
    (draft: Omit<Passport, 'id'>) => {
      const name = draft.name.trim();
      const existing = passports.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
      const saved: Passport = { ...draft, name, id: existing?.id ?? newId() };
      const next = existing
        ? passports.map((p) => (p.id === existing.id ? saved : p))
        : [...passports, saved];
      persist(next, saved.id);
      return { passport: saved, replaced: Boolean(existing) };
    },
    [passports, persist],
  );

  const updatePassport = useCallback(
    (id: string, draft: Omit<Passport, 'id'>) => {
      persist(
        passports.map((p) => (p.id === id ? { ...draft, name: draft.name.trim(), id } : p)),
        activeId,
      );
    },
    [passports, activeId, persist],
  );

  const deletePassport = useCallback(
    (id: string) => {
      const next = passports.filter((p) => p.id !== id);
      // Promote the first survivor when the active one goes, so no screen is
      // left resolving its account from an id that no longer exists.
      const active = id === activeId ? (next[0]?.id ?? '') : activeId;
      persist(next, active);
    },
    [passports, activeId, persist],
  );

  const activatePassport = useCallback(
    (id: string) => {
      if (!passports.some((p) => p.id === id)) return;
      persist(passports, id);
    },
    [passports, persist],
  );

  const setVillage = useCallback((v: VillageImport | undefined) => {
    setVillageS(v);
    void writeJson(VILLAGE_KEY, v ?? null);
  }, []);

  const click = useCallback((tone: Tone = 'tap') => {
    if (soundRef.current) beep(tone);
  }, []);

  return (
    <HubCtx.Provider
      value={{
        game,
        setGame,
        sound,
        setSound,
        click,
        passport,
        setPassport,
        passports,
        savePassport,
        updatePassport,
        deletePassport,
        activatePassport,
        village,
        setVillage,
        ready,
      }}
    >
      {children}
    </HubCtx.Provider>
  );
}

export function useHub() {
  const c = useContext(HubCtx);
  if (!c) throw new Error('useHub outside provider');
  return c;
}
