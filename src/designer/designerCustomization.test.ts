import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile } from '@/engine/core/document.js';
import { resolveDesignerTheme } from '@/designer/theme.js';
import { resolveDesignerPropertyEditor } from '@/designer/propertyEditors.js';
import { isStandardPropertyDefinition } from '@/editor/components/propertyPanel/propertyEditorRouting.js';
import {
  createMemoryDesignerStorage,
  type DesignerStorageAdapter,
} from '@/storage/designerStorageAdapter.js';
import {
  getCurrentAppLocale,
  setCurrentAppLocale,
  subscribeAppLocale,
} from '@/i18n/locales.js';
import {
  readEditorPreferences,
  readSettings,
  writeEditorPreferences,
  type SettingsStorage,
} from '@/settings/settingsStorage.js';

function memoryStorage(): SettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
}

function TemplateEditor() {
  return null;
}

describe('designer customization', () => {
  it('persists editor preferences under a custom key', () => {
    const storage = memoryStorage();
    writeEditorPreferences({ showGrid: false, snapEnabled: false }, storage, 'host-preferences');

    assert.equal(storage.data.has('host-preferences'), true);
    assert.deepEqual(readEditorPreferences(storage, 'host-preferences'), {
      showGrid: false,
      snapEnabled: false,
    });
    // Other settings keep their defaults.
    assert.equal(readSettings(storage, 'host-preferences').exportFilenamePattern, '');
  });

  it('falls back to defaults without storage or with corrupt data', () => {
    assert.equal(readEditorPreferences(undefined).showGrid, true);
    assert.equal(readSettings(undefined).editor.snapEnabled, true);

    const storage = memoryStorage();
    storage.setItem('bad-json', '{');
    assert.equal(readSettings(storage, 'bad-json').editor.showGrid, true);
  });

  it('normalizes theme tokens into CSS variables', () => {
    assert.deepEqual(resolveDesignerTheme({
      '--layoutpdf-color-primary': '#2563eb',
      'layoutpdf-color-workspace': '#f8fafc',
      '--layoutpdf-color-page': '#ffffff',
    }), {
      '--layoutpdf-color-primary': '#2563eb',
      '--layoutpdf-color-workspace': '#f8fafc',
      '--layoutpdf-color-page': '#ffffff',
    });
    assert.equal(resolveDesignerTheme(undefined), undefined);
    assert.equal(resolveDesignerTheme({}), undefined);
    assert.equal(resolveDesignerTheme({ '--layoutpdf-color-primary': undefined }), undefined);
  });

  it('resolves custom property editors and hides owned paths', () => {
    const editors = {
      text: { component: TemplateEditor, ownedPaths: ['value', 'props.multiline'] },
      stamp: TemplateEditor,
    };
    const text = resolveDesignerPropertyEditor('text', editors);
    assert.equal(text?.component, TemplateEditor);
    assert.deepEqual([...(text?.ownedPaths ?? [])], ['value', 'props.multiline']);

    const stamp = resolveDesignerPropertyEditor('stamp', editors);
    assert.equal(stamp?.component, TemplateEditor);
    assert.equal(stamp?.ownedPaths.size, 0);

    assert.equal(resolveDesignerPropertyEditor('rect', editors), undefined);
    assert.equal(resolveDesignerPropertyEditor('text', undefined), undefined);

    const definition = { path: 'value', label: 'Value', editor: 'text' as const };
    assert.equal(isStandardPropertyDefinition('text', definition), true);
    assert.equal(
      isStandardPropertyDefinition('text', definition, text?.ownedPaths),
      false,
    );
    assert.equal(
      isStandardPropertyDefinition('text', { ...definition, path: 'props.color' }, text?.ownedPaths),
      true,
    );
  });

  it('saves, loads, lists, and deletes templates and reusable blocks', async () => {
    const adapter: DesignerStorageAdapter = createMemoryDesignerStorage();
    const template = createBlankTemplateFile({
      idGenerator: prefix => `${prefix}_1`,
      name: 'Stored template',
    });

    await adapter.saveTemplate?.(template);
    await adapter.saveTemplate?.(template);
    const summaries = await adapter.listTemplates?.();
    assert.equal(summaries?.length, 1);
    assert.equal(summaries?.[0]?.id, 'tpl_1');
    assert.equal(summaries?.[0]?.name, 'Stored template');
    assert.ok(summaries?.[0]?.updatedAt);
    assert.deepEqual(await adapter.loadTemplate?.('tpl_1'), template);
    assert.equal(await adapter.loadTemplate?.('missing'), null);

    await adapter.deleteTemplate?.('tpl_1');
    assert.deepEqual(await adapter.listTemplates?.(), []);

    const block = {
      version: 1 as const,
      id: 'block_1',
      name: 'Header',
      elements: [],
      assets: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await adapter.saveReusableBlock?.(block);
    assert.deepEqual(await adapter.listReusableBlocks?.(), [block]);
    await adapter.deleteReusableBlock?.('block_1');
    assert.deepEqual(await adapter.listReusableBlocks?.(), []);
  });

  it('notifies locale subscribers only when the locale changes', () => {
    const previous = getCurrentAppLocale();
    let calls = 0;
    const unsubscribe = subscribeAppLocale(() => { calls += 1; });
    try {
      setCurrentAppLocale('en-US');
      setCurrentAppLocale('en-US');
      assert.equal(calls, 1);
      assert.equal(getCurrentAppLocale(), 'en-US');
      setCurrentAppLocale('ja-JP');
      assert.equal(calls, 2);
    } finally {
      unsubscribe();
      setCurrentAppLocale(previous);
    }
  });
});
