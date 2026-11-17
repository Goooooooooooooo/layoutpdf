import type { LayoutPDFTemplate } from '@/engine/core/document.js';
import {
  removeElementsFromTemplate,
  type DanglingOutputReference,
} from '@/engine/core/elementEditing.js';

/**
 * Lists the formulas that would be left pointing at an output owned by one of
 * the given elements, without touching the template. The editor uses this to
 * warn before the deletion becomes an undoable edit.
 */
export function collectDanglingOutputReferences(
  template: LayoutPDFTemplate,
  ids: readonly string[],
): DanglingOutputReference[] {
  if (ids.length === 0) return [];
  const copy = structuredClone(template);
  const references: DanglingOutputReference[] = [];
  removeElementsFromTemplate(copy, ids, {
    onDanglingOutputReference: reference => references.push(reference),
  });
  return references;
}
