import type { TemplateFile } from '@/engine/core/document.js';
import {
  assertValidTemplateFile,
  TemplateFileSchema,
} from '@/engine/core/validation.js';
import { assertTemplateJsonSize } from '@/engine/utils/limits.js';

export interface StringifyTemplateJsonOptions {
  space?: number;
}

function normalizeJsonText(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseTemplateJson(text: string): TemplateFile {
  assertTemplateJsonSize(text);
  let value: unknown;
  try {
    value = JSON.parse(normalizeJsonText(text));
  } catch (error) {
    throw new SyntaxError(
      `Template JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const parsed = TemplateFileSchema.parse(value);
  assertValidTemplateFile(parsed);
  return structuredClone(parsed);
}

export function stringifyTemplateJson(
  file: TemplateFile,
  options: StringifyTemplateJsonOptions = {},
): string {
  const space = options.space ?? 2;
  if (!Number.isInteger(space) || space < 0 || space > 10) {
    throw new RangeError('Template JSON indentation must be an integer from 0 to 10.');
  }
  assertValidTemplateFile(file);
  const parsed = TemplateFileSchema.parse(file);
  return JSON.stringify(parsed, null, space);
}
