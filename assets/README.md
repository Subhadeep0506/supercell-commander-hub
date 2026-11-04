# Asset drop-in

Raw source artwork goes here. Nothing in this folder is bundled directly — the
Phase 2 pipeline (`scripts/build-assets.mjs`) reads from here and emits optimised
WebP plus a generated `src/assets/registry.ts`.

Everything except this README and the `.gitkeep` files is gitignored. The raw
packs are ~183 MB and must not be committed.

## Where things go

| Folder | What to put in it |
|---|---|
| `packs/coc/` | Clash of Clans fankit pack — the zip, or its extracted contents |
| `packs/cr/` | Clash Royale fankit pack (also contains Clash Bold / Clash Regular) |
| `packs/bs/` | Brawl Stars fankit pack |
| `fonts/` | `Clash_Bold.otf`, `Clash_Regular.otf`, `LilitaOne-Regular.ttf` |
| `icon/` | App icon source — one square PNG, 1024x1024, no rounded corners |
| `audio/` | UI sounds, if you want real ones instead of generated beeps |

Each pack stays in its own folder. Do not extract one pack on top of another —
filenames collide between games.

## Fetched rather than dropped in

Two of the `packs/cr/` folders are filled by a script rather than by hand, so
they can be rebuilt on a clean machine without re-downloading a 183 MB pack:

| Script | Fills | Source |
|---|---|---|
| `bun run fetch:cr-assets` | `cr/arenas`, `cr/leagues`, `cr/chests`, `cr/badges`, `cr/tokens` | RoyaleAPI/cr-api-assets |
| `bun run fetch:fankit` | `cr/player-badges` (1,191 files), plus named icons into `cr/icons`, `cr/tokens`, `cr/pol` | the fan-kit CDN |

`fetch:fankit` needs the fan-kit index — `clash-royale-fankit-images.json`, a
list of every asset's title and CDN url. It looks for it in the parent
directory by default; point it elsewhere with `--index=<dir>`. It downloads
from `media.ffycdn.net` rather than `fankit.supercell.com`, which is blocked
on this network.

Both scripts skip anything already on disk; pass `--force` to re-download.

## What the pipeline is matching against

The port needs **597 named assets**, taken from the pointer files in
`frontend/src/assets/fankit/`. Those `.asset.json` files hold Lovable CDN URLs
and no image data, so only the filenames survive:

| Group | Count | Example filename |
|---|---|---|
| `arena/` | 338 | `archer.png`, `archerevolution.png` |
| `coc-book/` | 207 | `102189` (numeric ids, no extension) |
| `coc/` | 26 | `barbarian-king.png` |
| `coc-detail/` | 22 | `dark-elixir.png`, `clock.png` |
| root | 4 | `Clash_of_Clans_logo.png`, `hud_button_social.png` |

Unmatched names degrade gracefully — `arena-art-fallback`, `book-art-missing`
and `coc-unit-fallback` already exist in the design. 100% coverage is not
expected; the original build did not reach it either.

## Fonts

Clash Bold and Clash Regular ship inside the CR pack. Lilita One is a Google
Font and can be fetched without the fankit terms gate.
