export type DesignerShortcutAction =
  | { type: 'delete' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'duplicate' }
  | { type: 'select-all' }
  | { type: 'group' }
  | { type: 'ungroup' }
  | { type: 'undo' }
  | { type: 'redo' };

export interface DesignerShortcutInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
].join(', ');

function isEditable(target: DesignerShortcutInput['target']): boolean {
  if (!target || typeof target !== 'object') return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== 'function') return false;
  return Boolean(closest.call(target, EDITABLE_SELECTOR));
}

/**
 * Maps a keyboard event to a designer command. This is the single source of
 * truth for shortcuts, so the labels rendered in the canvas context menu match
 * what the canvas actually handles.
 */
export function resolveDesignerShortcut(
  input: DesignerShortcutInput,
): DesignerShortcutAction | undefined {
  if (isEditable(input.target) || input.altKey) return undefined;
  const modifier = input.metaKey || input.ctrlKey;
  const key = input.key.toLowerCase();

  if (!modifier) {
    return input.key === 'Delete' || input.key === 'Backspace'
      ? { type: 'delete' }
      : undefined;
  }

  switch (key) {
    case 'z':
      return { type: input.shiftKey ? 'redo' : 'undo' };
    case 'y':
      return { type: 'redo' };
    case 'c':
      return input.shiftKey ? undefined : { type: 'copy' };
    case 'v':
      return input.shiftKey ? undefined : { type: 'paste' };
    case 'd':
      return input.shiftKey ? undefined : { type: 'duplicate' };
    case 'a':
      return input.shiftKey ? undefined : { type: 'select-all' };
    case 'g':
      return { type: input.shiftKey ? 'ungroup' : 'group' };
    default:
      return undefined;
  }
}
