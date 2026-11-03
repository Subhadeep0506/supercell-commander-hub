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
export type Passport = { coc: string; cr: string; bs: string; name: string };

type Ctx = {
  game: Game;
  setGame: (g: Game) => void;
  sound: boolean;
  setSound: (s: boolean) => void;
  click: (tone?: Tone) => void;
  passport: Passport;
  setPassport: (p: Passport) => void;
  /** The imported village export, or undefined until one is pasted in. */
  village?: VillageImport;
  setVillage: (v: VillageImport | undefined) => void;
  /** False until the stored settings have been read back. */
  ready: boolean;
};

const HubCtx = createContext<Ctx | null>(null);
export const DEFAULT_PASSPORT: Passport = { name: 'Guest Chief', coc: '', cr: '', bs: '' };

const KEY = 'sch';
/**
 * The village lives under its own key rather than inside the settings blob.
 *
 * It is roughly 8 KB once parsed, and `patchJson` re-reads and rewrites the
 * whole blob on every settings change -- so folding it in would mean
 * serialising the entire village every time the sound toggle moved.
 */
const VILLAGE_KEY = 'sch:village';
type Stored = { game?: Game; sound?: boolean; passport?: Passport };

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
  const [passport, setPassportS] = useState<Passport>(DEFAULT_PASSPORT);
  const [village, setVillageS] = useState<VillageImport | undefined>();
  const [ready, setReady] = useState(false);

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
      if (stored?.passport) setPassportS({ ...DEFAULT_PASSPORT, ...stored.passport });
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

  const setPassport = useCallback((p: Passport) => {
    setPassportS(p);
    void patchJson(KEY, { passport: p });
  }, []);

  const setVillage = useCallback((v: VillageImport | undefined) => {
    setVillageS(v);
    void writeJson(VILLAGE_KEY, v ?? null);
  }, []);

  const click = useCallback((tone: Tone = 'tap') => {
    if (soundRef.current) beep(tone);
  }, []);

  return (
    <HubCtx.Provider
      value={{ game, setGame, sound, setSound, click, passport, setPassport, village, setVillage, ready }}
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
