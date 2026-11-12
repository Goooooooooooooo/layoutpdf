import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile, type TemplateElement } from '../core/document.js';
import {
  assertImportFileSize,
  assertPageCountWithinLimit,
  formatFileSize,
  validateTemplateComplexity,
  type TemplateComplexityLimits,
} from './limits.js';

const smallLimits: TemplateComplexityLimits = {
  maxPages: 1,
  maxElementsPerPage: 1,
  maxTableRowsPerElement: 1,
  maxGridRowsPerElement: 1,
  maxGridColumnsPerElement: 1,
  maxGridCellsPerElement: 1,
  maxAssets: 1,
  maxPdfAssetBytes: 2,
  maxImageAssetBytes: 2,
  maxTotalAssetBytes: 3,
};

function tableElement(id: string, rowCount: number): TemplateElement {
  return {
    id,
    type: 'table',
    name: 'Table',
    box: { x: 0, y: 0, width: 100, height: 50 },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value: Array.from({ length: rowCount }, (_, index) => ({ id: `row_${index}` })),
    props: {},
  };
}

describe('import and template limits', () => {
  it('rejects empty and oversized import files with readable sizes', () => {
    assert.throws(() => assertImportFileSize({ name: 'empty.pdf', size: 0 }, 'pdf'), /为空/);
    assert.throws(
      () => assertImportFileSize({ name: 'large.png', size: 11 * 1024 * 1024 }, 'image'),
      /不能超过 10 MB.*当前 11 MB/,
    );
    assert.doesNotThrow(() => assertImportFileSize({ name: 'logo.png', size: 1024 }, 'image'));
    assert.equal(formatFileSize(1025), '2 KB');
    assert.doesNotThrow(() => assertPageCountWithinLimit(100, 'PDF'));
    assert.throws(() => assertPageCountWithinLimit(101, 'PDF'), /PDF has 101 pages; the limit is 100/);
  });

  it('reports page, element, table row, and asset complexity independently', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const inlineImage = {
      ...tableElement('image_1', 0),
      type: 'image',
      value: { source: 'dataUrl', dataUrl: 'data:image/png;base64,AQID' },
    };
    const grid = {
      ...tableElement('grid_1', 0),
      type: 'grid',
      props: {
        rows: [{ id: 'r1' }, { id: 'r2' }],
        columns: [{ id: 'c1' }, { id: 'c2' }],
        cells: { a: {}, b: {} },
      },
    };
    file.template.pages[0].elements.push(tableElement('table_1', 2), inlineImage, grid);
    file.template.pages.push({ ...structuredClone(file.template.pages[0]), id: 'page_2', elements: [] });
    file.assets.asset_1 = {
      kind: 'image',
      name: 'one.png',
      mimeType: 'image/png',
      dataEncoding: 'base64',
      data: 'AQID',
    };
    file.assets.asset_2 = {
      kind: 'image',
      name: 'two.png',
      mimeType: 'image/png',
      dataEncoding: 'base64',
      data: 'AQ==',
    };

    const codes = validateTemplateComplexity(file, smallLimits).map(issue => issue.code);
    assert.ok(codes.includes('PAGE_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('ELEMENT_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('TABLE_ROW_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('GRID_ROW_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('GRID_COLUMN_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('GRID_CELL_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('ASSET_COUNT_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('ASSET_SIZE_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('INLINE_IMAGE_SIZE_EXCEEDS_LIMIT'));
    assert.ok(codes.includes('TOTAL_ASSET_SIZE_EXCEEDS_LIMIT'));
  });
});
