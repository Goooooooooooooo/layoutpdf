import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { Window } from 'happy-dom';

// 0. The designer entry must be importable without a DOM. SSR frameworks
// evaluate client entries on the server, and a top-level `HTMLElement`
// reference would turn that into a hard build error.
try {
  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "await import('layoutpdf/designer')"],
    { stdio: 'pipe' },
  );
} catch (error) {
  throw new Error(
    'layoutpdf/designer must import in Node without a DOM (SSR guard).',
    { cause: error },
  );
}

// 1. Core entry: template building and render tree.
const core = await import('layoutpdf');
const { createDefaultEngine } = core;
assert.equal(typeof createDefaultEngine, 'function');

// 2. Framework-independent preview entry imports without a DOM.
const previewDom = await import('layoutpdf/preview-dom');
assert.equal(typeof previewDom.createDomPreview, 'function');
assert.equal(typeof previewDom.renderDomPreview, 'function');

// 3. Plugins entry exposes registries and packs.
const plugins = await import('layoutpdf/plugins');
assert.ok(Array.isArray(plugins.plugins));
assert.ok(plugins.plugins.length > 0);

// 4. Node PDF entry: build and render a real PDF with the bundled fonts.
const { createNodeEngine } = await import('layoutpdf/pdf/node');
const engine = await createNodeEngine();
const template = engine
  .createTemplate({ name: 'Smoke test' })
  .addElement('text', {
    x: 20,
    y: 20,
    box: { width: 120, height: 12 },
    binding: { key: 'message' },
    value: 'Message',
  })
  .build();
const bytes = await engine
  .createDocument(template, { message: 'Smoke test' })
  .generatePdf({ subsetter: true });
assert.ok(bytes.byteLength > 1000);
assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
const document = await PDFDocument.load(bytes);
assert.equal(document.getPageCount(), 1);

// 5. Designer entry registers the Web Component when a DOM is present.
const window = new Window();
for (const key of ['window', 'document', 'HTMLElement', 'customElements', 'Node', 'Element', 'Event', 'CustomEvent', 'MutationObserver']) {
  globalThis[key] = key === 'window' ? window : window[key];
}
globalThis.self = globalThis;
const designer = await import('layoutpdf/designer');
assert.ok(designer.Designer);
assert.equal(typeof designer.registerLayoutPDFDesigner, 'function');
assert.equal(typeof designer.createMemoryDesignerStorage, 'function');
assert.ok(window.customElements.get('layoutpdf-designer'));
const designerStyles = window.document.getElementById('layoutpdf-designer-styles');
assert.ok(designerStyles, 'designer styles are injected on import');
for (const selector of ['.layoutpdf-render-page', '.layoutpdf-ruler', '.layoutpdf-element-chrome', '--layoutpdf-color-primary']) {
  assert.ok(designerStyles.textContent.includes(selector), `designer styles must include ${selector}`);
}

console.log(`Smoke test passed: ${bytes.byteLength} PDF bytes, ${plugins.plugins.length} plugins.`);
