/**
 * Install-level check.
 *
 * Packs the package, installs the tarball into an empty project, and exercises
 * every public entry the way a real consumer would. `npm run smoke` imports the
 * build through the package self-reference, which cannot catch missing files or
 * a broken `exports` map; this can.
 *
 * Two phases:
 *   1. no React installed - core entries must load on their own, so the
 *      optional peer stays optional;
 *   2. React installed - UI entries and the designer SSR path must load.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const fonts = resolve(root, 'public/fonts');

// npm injects its own config into the environment; clear it so the nested
// install behaves like a plain user command.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_') && !key.startsWith('npm_lifecycle_')),
);

const npm = (args, options = {}) => execFileSync('npm', args, {
  env: cleanEnv,
  stdio: 'pipe',
  ...options,
});

// `--ignore-scripts` keeps `prepare` from rebuilding (and printing build output
// into the JSON channel); `npm run build` has already produced `dist/`.
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
const tarball = resolve(root, pack.filename);
const project = mkdtempSync(join(tmpdir(), 'layoutpdf-install-'));

const CORE_ENTRIES = [
  'layoutpdf',
  'layoutpdf/core',
  'layoutpdf/plugins',
  'layoutpdf/plugins/basic',
  'layoutpdf/plugins/business',
  'layoutpdf/presets',
  'layoutpdf/i18n',
  'layoutpdf/preview-dom',
  'layoutpdf/pdf',
  'layoutpdf/pdf/worker',
  'layoutpdf/pdf/node',
];

const UI_ENTRIES = [
  'layoutpdf/preview-react',
  'layoutpdf/designer',
];

const entryList = entries => entries.map(entry => `  ${JSON.stringify(entry)},`).join('\n');

try {
  writeFileSync(join(project, 'package.json'), JSON.stringify({
    name: 'layoutpdf-install-check',
    private: true,
    type: 'module',
  }, null, 2));

  npm(['install', '--no-audit', '--no-fund', '--ignore-scripts', '--prefer-offline', '--loglevel=error', tarball], { cwd: project });

  // Phase 1: no React in the tree.
  writeFileSync(join(project, 'core.mjs'), `
import assert from 'node:assert/strict';

const entries = [
${entryList(CORE_ENTRIES)}
];

for (const entry of entries) {
  const loaded = await import(entry);
  assert.ok(loaded !== undefined, entry + ' did not load');
}

assert.equal(globalThis.customElements, undefined, 'phase 1 must run without a DOM');
console.log('Core entries load without React: ' + entries.length + ' entries.');
`);

  process.stdout.write(execFileSync(process.execPath, ['core.mjs'], { cwd: project, encoding: 'utf8' }));

  // Phase 2: React installed, as a host using the UI entries would have it.
  npm(['install', '--no-audit', '--no-fund', '--ignore-scripts', '--prefer-offline', '--loglevel=error', 'react@19', 'react-dom@19'], { cwd: project });

  writeFileSync(join(project, 'check.mjs'), `
import assert from 'node:assert/strict';

const entries = [
${entryList([...CORE_ENTRIES, ...UI_ENTRIES])}
];

for (const entry of entries) {
  const loaded = await import(entry);
  assert.ok(loaded !== undefined, entry + ' did not load');
}

// The designer entry must survive server evaluation and still export its API.
const designer = await import('layoutpdf/designer');
assert.equal(typeof designer.registerLayoutPDFDesigner, 'function');
assert.ok(designer.Designer, 'the React Designer export is missing');
assert.equal(typeof designer.createLocalDesignerStorage, 'function');
assert.equal(globalThis.customElements, undefined, 'the check must run without a DOM');

const { createNodeEngine } = await import('layoutpdf/pdf/node');
const engine = await createNodeEngine({
  fontPath: ${JSON.stringify(join(fonts, 'NotoSansCJKjp-Regular.otf'))},
  boldFontPath: ${JSON.stringify(join(fonts, 'NotoSansCJKjp-Bold.otf'))},
});

const template = engine
  .createTemplate({ name: 'Install check' })
  .addElement('text', { x: 20, y: 20, value: 'Installed package' })
  .build();

const bytes = await engine.createDocument(template).generatePdf({ subsetter: true });
assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
assert.ok(bytes.byteLength > 1000);
// The subsetter wasm ships in dist/fonts. If it cannot be resolved the export
// silently falls back to embedding the whole CJK font, which is about 14 MB.
assert.ok(
  bytes.byteLength < 2_000_000,
  'expected a subsetted PDF, got ' + bytes.byteLength + ' bytes; the shipped hb-subset.wasm did not load',
);

console.log('Install check passed: ' + entries.length + ' entries, ' + bytes.byteLength + ' PDF bytes.');
`);

  process.stdout.write(execFileSync(process.execPath, ['check.mjs'], { cwd: project, encoding: 'utf8' }));
} finally {
  rmSync(project, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
