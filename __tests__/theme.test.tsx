import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { HubProvider, useHub } from '@/state/HubProvider';
import { ThemeProvider, useTheme, type Theme } from '@/theme/ThemeProvider';
import { themes } from '@/theme/tokens';
import type { Game } from '@/api/game-api';




async function probe() {
  let latest: Theme | undefined;
  let current: Game | undefined;
  let setGame: ((g: Game) => void) | undefined;

  function Probe() {
    latest = useTheme();
    const hub = useHub();
    current = hub.game;
    setGame = hub.setGame;
    return null;
  }

  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(
      <HubProvider>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </HubProvider>,
    );
  });

  return {
    first: latest!,
    get latest() {
      return latest!;
    },
    get game() {
      return current;
    },
    async switchTo(game: Game) {
      await ReactTestRenderer.act(async () => {
        setGame?.(game);
      });
    },
  };
}

describe('ThemeProvider', () => {
  it('hands back the same object whichever game is open', async () => {
    const p = await probe();
    for (const game of ['cr', 'coc', 'cr', 'bs'] as Game[]) {
      await p.switchTo(game);
      // The switch really happened -- otherwise the assertion below would be
      // comparing the theme against itself having done nothing.
      expect(p.game).toBe(game);
      // Referential identity, not deep equality: a fresh object with identical
      // values would still invalidate every memo in the app.
      expect(p.latest).toBe(p.first);
    }
  });

  it('is one of the two real palettes', async () => {
    const p = await probe();
    expect([themes.light, themes.dark]).toContain(p.first);
  });
});

describe('themes', () => {
  it('has no Clash Royale skin left', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'light']);
    expect((themes as Record<string, unknown>)['cr']).toBeUndefined();
  });

  it('carries the Royale accent in both schemes', () => {
    for (const theme of [themes.light, themes.dark]) {
      for (const key of ['edge', 'chip', 'onChip', 'heading', 'highlight', 'onHighlight']) {
        expect(typeof (theme.royale as Record<string, unknown>)[key]).toBe('string');
      }
    }
  });

  /*
   * The contrast trap this split exists for.
   *
   * The old `arena-edge` was #00112d -- *darker than the dark neutral
   * background* #151817. Carried into both schemes unchanged, every level
   * badge, podium base and chest index would sink into the page. On dark a
   * Royale chip has to sit lighter than the card; on light, darker.
   */
  it('uses different Royale blues per scheme rather than one for both', () => {
    expect(themes.light.royale.chip).not.toBe(themes.dark.royale.chip);
    expect(themes.light.royale.edge).not.toBe(themes.dark.royale.edge);
    expect(themes.light.royale.heading).not.toBe(themes.dark.royale.heading);
  });

  it('never makes a Royale surface darker than the page it sits on', () => {
    const luma = (hex: string) => {
      const pair = (at: number) => parseInt(hex.slice(at, at + 2), 16);
      // Rec. 601 is plenty to order two colours by lightness.
      return 0.299 * pair(1) + 0.587 * pair(3) + 0.114 * pair(5);
    };
    expect(luma(themes.dark.royale.chip)).toBeGreaterThan(luma(themes.dark.card));
    expect(luma(themes.light.royale.chip)).toBeLessThan(luma(themes.light.card));
  });

  it('keeps the plate shadow hard, which is the whole Royale panel shape', () => {
    for (const theme of [themes.light, themes.dark]) {
      expect(theme.royale.shadow.shadowRadius).toBe(0);
      expect(theme.royale.shadow.shadowOffset.height).toBe(4);
      expect(theme.royale.shadow.shadowColor).toBe(theme.royale.edge);
    }
  });

  it('leaves Clash of Clans on its own soft card', () => {
    // The guard that this change did not reach into CoC: its panel shadow is
    // still a blur, not a plate.
    expect(themes.dark.shadow.panel.shadowRadius).toBeGreaterThan(0);
    expect(themes.light.shadow.panel.shadowRadius).toBeGreaterThan(0);
  });

  it('reports a scheme the status bar can read', () => {
    // App.tsx picks status-bar icons with `scheme === 'dark'`. The old 'cr'
    // scheme was neither, so Royale got dark icons on a dark blue page.
    expect(themes.dark.scheme).toBe('dark');
    expect(themes.light.scheme).toBe('light');
  });
});
