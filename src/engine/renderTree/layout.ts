import type { RenderIssue } from '@/engine/utils/errors.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type { RenderDocument, RenderNode } from '@/engine/renderTree/model.js';
import { paginateTables } from '@/engine/renderTree/paginateTables.js';
import {
  layoutTablePresentation,
  measureTableRowHeights,
} from '@/engine/renderTree/tablePresentation.js';
import { layoutTextNode } from '@/engine/renderTree/textLayout.js';
import { layoutGridPresentation } from '@/engine/renderTree/gridPresentation.js';
import { DEFAULT_FORMAT_LOCALE_SETTINGS } from '@/i18n/locales.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';

export interface LayoutContext {
  fontManager: FontManager;
}

export interface LayoutOptions {
  /**
   * When false, the render document keeps the template's static layout: table pagination,
   * continuation pages, and followed-group movement are skipped. Used by the designer
   * canvas; pagination only applies to input preview and PDF export.
   */
  paginate?: boolean;
}

function layoutNode(
  node: RenderNode,
  pageId: string,
  context: LayoutContext,
  format: FormatLocaleSettings,
  issues: RenderIssue[],
): RenderNode {
  if (node.kind === 'table') {
    try {
      return measureTableRowHeights(
        node,
        context.fontManager,
        format,
      );
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'TABLE_PRESENTATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
        pageId,
        elementId: node.sourceElementId,
      });
      return node;
    }
  }
  if (node.kind === 'grid') {
    try {
      const result = layoutGridPresentation(node, context.fontManager);
      if (result.layout.cells.some(cell => cell.overflow)) {
        issues.push({
          severity: 'warning',
          code: 'GRID_CELL_OVERFLOW',
          message: 'Grid cell text exceeds the available cell box.',
          pageId,
          elementId: node.sourceElementId,
        });
      }
      return result;
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'GRID_LAYOUT_FAILED',
        message: error instanceof Error ? error.message : String(error),
        pageId,
        elementId: node.sourceElementId,
      });
      return node;
    }
  }
  if (node.kind !== 'text') return node;

  try {
    const result = layoutTextNode(node, context.fontManager);
    if (result.layout.overflow) {
      issues.push({
        severity: 'warning',
        code: 'TEXT_OVERFLOW',
        message: 'Text exceeds the available element box.',
        pageId,
        elementId: node.sourceElementId,
      });
    }
    return result;
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'TEXT_LAYOUT_FAILED',
      message: error instanceof Error ? error.message : String(error),
      pageId,
      elementId: node.sourceElementId,
    });
    return node;
  }
}

export function layoutRenderTree(
  document: RenderDocument,
  context: LayoutContext,
  options: LayoutOptions = {},
): RenderDocument {
  const format = document.format ?? DEFAULT_FORMAT_LOCALE_SETTINGS;
  const issues = document.issues.filter(issue =>
    issue.code !== 'TEXT_OVERFLOW'
    && issue.code !== 'TEXT_LAYOUT_FAILED'
    && issue.code !== 'GRID_CELL_OVERFLOW'
    && issue.code !== 'GRID_LAYOUT_FAILED'
    && issue.code !== 'TABLE_CELL_OVERFLOW'
    && issue.code !== 'ELEMENT_OUTSIDE_PAGE'
    && issue.code !== 'ELEMENT_OVERFLOW_PAGE'
  );
  const pages = document.pages.map(page => ({
    ...page,
    size: { ...page.size },
    padding: [...page.padding] as typeof page.padding,
    background: { ...page.background },
    nodes: page.nodes.map(node => layoutNode(node, page.id, context, format, issues)),
  }));

  const shouldPaginate = options.paginate !== false;
  const paginated = shouldPaginate
    ? paginateTables({
        templateId: document.templateId,
        format,
        pages,
        issues,
      })
    : { pages, issues };
  const finalIssues = paginated.issues.filter(issue => issue.code !== 'TABLE_PRESENTATION_FAILED');
  const reportedCellOverflow = new Set<string>();
  const finalPages = paginated.pages.map(page => ({
    ...page,
    nodes: page.nodes.map(node => {
      if (node.kind === 'text' && node.runtimeRole === 'table-continuation-title') {
        try {
          return layoutTextNode(node, context.fontManager);
        } catch (error) {
          finalIssues.push({
            severity: 'error',
            code: 'TEXT_LAYOUT_FAILED',
            message: error instanceof Error ? error.message : String(error),
            pageId: page.id,
            elementId: node.sourceElementId,
          });
          return node;
        }
      }
      if (node.kind !== 'table') return node;
      try {
        const laidOut = layoutTablePresentation(
          node,
          context.fontManager,
          format,
        );
        if (laidOut.layout.cells.some(cell => cell.truncated)) {
          const key = `${page.sourcePageId}:${node.sourceElementId}`;
          if (!reportedCellOverflow.has(key)) {
            reportedCellOverflow.add(key);
            finalIssues.push({
              severity: 'warning',
              code: 'TABLE_CELL_OVERFLOW',
              message: 'Table cell content was truncated to fit its column.',
              pageId: page.id,
              elementId: node.sourceElementId,
            });
          }
        }
        return laidOut;
      } catch (error) {
        finalIssues.push({
          severity: 'error',
          code: 'TABLE_PRESENTATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          pageId: page.id,
          elementId: node.sourceElementId,
        });
        return node;
      }
    }),
  }));
  for (const page of finalPages) {
    for (const node of page.nodes) {
      const fullyOutside = node.box.x + node.box.width <= 0
        || node.box.y + node.box.height <= 0
        || node.box.x >= page.size.width
        || node.box.y >= page.size.height;
      const partiallyOutside = node.box.x < 0
        || node.box.y < 0
        || node.box.x + node.box.width > page.size.width
        || node.box.y + node.box.height > page.size.height;
      if (fullyOutside) {
        finalIssues.push({
          severity: 'error',
          code: 'ELEMENT_OUTSIDE_PAGE',
          message: 'Element is completely outside the page.',
          pageId: page.id,
          elementId: node.sourceElementId,
        });
      } else if (partiallyOutside) {
        finalIssues.push({
          severity: 'warning',
          code: 'ELEMENT_OVERFLOW_PAGE',
          message: 'Element extends beyond the page boundary.',
          pageId: page.id,
          elementId: node.sourceElementId,
        });
      }
    }
  }
  return {
    templateId: document.templateId,
    format,
    pages: finalPages,
    issues: finalIssues,
  };
}
