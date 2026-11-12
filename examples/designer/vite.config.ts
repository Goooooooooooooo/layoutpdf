import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: {
    alias: [
      { find: /^layoutpdf\/designer$/, replacement: fileURLToPath(new URL('../../dist/designer.js', import.meta.url)) },
      { find: /^layoutpdf$/, replacement: fileURLToPath(new URL('../../dist/index.js', import.meta.url)) },
    ],
  },
});
