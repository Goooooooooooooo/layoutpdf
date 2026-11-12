import type { RenderIssue } from '@/engine/utils/errors.js';
import {
  LayoutPDFValidationError,
  isLayoutPDFRuntimeError,
  type RuntimeErrorValue,
} from '@/engine/utils/errors.js';
import { t, type MessageValues } from '@/i18n/messages.js';
import { issueMessageKey } from '@/issues/issueRegistry.js';

function detailFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function valuesFrom(
  values: Readonly<Record<string, RuntimeErrorValue>> = {},
  fallback: string,
): MessageValues {
  return { ...values, detail: fallback };
}

export function formatErrorCodeMessage(
  code: string,
  values: Readonly<Record<string, RuntimeErrorValue>> = {},
  fallback = '',
): string {
  const key = issueMessageKey(code, values);
  if (key) return t(key, valuesFrom(values, fallback));
  const fallbackKey = code ? 'error.unmappedWithCode' : 'error.unmapped';
  return t(fallbackKey, { code, detail: fallback || code });
}

export function formatRenderIssue(issue: RenderIssue): string {
  return formatErrorCodeMessage(issue.code, {
    ...issue.values,
    inputKey: issue.inputKey,
    path: issue.path,
    pageId: issue.pageId,
    elementId: issue.elementId,
    detail: issue.message,
  }, issue.message);
}

export function formatCaughtError(error: unknown): string {
  if (isLayoutPDFRuntimeError(error)) {
    return formatErrorCodeMessage(error.code, error.values, error.message);
  }
  if (error instanceof LayoutPDFValidationError && error.issues.length > 0) {
    return error.issues.map(formatRenderIssue).join('\n');
  }
  return detailFrom(error);
}
