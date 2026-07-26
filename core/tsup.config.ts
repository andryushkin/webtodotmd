import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // fallback-tags ships as its own entry: consumers that must tell this
    // library's table output from a page's text import the set from there.
    entry: { browser: 'src/browser.ts', 'fallback-tags': 'src/fallback-tags.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    dts: true,
    outDir: 'dist',
    external: ['linkedom', 'happy-dom'],
    platform: 'browser',
    minify: true,
  },
  {
    entry: { server: 'src/server.ts' },
    format: ['esm', 'cjs'],
    outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.cjs' }),
    dts: true,
    outDir: 'dist',
    external: ['linkedom', 'happy-dom'],
    platform: 'node',
    minify: true,
  },
]);
