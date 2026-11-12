import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultFontManager } from '@/engine/pdf/font/defaultFontManager.js';

test('createDefaultFontManager', async t => {
  await t.test('explains the Node alternative for relative font URLs', async () => {
    await assert.rejects(
      () => createDefaultFontManager(),
      /use createNodeEngine\(\) from 'layoutpdf\/pdf\/node'/,
    );
  });

  await t.test('explains the Node alternative for file URLs', async () => {
    await assert.rejects(
      () => createDefaultFontManager('file:///fonts/'),
      /use createNodeEngine\(\) from 'layoutpdf\/pdf\/node'/,
    );
  });
});
