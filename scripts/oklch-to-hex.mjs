// One-off generator: frontend/src/styles.css -> src/theme/colors.ts
//
// React Native has no CSS custom properties, no attribute selectors and no
// oklch(). This pulls the Clash of Clans token block and its dark override out
// of the reference stylesheet and emits static values, so there is no runtime
// conversion cost and no drift between the two apps.
//
// Re-run only if styles.css changes. The output is committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatHex, formatRgb, interpolate, parse } from 'culori';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = resolve(root, '../../frontend/src/styles.css');
const OUT = resolve(root, 'src/theme/colors.ts');

const css = readFileSync(CSS, 'utf8');

/**
 * Pull the `{ ... }` body that follows a selector, by brace counting.
 *
 * Returns the closing brace index as well as the body, because a selector can
 * legitimately appear more than once: `[data-game="cr"]` has two blocks, and
 * the second has to be found by searching past the end of the first.
 */
function block(source, selector, from = 0) {
  const start = source.indexOf(selector, from);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  let i = source.indexOf('{', start);
  let depth = 0;
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return { body: source.slice(open + 1, i), end: i };
}

/** `--name: value;` pairs, ignoring any nested block. */
function declarations(body) {
  const flat = body.replace(/[^{}]*\{[^}]*\}/g, '');
  const out = {};
  for (const [, name, value] of flat.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim().replace(/\s+/g, ' ');
  }
  return out;
}

/** oklch(L C H) or oklch(L C H / P%) -> #rrggbb or rgba(...). */
function convertColor(fn) {
  const colour = parse(fn.replace(/\s*\/\s*([\d.]+)%/, (_, p) => ` / ${Number(p) / 100}`));
  if (!colour) throw new Error(`could not parse colour: ${fn}`);
  return colour.alpha !== undefined && colour.alpha < 1 ? formatRgb(colour) : formatHex(colour);
}

/** Convert every oklch() in a value, leaving any surrounding syntax intact. */
function convertValue(value) {
  return value.replace(/oklch\([^()]*\)/g, convertColor);
}

/** Resolve var(--x) against the token set, preferring `scope` then `base`. */
function resolve_(value, scope, base, seen = new Set()) {
  return value.replace(/var\(--([\w-]+)\)/g, (match, name) => {
    if (seen.has(name)) throw new Error(`circular var: --${name}`);
    const next = scope[name] ?? base[name];
    if (next === undefined) return match;
    return resolve_(next, scope, base, new Set([...seen, name]));
  });
}

const light = declarations(block(css, ':root,\n[data-game="coc"]').body);
const darkPatch = declarations(
  block(block(css, '@media (prefers-color-scheme: dark)').body, ':root, [data-game="coc"]').body,
);
const dark = { ...light, ...darkPatch };

/**
 * Clash Royale is declared in *two* blocks with the same selector and the same
 * specificity -- a base palette, then an "arena" override that re-darkens the
 * background, swaps the accent to cyan and adds the --arena-* tokens. CSS
 * resolves that per property, last one winning, so they are merged in source
 * order over the light root.
 *
 * Reading only the first block gets a plausible-looking palette with the wrong
 * accent and no arena tokens at all, which is exactly the kind of wrong that
 * does not throw.
 */
const crBase = block(css, '[data-game="cr"]');
const crArena = block(css, '[data-game="cr"]', crBase.end);
const cr = { ...light, ...declarations(crBase.body), ...declarations(crArena.body) };

// Clash Royale has no entry in the dark media query: it is one palette, not a
// light/dark pair.

function build(scope, base) {
  const out = {};
  for (const [name, raw] of Object.entries(scope)) {
    out[name] = convertValue(resolve_(raw, scope, base));
  }
  return out;
}

const lightOut = build(light, light);
const darkOut = build(dark, dark);
const crOut = build(cr, cr);

/**
 * Flat stand-ins for the gradient tokens.
 *
 * React Native has no CSS gradients, and the app's only react-native-svg use
 * is inline icons -- an absolutely positioned gradient behind content is
 * exactly the class of layout that can only be checked on a device. These are
 * the oklch midpoint of each gradient's own stops, computed here so they
 * follow styles.css instead of being hand-copied and quietly going stale.
 */
function flatten(value) {
  const stops = value.match(/#[0-9a-f]{6}\b/gi);
  if (!stops || stops.length === 0) return null;
  if (stops.length === 1) return stops[0];
  return formatHex(interpolate(stops, 'oklch')(0.5));
}

for (const name of ['arena-hero', 'arena-panel']) {
  const flat = crOut[name] && flatten(crOut[name]);
  if (!flat) throw new Error(`no colour stops to flatten in --${name}`);
  crOut[`${name}-flat`] = flat;
}

const names = Object.keys(lightOut).sort();
// Clash Royale carries the --arena-* tokens on top of everything the CoC sets
// have, so it is rendered over its own key list rather than the shared one.
const crNames = Object.keys(crOut).sort();
const render = (set, keys = names) =>
  keys.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(set[n])},`).join('\n');

const file = `// GENERATED by scripts/oklch-to-hex.mjs from frontend/src/styles.css.
// Do not edit by hand -- re-run the script instead.
//
// Values that are not plain colours (--radius, the shadow and texture
// composites) are passed through with their oklch() parts converted, and are
// interpreted in theme/tokens.ts.
export type ColorTokens = Record<string, string>;

export const lightColors = {
${render(lightOut)}
} as const;

export const darkColors = {
${render(darkOut)}
} as const;

/**
 * Clash Royale: one palette, not a light/dark pair -- the dark media query has
 * no CR entry. Merged from the two [data-game="cr"] blocks over the light root,
 * so it carries the --arena-* tokens the Clash of Clans sets do not have.
 */
export const crColors = {
${render(crOut, crNames)}
} as const;
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
console.log(
  `theme: wrote ${names.length} tokens x light/dark + ${crNames.length} Clash Royale tokens to src/theme/colors.ts`,
);
