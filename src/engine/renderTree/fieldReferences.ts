import type { InputRecord } from '@/engine/core/input.js';
import type { RenderDocument, RenderNode } from '@/engine/renderTree/model.js';
import type { RenderIssue } from '@/engine/utils/errors.js';
import { formatNumberValue } from '@/i18n/formatters.js';
import { computeProducerNodes } from '@/engine/renderTree/outputReferences.js';
import { createFormulaOutputReference, evaluateFormula } from '@/utils/calc.js';

function numericFieldValue(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return value;
  return undefined;
}

export function resolveFormulaFields(
  document: RenderDocument,
  input: InputRecord,
): RenderDocument {
  const issues: RenderIssue[] = [...document.issues];
  const derivedFields = new Map<string, number>();

  for (const page of document.pages) {
    for (const node of page.nodes) {
      if (node.kind !== 'table') continue;
      for (const footer of node.computedFooters) {
        derivedFields.set(createFormulaOutputReference(node.sourceElementId, footer.id), footer.value);
        const key = footer.outputFieldKey?.trim();
        if (!key) continue;
        if (Object.prototype.hasOwnProperty.call(input, key)) {
          issues.push({
            severity: 'error',
            code: 'DERIVED_FIELD_CONFLICT',
            message: `Derived field conflicts with input field: ${key}.`,
            pageId: page.id,
            elementId: node.sourceElementId,
            inputKey: key,
          });
          continue;
        }
        if (derivedFields.has(key)) {
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_DERIVED_FIELD',
            message: `Duplicate derived field: ${key}.`,
            pageId: page.id,
            elementId: node.sourceElementId,
            inputKey: key,
          });
          continue;
        }
        derivedFields.set(key, footer.value);
      }
    }
  }

  const pages = document.pages.map(page => ({
    ...page,
    nodes: page.nodes.map((node): RenderNode => {
      if (node.kind !== 'text') return node;
      if (node.numericFormula) {
        try {
          const value = evaluateFormula(node.numericFormula.expression, {
            resolve(reference) {
              const key = reference.startsWith('field.')
                ? reference.slice('field.'.length)
                : reference;
              const sourceValue = reference.startsWith('output.')
                ? derivedFields.get(reference)
                : reference.startsWith('field.')
                  ? derivedFields.get(key) ?? input[key]
                  : undefined;
              return typeof sourceValue === 'number' || typeof sourceValue === 'string'
                ? sourceValue
                : undefined;
            },
          }, node.numericFormula.decimalPlaces);
          return {
            ...node,
            text: formatNumberValue(value, {
              mode: node.numericFormula.format,
              locale: document.format.locale,
              prefix: node.numericFormula.prefix,
              suffix: node.numericFormula.suffix,
              decimalPlaces: node.numericFormula.decimalPlaces,
              fallback: 'raw',
            }),
          };
        } catch (error) {
          issues.push({
            severity: 'error',
            code: 'INVALID_FORMULA',
            message: error instanceof Error ? error.message : 'Formula is invalid.',
            pageId: page.id,
            elementId: node.sourceElementId,
          });
          return { ...node, text: '' };
        }
      }
      if (!node.fieldReference) return node;
      const reference = node.fieldReference;
      const sourceValue = derivedFields.get(reference.key) ?? input[reference.key];
      const value = numericFieldValue(sourceValue);
      if (value === undefined) {
        issues.push({
          severity: 'error',
          code: sourceValue === undefined ? 'MISSING_REFERENCED_FIELD' : 'INVALID_REFERENCED_FIELD',
          message: sourceValue === undefined
            ? `Referenced field not found: ${reference.key}.`
            : `Referenced field must be numeric: ${reference.key}.`,
          pageId: page.id,
          elementId: node.sourceElementId,
          inputKey: reference.key,
        });
        return { ...node, text: '' };
      }
      return {
        ...node,
        text: formatNumberValue(value, {
          mode: 'currency',
          locale: document.format.locale,
          prefix: reference.prefix,
          suffix: reference.suffix,
          decimalPlaces: reference.decimalPlaces,
          fallback: 'raw',
        }),
      };
    }),
  }));

  return { ...document, pages, issues };
}

export function resolveFieldReferences(
  document: RenderDocument,
  input: InputRecord,
): RenderDocument {
  return resolveFormulaFields(computeProducerNodes(document), input);
}
