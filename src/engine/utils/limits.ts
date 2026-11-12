import type { TemplateFile } from '@/engine/core/document.js';
import { LayoutPDFRuntimeError, type ValidationIssue } from '@/engine/utils/errors.js';
import { getBase64AssetByteLength, getImageDataUrlByteLength } from '@/engine/utils/assets.js';

const MEBIBYTE = 1024 * 1024;

export const IMPORT_LIMITS = {
  template: 64 * MEBIBYTE,
  pdf: 32 * MEBIBYTE,
  image: 10 * MEBIBYTE,
  font: 40 * MEBIBYTE,
} as const;

export type ImportFileKind = keyof typeof IMPORT_LIMITS;

const IMPORT_LABELS: Record<ImportFileKind, string> = {
  template: '模板文件',
  pdf: 'PDF 文件',
  image: '图片文件',
  font: '字体文件',
};

export interface TemplateComplexityLimits {
  maxPages: number;
  maxElementsPerPage: number;
  maxTableRowsPerElement: number;
  maxGridRowsPerElement: number;
  maxGridColumnsPerElement: number;
  maxGridCellsPerElement: number;
  maxAssets: number;
  maxPdfAssetBytes: number;
  maxImageAssetBytes: number;
  maxTotalAssetBytes: number;
}

export const TEMPLATE_COMPLEXITY_LIMITS: TemplateComplexityLimits = {
  maxPages: 100,
  maxElementsPerPage: 2_000,
  maxTableRowsPerElement: 2_000,
  maxGridRowsPerElement: 2_000,
  maxGridColumnsPerElement: 256,
  maxGridCellsPerElement: 20_000,
  maxAssets: 500,
  maxPdfAssetBytes: IMPORT_LIMITS.pdf,
  maxImageAssetBytes: IMPORT_LIMITS.image,
  maxTotalAssetBytes: 48 * MEBIBYTE,
};

