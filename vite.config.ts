import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));
const externalPackages = [
  '@pdf-lib/fontkit',
  'pdf-lib',
  'pdfjs-dist',
  'qrcode-generator',
  'zod',
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:url',
];

export default defineConfig({
  // The library ships fonts as an opt-in asset, not inside the npm tarball.
  // `scripts/copy-assets.mjs` copies only the wasm subsetter and licenses.
  publicDir: false,
  resolve: {
    alias: {
      '@': sourceDirectory,
    },
  },
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        core: fileURLToPath(new URL('./src/core.ts', import.meta.url)),
        pdf: fileURLToPath(new URL('./src/pdf.ts', import.meta.url)),
        'pdf-node': fileURLToPath(new URL('./src/pdf-node.ts', import.meta.url)),
        'pdf-worker': fileURLToPath(new URL('./src/pdf-worker.ts', import.meta.url)),
        plugins: fileURLToPath(new URL('./src/plugins.ts', import.meta.url)),
        'plugins-basic': fileURLToPath(new URL('./src/plugins/basic.ts', import.meta.url)),
        'plugins-business': fileURLToPath(new URL('./src/plugins/business.ts', import.meta.url)),
        'preview-react': fileURLToPath(new URL('./src/preview-react.tsx', import.meta.url)),
        'preview-dom': fileURLToPath(new URL('./src/preview-dom.ts', import.meta.url)),
        presets: fileURLToPath(new URL('./src/presets/index.ts', import.meta.url)),
        i18n: fileURLToPath(new URL('./src/i18n.ts', import.meta.url)),
        designer: fileURLToPath(new URL('./src/designer/index.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: externalPackages,
    },
  },
});
