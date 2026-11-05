import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { getCACertificates } from 'node:tls';


function reactNativeSvgWebShim() {
  const CJS_FILES = [
    'react-native-svg/lib/module/lib/extract/transform.js',
    'react-native-svg/lib/module/lib/extract/transformToRn.js',
    'react-native-svg/lib/module/filter-image/extract/extractFiltersString.js',
  ];


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

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, 'src');

const proxyAgent = new Agent({
  ca: [...getCACertificates('bundled'), ...getCACertificates('system')],
  keepAlive: true,
});

const PROXIED = {
  '/api/coc': 'https://cocproxy.royaleapi.dev',
  '/api/cr': 'https://proxy.royaleapi.dev',
  '/api/bs': 'https://bsproxy.royaleapi.dev',
};

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
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^@\//, replacement: `${src}/` },
    ],
    extensions: [
      '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
      '.tsx', '.ts', '.jsx', '.js', '.json',
    ],
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