export interface FileSizeSource {
  name: string;
  size: number;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEBIBYTE) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.ceil(bytes / MEBIBYTE)} MB`;
}

export function assertImportFileSize(file: FileSizeSource, kind: ImportFileKind): void {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new LayoutPDFRuntimeError(
      'IMPORT_FILE_EMPTY',
      `${IMPORT_LABELS[kind]}“${file.name}”为空。`,
      { kind: IMPORT_LABELS[kind], name: file.name },
    );
  }
  const limit = IMPORT_LIMITS[kind];
  if (file.size > limit) {
    throw new LayoutPDFRuntimeError(
      'IMPORT_FILE_SIZE_EXCEEDED',
      `${IMPORT_LABELS[kind]}“${file.name}”不能超过 ${formatFileSize(limit)}`
      + `（当前 ${formatFileSize(file.size)}）。`,
      {
        kind: IMPORT_LABELS[kind],
        name: file.name,
        limit: formatFileSize(limit),
        size: formatFileSize(file.size),
      },
    );
  }
}

export function assertTemplateJsonSize(json: string): void {
  const size = new TextEncoder().encode(json).byteLength;
  assertImportFileSize({ name: 'JSON', size }, 'template');
}

export function assertPageCountWithinLimit(pageCount: number, label = 'Document'): void {
  if (pageCount > TEMPLATE_COMPLEXITY_LIMITS.maxPages) {
    throw new LayoutPDFRuntimeError(
      'PAGE_COUNT_EXCEEDS_LIMIT',
      `${label} has ${pageCount} pages; the limit is ${TEMPLATE_COMPLEXITY_LIMITS.maxPages}.`,
      { count: pageCount, limit: TEMPLATE_COMPLEXITY_LIMITS.maxPages, label },
    );
  }
}

export function validateTemplateComplexity(
  file: TemplateFile,
  limits: TemplateComplexityLimits = TEMPLATE_COMPLEXITY_LIMITS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let totalInlineImageBytes = 0;
  if (file.template.pages.length > limits.maxPages) {
    issues.push({
      severity: 'error',
      code: 'PAGE_COUNT_EXCEEDS_LIMIT',
      message: `Template has ${file.template.pages.length} pages; the limit is ${limits.maxPages}.`,
      path: 'template.pages',
    });
  }

  for (const [pageIndex, page] of file.template.pages.entries()) {
    if (page.elements.length > limits.maxElementsPerPage) {
      issues.push({
        severity: 'error',
        code: 'ELEMENT_COUNT_EXCEEDS_LIMIT',
        message: `Page has ${page.elements.length} elements; the limit is ${limits.maxElementsPerPage}.`,
        pageId: page.id,
        path: `template.pages.${pageIndex}.elements`,
      });
    }
    for (const [elementIndex, element] of page.elements.entries()) {
      if (
        element.type === 'table'
        && Array.isArray(element.value)
        && element.value.length > limits.maxTableRowsPerElement
      ) {
        issues.push({
          severity: 'error',
          code: 'TABLE_ROW_COUNT_EXCEEDS_LIMIT',
          message: `Table has ${element.value.length} rows; the limit is ${limits.maxTableRowsPerElement}.`,
          pageId: page.id,
          elementId: element.id,
          path: `template.pages.${pageIndex}.elements.${elementIndex}.value`,
        });
      }
      if (element.type === 'grid' && typeof element.props === 'object' && element.props !== null) {
        const props = element.props as Record<string, unknown>;
        const gridCounts = [
          ['rows', Array.isArray(props.rows) ? props.rows.length : 0, limits.maxGridRowsPerElement, 'GRID_ROW_COUNT_EXCEEDS_LIMIT'],
          ['columns', Array.isArray(props.columns) ? props.columns.length : 0, limits.maxGridColumnsPerElement, 'GRID_COLUMN_COUNT_EXCEEDS_LIMIT'],
          ['cells', typeof props.cells === 'object' && props.cells !== null && !Array.isArray(props.cells)
            ? Object.keys(props.cells).length : 0, limits.maxGridCellsPerElement, 'GRID_CELL_COUNT_EXCEEDS_LIMIT'],
        ] as const;
        for (const [field, count, limit, code] of gridCounts) {
          if (count <= limit) continue;
          issues.push({
            severity: 'error',
            code,
            message: `Grid has ${count} ${field}; the limit is ${limit}.`,
            pageId: page.id,
            elementId: element.id,
            path: `template.pages.${pageIndex}.elements.${elementIndex}.props.${field}`,
          });
        }
      }
      if (
        element.type === 'image'
        && typeof element.value === 'object'
        && element.value !== null
        && !Array.isArray(element.value)
        && element.value.source === 'dataUrl'
        && typeof element.value.dataUrl === 'string'
        && element.value.dataUrl
      ) {
        try {
          const size = getImageDataUrlByteLength(element.value.dataUrl);
          totalInlineImageBytes += size;
          if (size > limits.maxImageAssetBytes) {
            issues.push({
              severity: 'error',
              code: 'INLINE_IMAGE_SIZE_EXCEEDS_LIMIT',
              message: `Inline image is ${formatFileSize(size)}; the limit is ${formatFileSize(limits.maxImageAssetBytes)}.`,
              pageId: page.id,
              elementId: element.id,
              path: `template.pages.${pageIndex}.elements.${elementIndex}.value.dataUrl`,
            });
          }
        } catch {
          // Image source syntax is reported during RenderTree resolution.
        }
      }
    }
  }

  const assets = Object.entries(file.assets);
  if (assets.length > limits.maxAssets) {
    issues.push({
      severity: 'error',
      code: 'ASSET_COUNT_EXCEEDS_LIMIT',
      message: `Template has ${assets.length} assets; the limit is ${limits.maxAssets}.`,
      path: 'assets',
    });
  }

  let totalAssetBytes = totalInlineImageBytes;
  for (const [assetId, asset] of assets) {
    try {
      const size = getBase64AssetByteLength(asset);
      totalAssetBytes += size;
      const assetLimit = asset.kind === 'pdf' ? limits.maxPdfAssetBytes : limits.maxImageAssetBytes;
      if (size > assetLimit) {
        issues.push({
          severity: 'error',
          code: 'ASSET_SIZE_EXCEEDS_LIMIT',
          message: `Asset "${asset.name}" is ${formatFileSize(size)}; the per-asset limit is ${formatFileSize(assetLimit)}.`,
          path: `assets.${assetId}.data`,
        });
      }
    } catch {
      // Base64 syntax errors are reported by the document validator.
    }
  }
  if (totalAssetBytes > limits.maxTotalAssetBytes) {
    issues.push({
      severity: 'error',
      code: 'TOTAL_ASSET_SIZE_EXCEEDS_LIMIT',
      message: `Template assets total ${formatFileSize(totalAssetBytes)}; the limit is ${formatFileSize(limits.maxTotalAssetBytes)}.`,
      path: 'assets',
    });
  }

  return issues;
}
