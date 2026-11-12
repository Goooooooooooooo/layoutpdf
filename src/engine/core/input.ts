import type { JsonValue, TemplateElement } from '@/engine/core/document.js';

export type InputRecord = Record<string, JsonValue>;

export interface LayoutPDFInputSet {
  records: InputRecord[];
  activeRecordIndex: number;
}

export interface ResolvedElement {
  element: TemplateElement<object>;
  value: JsonValue;
}

export function hasOwnInputValue(input: InputRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function isMissingRequiredInput(input: InputRecord, key: string): boolean {
  if (!hasOwnInputValue(input, key)) return true;
  const value = input[key];
  if (value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function resolveElementValue(
  element: TemplateElement<object>,
  input: InputRecord,
): JsonValue {
  const key = element.binding?.key;
  if (!key) return element.value;
  return hasOwnInputValue(input, key) ? input[key] : element.value;
}

export function resolveElement(
  element: TemplateElement<object>,
  input: InputRecord,
): ResolvedElement {
  return { element, value: resolveElementValue(element, input) };
}

export function createInputSet(records: InputRecord[] = [{}]): LayoutPDFInputSet {
  return {
    records: records.length > 0 ? records : [{}],
    activeRecordIndex: 0,
  };
}

export function getActiveInput(inputSet: LayoutPDFInputSet): InputRecord {
  return inputSet.records[inputSet.activeRecordIndex] ?? inputSet.records[0] ?? {};
}
