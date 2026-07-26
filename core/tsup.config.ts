import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { browser: 'src/browser.ts' },
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
