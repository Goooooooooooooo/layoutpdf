import type {
  ComputedGridCell,
  GridNode,
  RenderDocument,
  RenderNode,
  RenderOutput,
  TableNode,
} from '@/engine/renderTree/model.js';
import { formatNumericPresentation } from '@/engine/renderTree/numericPresentation.js';
import { computeTableNode } from '@/engine/renderTree/tableLayout.js';
import type { RenderIssue } from '@/engine/utils/errors.js';
import { formatBooleanValue } from '@/i18n/formatters.js';
import { createFormulaOutputReference } from '@/utils/calc.js';
import { roundDecimal } from '@/utils/rounding.js';

function outputKey(pageId: string, sourceElementId: string, outputId: string): string {
  return `${pageId}\u0000${sourceElementId}\u0000${outputId}`;
}

export function computeProducerNodes(document: RenderDocument): RenderDocument {
  const issues = [...document.issues];
  const pages = document.pages.map(page => ({ ...page, nodes: [...page.nodes] }));
  const sharedFields: Record<string, number | string> = {};
  const tableLocations: Array<{ pageIndex: number; nodeIndex: number }> = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    for (let nodeIndex = 0; nodeIndex < pages[pageIndex].nodes.length; nodeIndex++) {
      const node = pages[pageIndex].nodes[nodeIndex];
      if (node.kind !== 'table') continue;
      tableLocations.push({ pageIndex, nodeIndex });
      Object.assign(sharedFields, node.formulaFields);
    }
  }

  const pending = new Set(tableLocations);
  const errors = new Map<(typeof tableLocations)[number], unknown>();
  while (pending.size > 0) {
    let progressed = false;
    for (const location of [...pending]) {
      const page = pages[location.pageIndex];
      const node = page.nodes[location.nodeIndex] as TableNode;
      try {
        const computed = computeTableNode({
          ...node,
          formulaFields: { ...sharedFields },
        });
        pages[location.pageIndex].nodes[location.nodeIndex] = computed;
        for (const error of computed.formulaErrors ?? []) {
          const column = error.kind === 'row'
            ? computed.columns.find(candidate => candidate.key === error.columnKey)
            : undefined;
          const footer = error.kind === 'footer'
            ? computed.footers.find(candidate => candidate.id === error.footerId)
            : undefined;
          issues.push({
            severity: 'error',
            code: 'TABLE_FORMULA_EVALUATION_FAILED',
            message: error.message,
            pageId: page.sourcePageId,
            elementId: node.sourceElementId,
            values: error.kind === 'row'
              ? {
                  formulaTarget: 'row',
                  rowId: error.rowId,
                  rowIndex: error.rowIndex,
                  rowNumber: error.rowIndex + 1,
                  columnKey: error.columnKey,
                  columnLabel: column?.label ?? error.columnKey,
                  detail: error.message,
                }
              : {
                  formulaTarget: 'footer',
                  footerId: error.footerId,
                  footerLabel: footer?.label ?? error.footerId,
                  detail: error.message,
                },
          });
        }
        for (const footer of computed.computedFooters) {
          // Errored footers stay visible in the table but are not published.
          if (typeof footer.value !== 'number') continue;
          const published = roundDecimal(footer.value, footer.decimalPlaces ?? 0);
          sharedFields[createFormulaOutputReference(computed.sourceElementId, footer.id)] = published;
          const key = footer.outputFieldKey?.trim();
          if (key && !Object.prototype.hasOwnProperty.call(sharedFields, key)) {
            sharedFields[key] = published;
          }
        }
        pending.delete(location);
        errors.delete(location);
        progressed = true;
      } catch (error) {
        errors.set(location, error);
      }
    }
    if (!progressed) break;
  }

  for (const location of pending) {
    const page = pages[location.pageIndex];
    const node = page.nodes[location.nodeIndex] as TableNode;
    const error = errors.get(location);
    issues.push({
      severity: 'error',
      code: 'INVALID_FORMULA',
      message: error instanceof Error ? error.message : 'Formula is invalid.',
      pageId: page.sourcePageId,
      elementId: node.sourceElementId,
    });
    page.nodes[location.nodeIndex] = {
      ...node,
      formulaFields: { ...sharedFields },
      columns: node.columns.map(column => ({
        ...column,
        formula: column.formula ? { ...column.formula } : undefined,
      })),
      rows: node.rows.map(row => ({ ...row })),
      computedRows: node.rows.map(row => ({ ...row })),
      footers: node.footers.map(footer => ({
        ...footer,
        formula: { ...footer.formula },
      })),
      computedFooters: [],
      outputs: [],
    };
  }

  return { ...document, pages, issues };
}

interface OutputIndex {
  outputs: Map<string, RenderOutput>;
  sourcePageIds: Map<string, Set<string>>;
}

