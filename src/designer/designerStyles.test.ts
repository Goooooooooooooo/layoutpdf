import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('designer style bundle', async t => {
  await t.test('imports every stylesheet, including the canvas chrome', () => {
    const source = read('./styles.ts');
    for (const sheet of [
      '@/styles/designer.css?inline',
      '@/styles/designer-tokens.css?inline',
      '@/styles/properties.css?inline',
      '@/styles/responsive.css?inline',
      '@/styles/ui.css?inline',
      '@/styles/workspace.css?inline',
      './designer.css?inline',
    ]) {
      assert.ok(source.includes(sheet), `styles.ts must import ${sheet}`);
    }
  });

  await t.test('canvas stylesheet defines the interactive chrome', () => {
    const css = read('../styles/designer.css');
    for (const selector of [
      '.layoutpdf-render-page',
      '.layoutpdf-designer-chrome',
      '.layoutpdf-ruler',
      '.layoutpdf-element-chrome',
      '.layoutpdf-resize-handle',
      '.layoutpdf-snap-guide',
      '.layoutpdf-selection-marquee',
      '.layoutpdf-page-padding-guide',
    ]) {
      assert.ok(css.includes(selector), `designer.css must define ${selector}`);
    }
  });
});
