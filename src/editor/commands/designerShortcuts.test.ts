import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDesignerShortcut } from '@/editor/commands/designerShortcuts.js';

const target = (editable: boolean) => ({
  closest: () => (editable ? {} : null),
});

test('designer shortcuts', async t => {
  await t.test('deletes with Delete or Backspace', () => {
    assert.deepEqual(resolveDesignerShortcut({ key: 'Delete', target: target(false) }), { type: 'delete' });
    assert.deepEqual(resolveDesignerShortcut({ key: 'Backspace', target: target(false) }), { type: 'delete' });
  });

  await t.test('maps undo and redo for both platforms', () => {
    assert.deepEqual(resolveDesignerShortcut({ key: 'z', metaKey: true, target: target(false) }), { type: 'undo' });
    assert.deepEqual(resolveDesignerShortcut({ key: 'z', ctrlKey: true, target: target(false) }), { type: 'undo' });
    assert.deepEqual(
      resolveDesignerShortcut({ key: 'z', metaKey: true, shiftKey: true, target: target(false) }),
      { type: 'redo' },
    );
    assert.deepEqual(resolveDesignerShortcut({ key: 'y', ctrlKey: true, target: target(false) }), { type: 'redo' });
  });

  await t.test('maps clipboard and selection commands', () => {
    const keys: Array<[string, string]> = [
      ['c', 'copy'],
      ['v', 'paste'],
      ['d', 'duplicate'],
      ['a', 'select-all'],
      ['g', 'group'],
    ];
    for (const [key, type] of keys) {
      assert.deepEqual(
        resolveDesignerShortcut({ key, metaKey: true, target: target(false) }),
        { type },
        `Cmd+${key} should map to ${type}`,
      );
    }
    assert.deepEqual(
      resolveDesignerShortcut({ key: 'g', metaKey: true, shiftKey: true, target: target(false) }),
      { type: 'ungroup' },
    );
  });

  await t.test('ignores shortcuts while typing in a field', () => {
    for (const key of ['Delete', 'Backspace', 'z', 'c', 'v', 'a']) {
      assert.equal(
        resolveDesignerShortcut({ key, metaKey: true, target: target(true) }),
        undefined,
        `${key} must not be intercepted inside editable controls`,
      );
    }
  });

  await t.test('ignores unmodified letters, Alt combinations and unrelated keys', () => {
    assert.equal(resolveDesignerShortcut({ key: 'z', target: target(false) }), undefined);
    assert.equal(resolveDesignerShortcut({ key: 'z', metaKey: true, altKey: true, target: target(false) }), undefined);
    assert.equal(resolveDesignerShortcut({ key: 'ArrowLeft', target: target(false) }), undefined);
    assert.equal(resolveDesignerShortcut({ key: 'Escape', target: target(false) }), undefined);
  });
});
