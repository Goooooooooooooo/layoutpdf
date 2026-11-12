import type { JsonValue, TemplateElement } from '@/engine/core/document.js';
import type { PropertyDefinition } from '@/engine/core/plugin.js';
import type { MessageKey } from '@/i18n/index.js';

export const PROPERTY_GROUP_LABEL_KEYS: Record<NonNullable<PropertyDefinition['group']>, MessageKey> = {
  content: 'property.group.content',
  data: 'property.group.data',
  style: 'property.group.style',
  layout: 'property.group.layout',
  advanced: 'property.group.advanced',
};

export type VisiblePropertyGroup = NonNullable<PropertyDefinition['group']>;

export const VISIBLE_PROPERTY_GROUPS: VisiblePropertyGroup[] = [
  'content',
  'data',
  'layout',
  'style',
  'advanced',
];

export function resolvePropertyGroup(group: PropertyDefinition['group']): VisiblePropertyGroup {
  if (group) return group;
  return 'content';
}

export interface PropertyValueState {
  value: unknown;
  mixed: boolean;
}

export function getElementPath(element: TemplateElement<object>, path: string): unknown {
  let value: unknown = element;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function getPropertyValueState(
  elements: TemplateElement<object>[],
  path: string,
): PropertyValueState {
  const value = elements.length > 0 ? getElementPath(elements[0], path) : undefined;
  return {
    value,
    mixed: elements.slice(1).some(element => !valuesEqual(value, getElementPath(element, path))),
  };
}

export function getPropertyDefaultValue(
  defaultElement: TemplateElement<object> | undefined,
  path: string,
): JsonValue | undefined {
  if (!defaultElement) return undefined;
  const value = getElementPath(defaultElement, path);
  return value === undefined ? undefined : value as JsonValue;
}

export function isPropertyAtDefault(
  elements: TemplateElement<object>[],
  path: string,
  defaultValue: JsonValue,
): boolean {
  return elements.every(element => valuesEqual(getElementPath(element, path), defaultValue));
}
