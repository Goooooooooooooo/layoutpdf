import type { PropertyDefinition } from '@/engine/core/plugin.js';

const COMPLEX_PROPERTY_PATHS = new Map<string, ReadonlySet<string>>([
  ['calc', new Set(['value'])],
  ['image', new Set(['value', 'props.fit'])],
  ['select', new Set(['value'])],
  ['radiogroup', new Set(['value'])],
]);

const STRUCTURED_EDITOR_TOKENS = new Set<PropertyDefinition['editor']>([
  'asset',
  'choiceOptions',
  'gridCells',
  'tableColumns',
]);

/**
 * Complex adapters own these paths. Filtering them before the generic field
 * renderer prevents duplicate controls without changing the Plugin contract.
 *
 * `ownedPaths` carries paths claimed by a host-registered property editor.
 */
export function isStandardPropertyDefinition(
  elementType: string,
  definition: PropertyDefinition,
  ownedPaths?: ReadonlySet<string>,
): boolean {
  if (STRUCTURED_EDITOR_TOKENS.has(definition.editor)) return false;
  if (ownedPaths?.has(definition.path)) return false;
  return !COMPLEX_PROPERTY_PATHS.get(elementType)?.has(definition.path);
}
