import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { getCACertificates } from 'node:tls';

/**
 * react-native-svg ships three generated CommonJS files inside its ESM
 * `lib/module` tree, and its web graph genuinely reaches them:
 *   web/utils/parseTransform -> lib/extract/extractTransform -> ./transform
 *
 * Metro hides this because babel transpiles every file it touches; Vite serves
 * ESM as-is, so the named imports fail. Each file assigns `module.exports`
 * exactly once and never references a bare `exports`, so supplying a `module`
 * object and re-exporting its keys afterwards is enough.
 */
function reactNativeSvgWebShim() {
  const CJS_FILES = [
    'react-native-svg/lib/module/lib/extract/transform.js',
    'react-native-svg/lib/module/lib/extract/transformToRn.js',
    'react-native-svg/lib/module/filter-image/extract/extractFiltersString.js',
  ];

  /**
   * Native-only modules that still end up in the web graph.
   *
   * NativeSvgSoundModule calls `TurboModuleRegistry.getEnforcing` at module
   * scope, which react-native-web has no equivalent for. It is only reached
   * from a lazy require inside SvgTouchableMixin's touch handler, so the dev
   * server never executes it -- but the production build resolves it
   * statically and fails on the missing export.
   */
  const NATIVE_STUBS = ['react-native-svg/lib/module/fabric/NativeSvgSoundModule.js'];

  return {
    name: 'rn-svg-web-shim',
    enforce: 'pre' as const,
    load(id: string) {
      const file = id.split('?')[0]!.replace(/\\/g, '/');

      if (NATIVE_STUBS.some((t) => file.endsWith(t))) {
        return 'export default { playTouchSound() {} };';
      }

      if (!CJS_FILES.some((t) => file.endsWith(t))) return null;
      const code = readFileSync(file, 'utf8');
      return [
        'const module = { exports: {} };',
        code,
        'const __cjs = module.exports;',
        'export const parse = __cjs.parse;',
        'export const SyntaxError = __cjs.SyntaxError;',
        'export const extractFiltersString = __cjs.extractFiltersString;',
        'export default __cjs;',
      ].join('\n');
    },
  };
}

// Resolved via path rather than `new URL(...)`: the React Native type config
// supplies its own global URL, which is not assignable to node:url's.
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, 'src');

// Trust the OS certificate store as well as Node's bundled roots. Without
// this, the proxy fails with UNABLE_TO_GET_ISSUER_CERT_LOCALLY behind a
// TLS-inspecting corporate network -- Node ships its own CA list and does not
// see the company root that the browser and curl both trust.
const proxyAgent = new Agent({
  ca: [...getCACertificates('bundled'), ...getCACertificates('system')],
  keepAlive: true,
});

// The RoyaleAPI proxies send no CORS headers, so Chrome blocks direct calls
// from the browser build. Everything goes through this dev proxy instead.
// The APK calls the hosts directly and does not use these paths.
const PROXIED = {
  '/api/coc': 'https://cocproxy.royaleapi.dev',
  '/api/cr': 'https://proxy.royaleapi.dev',
  '/api/bs': 'https://bsproxy.royaleapi.dev',
};

// Packages that ship their own .web.* implementations alongside native-only
// ones. They must NOT be prebundled: the optimizer resolves imports without
// honouring the .web.* extension order below, which drags in native specs
// such as react-native-safe-area-context/lib/module/specs/NativeSafeAreaView.js.
// Served unbundled, each picks up its own .web.js file.
//
// The @react-navigation packages are deliberately absent from this list. They
// contain no deep `react-native/...` imports and no .web.* variants, so they
// prebundle cleanly -- and they must, because several of their dependencies
// (use-latest-callback, react-is, use-sync-external-store) are CommonJS and
// need the optimizer's interop to expose a default export.
const RN_WEB_SPLIT_PACKAGES = [
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
];

export default defineConfig(({ mode }) => ({
  root: resolve(here, 'web'),
  plugins: [reactNativeSvgWebShim(), react()],
  resolve: {
    alias: [
      // Exact match only. A bare string alias would also rewrite deep imports
      // like react-native/Libraries/Utilities/codegenNativeComponent, which
      // has no react-native-web counterpart.
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^@\//, replacement: `${src}/` },
    ],
    // .web.* first, so platform-specific modules resolve correctly.
    extensions: [
      '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
      '.tsx', '.ts', '.jsx', '.js', '.json',
    ],
    // mainFields is deliberately left at Vite's default. react-native-screens,
    // react-native-safe-area-context and friends point their "react-native"
    // field at untranspiled Flow/TS source; the default "module"/"main" fields
    // resolve to their precompiled ESM under lib/module instead.
  },
  define: {
    global: 'globalThis',
    __DEV__: JSON.stringify(mode !== 'production'),
  },
  optimizeDeps: {
    include: [
      'react-native-web',
      'react-dom',
      'react-dom/client',
      '@react-navigation/native',
      '@react-navigation/native-stack',
      // CommonJS, and only reached through react-native-svg's web graph --
      // which is excluded from prebundling, so it would otherwise be served
      // raw and its named exports would fail.
      '@react-native/assets-registry/registry',
    ],
    exclude: RN_WEB_SPLIT_PACKAGES,
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(PROXIED).map(([path, target]) => [
        path,
        {
          target,
          changeOrigin: true,
          agent: proxyAgent,
          rewrite: (p: string) => p.replace(new RegExp(`^${path}`), ''),
        },
      ]),
    ),
  },
  build: {
    outDir: resolve(here, 'dist-web'),
    emptyOutDir: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
}));
