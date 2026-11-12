import type { ComponentType } from 'react';
import type { JsonValue, TemplateElement, TemplateFile } from '@/engine/core/document.js';

/**
 * Props passed to a custom designer property editor.
 *
 * The editor is rendered in the property panel for a single element type and
 * can freely use the host's own React components. Paths listed in
 * `ownedPaths` are removed from the generic property fields so an editor can
 * replace the built-in control without rendering twice.
 */
export interface DesignerPropertyEditorProps {
  element: TemplateElement<object>;
  disabled: boolean;
  templateFile: TemplateFile;
  /** Patches one element path, e.g. `patch('props.currency', 'USD')`. */
  patch(path: string, value: JsonValue): void;
  /** Patches several element paths in one history entry. */
  patchMany(patches: ReadonlyArray<{ path: string; value: JsonValue }>): void;
}

export interface DesignerPropertyEditor {
  component: ComponentType<DesignerPropertyEditorProps>;
  /**
   * Property paths rendered by this editor. Matching generic fields are hidden.
   * Defaults to no owned paths, so the custom editor renders after the
   * generated fields.
   */
  ownedPaths?: readonly string[];
}

export type DesignerPropertyEditorDefinition =
  | ComponentType<DesignerPropertyEditorProps>
  | DesignerPropertyEditor;

/**
 * Keyed by element type (`text`, `table`, or a plugin type).
 *
 * ```tsx
 * const propertyEditors = {
 *   text: {
 *     ownedPaths: ['value'],
 *     component: ({ element, patch }) => (
 *       <textarea
 *         value={String(element.value ?? '')}
 *         onChange={event => patch('value', event.currentTarget.value)}
 *       />
 *     ),
 *   },
 * };
 * ```
 */
export type DesignerPropertyEditors = Record<
  string,
  DesignerPropertyEditorDefinition
>;

export interface ResolvedDesignerPropertyEditor {
  component: ComponentType<DesignerPropertyEditorProps>;
  ownedPaths: ReadonlySet<string>;
  configured: boolean;
}

function isEditorDefinition(
  definition: DesignerPropertyEditorDefinition,
): definition is DesignerPropertyEditor {
  return typeof definition === 'object' && definition !== null && 'component' in definition;
}

export function resolveDesignerPropertyEditor(
  type: string | undefined,
  editors: DesignerPropertyEditors | undefined,
): ResolvedDesignerPropertyEditor | undefined {
  if (!type || !editors) return undefined;
  const definition = editors[type];
  if (!definition) return undefined;
  if (isEditorDefinition(definition)) {
    return {
      component: definition.component,
      ownedPaths: new Set(definition.ownedPaths ?? []),
      configured: true,
    };
  }
  return {
    component: definition,
    ownedPaths: new Set(),
    configured: true,
  };
}
