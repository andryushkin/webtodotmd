import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  build: {
    target: 'chrome114',
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    webExtension({
      additionalInputs: ['src/sidepanel/sidepanel.html'],
    }),
  ],
});