function collectElementOutputs(
  document: RenderDocument,
  issues: RenderIssue[],
): OutputIndex {
  const outputs = new Map<string, RenderOutput>();
  const sourcePageIds = new Map<string, Set<string>>();
  for (const page of document.pages) {
    for (const node of page.nodes) {
      const pages = sourcePageIds.get(node.sourceElementId) ?? new Set<string>();
      pages.add(page.sourcePageId);
      sourcePageIds.set(node.sourceElementId, pages);
      for (const output of node.outputs ?? []) {
        const key = outputKey(page.sourcePageId, node.sourceElementId, output.id);
        if (outputs.has(key)) {
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_RENDER_OUTPUT',
            message: `Duplicate render output: ${output.id}.`,
            pageId: page.sourcePageId,
            elementId: node.sourceElementId,
            values: {
              sourceElementId: node.sourceElementId,
              outputId: output.id,
            },
          });
          continue;
        }
        outputs.set(key, output);
      }
    }
  }
  return { outputs, sourcePageIds };
}

function unsupportedOutputIssue(
  pageId: string,
  node: GridNode,
  sourceElementId: string,
  outputId: string,
): RenderIssue {
  return {
    severity: 'error',
    code: 'UNSUPPORTED_ELEMENT_OUTPUT_VALUE',
    message: `Unsupported render output value: ${outputId}.`,
    pageId,
    elementId: node.sourceElementId,
    values: { sourceElementId, outputId },
  };
}

function bindOutputValue(
  cell: ComputedGridCell,
  output: RenderOutput,
  document: RenderDocument,
): ComputedGridCell | undefined {
  if (output.value === null) return { ...cell, content: '', prefixText: undefined };
  if (output.kind === 'number' && typeof output.value === 'number' && Number.isFinite(output.value)) {
    const presentation = formatNumericPresentation(
      output.value,
      output.numericFormat,
      output.decimalPlaces ?? 0,
      document.format,
    );
    return {
      ...cell,
      content: presentation.text,
      ...(presentation.prefixText ? { prefixText: presentation.prefixText } : { prefixText: undefined }),
    };
  }
  if (output.kind === 'text' && typeof output.value === 'string') {
    return { ...cell, content: output.value, prefixText: undefined };
  }
  if (output.kind === 'boolean' && typeof output.value === 'boolean') {
    return {
      ...cell,
      content: formatBooleanValue(output.value, document.format.locale),
      prefixText: undefined,
    };
  }
  return undefined;
}

function resolveGridBindings(
  node: GridNode,
  pageId: string,
  document: RenderDocument,
  index: OutputIndex,
  issues: RenderIssue[],
): GridNode {
  if (!node.outputBindings?.length) return node;
  const computedCells: GridNode['computedCells'] = Object.fromEntries(
    Object.entries(node.computedCells).map(([key, cell]) => [key, { ...cell }]),
  );
  const boundCells = new Set<string>();
  for (const binding of node.outputBindings) {
    const { sourceElementId, outputId } = binding.source;
    if (boundCells.has(binding.cellKey) || !computedCells[binding.cellKey]) {
      issues.push({
        severity: 'error',
        code: 'SUMMARY_BLOCK_LAYOUT_FAILED',
        message: `Invalid summary output binding cell: ${binding.cellKey}.`,
        pageId,
        elementId: node.sourceElementId,
        values: { sourceElementId, outputId },
      });
      continue;
    }
    boundCells.add(binding.cellKey);
    const output = index.outputs.get(outputKey(pageId, sourceElementId, outputId));
    if (!output) {
      const sourceOnPage = index.sourcePageIds.get(sourceElementId)?.has(pageId) ?? false;
      issues.push({
        severity: 'error',
        code: sourceOnPage ? 'MISSING_ELEMENT_OUTPUT' : 'MISSING_ELEMENT_OUTPUT_SOURCE',
        message: sourceOnPage
          ? `Element output not found: ${outputId}.`
          : `Element output source not found on page: ${sourceElementId}.`,
        pageId,
        elementId: node.sourceElementId,
        values: { sourceElementId, outputId },
      });
      computedCells[binding.cellKey] = {
        ...computedCells[binding.cellKey],
        content: '',
        prefixText: undefined,
      };
      continue;
    }
    if (binding.part === 'label') {
      computedCells[binding.cellKey] = {
        ...computedCells[binding.cellKey],
        content: binding.labelMode === 'custom'
          ? binding.customLabel ?? ''
          : output.label,
        prefixText: undefined,
      };
      continue;
    }
    const resolved = bindOutputValue(computedCells[binding.cellKey], output, document);
    if (!resolved) {
      issues.push(unsupportedOutputIssue(pageId, node, sourceElementId, outputId));
      computedCells[binding.cellKey] = {
        ...computedCells[binding.cellKey],
        content: '',
        prefixText: undefined,
      };
      continue;
    }
    computedCells[binding.cellKey] = resolved;
  }
  return { ...node, computedCells };
}

export function resolveOutputBindings(document: RenderDocument): RenderDocument {
  const issues = [...document.issues];
  const index = collectElementOutputs(document, issues);
  const pages = document.pages.map(page => ({
    ...page,
    nodes: page.nodes.map((node): RenderNode =>
      node.kind === 'grid'
        ? resolveGridBindings(node, page.sourcePageId, document, index, issues)
        : node
    ),
  }));
  return { ...document, pages, issues };
}
