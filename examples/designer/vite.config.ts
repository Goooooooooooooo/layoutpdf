import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const dist = (file: string) => fileURLToPath(new URL(`../../dist/${file}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  // Set EXAMPLE_BASE=/layoutpdf/ when the demo is served from a GitHub Pages
  // project site; every asset and font URL in main.tsx reads BASE_URL.
  base: process.env.EXAMPLE_BASE ?? '/',
  resolve: {
    // The example consumes the built package entry points, not src/, so it
    // exercises the same output a consumer installs.
    alias: [
      { find: /^layoutpdf\/preview-react$/, replacement: dist('preview-react.js') },
      { find: /^layoutpdf\/preview-dom$/, replacement: dist('preview-dom.js') },
      { find: /^layoutpdf\/designer$/, replacement: dist('designer.js') },
      { find: /^layoutpdf\/presets$/, replacement: dist('presets.js') },
      { find: /^layoutpdf\/plugins\/basic$/, replacement: dist('plugins-basic.js') },
      { find: /^layoutpdf\/plugins\/business$/, replacement: dist('plugins-business.js') },
      { find: /^layoutpdf\/plugins$/, replacement: dist('plugins.js') },
      { find: /^layoutpdf\/core$/, replacement: dist('core.js') },
      { find: /^layoutpdf\/pdf$/, replacement: dist('pdf.js') },
      { find: /^layoutpdf\/i18n$/, replacement: dist('i18n.js') },
      { find: /^layoutpdf$/, replacement: dist('index.js') },
    ],
  },
});
