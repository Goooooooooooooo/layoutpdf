import type { JsonValue, TemplateElement } from '@/engine/core/document.js';

/** A single `path`/`value` assignment applied to a template element. */
export interface ElementPathPatch {
  /** Dot-separated path, for example `box.x` or `props.style.fontSize`. */
  path: string;
  value: JsonValue;
}

const FORBIDDEN_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Set a nested element property from a dot-separated path.
 *
 * Missing intermediate objects are created. Prototype-polluting path
 * segments are rejected. The value is deep-cloned so callers never share
 * mutable input structures with the template.
 */
export function setElementPath(
  element: TemplateElement<object>,
  patch: ElementPathPatch,
): void {
  const parts = patch.path.split('.').filter(Boolean);
  if (parts.length === 0 || parts.some(part => FORBIDDEN_PATH_PARTS.has(part))) {
    throw new Error(`Invalid element patch path: ${patch.path}`);
  }
  let target = element as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const current = target[part];
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      target[part] = {};
    }
    target = target[part] as Record<string, unknown>;
  }
  target[parts.at(-1)!] = structuredClone(patch.value);
}
