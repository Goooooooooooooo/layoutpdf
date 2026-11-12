import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBlankTemplateFile, type TemplateElement } from './document.js';
import { assertValidTemplateFile, validateTemplateFile } from './validation.js';
import { LayoutPDFValidationError } from '../utils/errors.js';
import { TEMPLATE_COMPLEXITY_LIMITS } from '../utils/limits.js';

function textElement(id: string): TemplateElement {
  return {
    id,
    type: 'text',
    name: 'Text',
    box: { x: 10, y: 10, width: 50, height: 10 },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value: '',
    binding: { key: 'field' },
    props: {},
  };
}

describe('validateTemplateFile', () => {
  it('accepts a valid blank template file', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    assert.deepEqual(validateTemplateFile(file), []);
  });

  it('rejects invalid element geometry and opacity', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.template.pages[0].elements.push({
      ...textElement('el_1'),
      box: { x: 0, y: 0, width: 0, height: -1 },
      opacity: 2,
    });

    const issues = validateTemplateFile(file);
    assert.ok(issues.some(issue => issue.path?.endsWith('box.width')));
    assert.ok(issues.some(issue => issue.path?.endsWith('box.height')));
    assert.ok(issues.some(issue => issue.path?.endsWith('opacity')));
  });

  it('rejects duplicate element ids across pages', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const firstPage = file.template.pages[0];
    firstPage.elements.push(textElement('el_duplicate'));
    file.template.pages.push({
      ...firstPage,
      id: 'page_2',
      elements: [textElement('el_duplicate')],
    });

    const issues = validateTemplateFile(file);
    assert.ok(issues.some(issue => issue.code === 'DUPLICATE_ELEMENT_ID'));
  });

  it('accepts same-page groups and rejects singleton or cross-page groups', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const firstPage = file.template.pages[0];
    firstPage.elements.push(
      { ...textElement('el_1'), groupId: 'group_valid' },
      { ...textElement('el_2'), groupId: 'group_valid' },
      { ...textElement('el_3'), groupId: 'group_single' },
    );
    file.template.pages.push({
      ...structuredClone(firstPage),
      id: 'page_2',
      elements: [
        { ...textElement('el_4'), groupId: 'group_cross' },
        { ...textElement('el_5'), groupId: 'group_cross' },
        { ...textElement('el_6'), groupId: 'group_valid' },
      ],
    });

    const issues = validateTemplateFile(file);
    assert.ok(issues.some(issue => issue.code === 'ELEMENT_GROUP_REQUIRES_MULTIPLE_MEMBERS'));
    assert.ok(issues.some(issue => issue.code === 'ELEMENT_GROUP_SPANS_PAGES'));
    assert.ok(!issues.some(issue =>
      issue.code === 'ELEMENT_GROUP_REQUIRES_MULTIPLE_MEMBERS'
      && issue.message.includes('group_valid')
      && issue.pageId === firstPage.id
    ));
  });

  it('rejects duplicate and cross-page summary output references', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const firstPage = file.template.pages[0];
    const table = {
      ...textElement('table_1'),
      type: 'table',
      props: {
        footers: [{ id: 'footer_1' }],
      },
    };
    firstPage.elements.push(table);
    file.template.pages.push({
      ...structuredClone(firstPage),
      id: 'page_2',
      elements: [{
        ...textElement('summary_1'),
        type: 'summary',
        props: {
          items: [
            {
              id: 'item_1',
              source: { sourceElementId: table.id, outputId: 'footer_1' },
            },
            {
              id: 'item_2',
              source: { sourceElementId: table.id, outputId: 'footer_1' },
            },
          ],
        },
      }],
    });

    const issues = validateTemplateFile(file);
    assert.ok(issues.some(issue => issue.code === 'DUPLICATE_ELEMENT_OUTPUT_REFERENCE'));
    assert.ok(issues.some(issue => issue.code === 'INVALID_ELEMENT_OUTPUT_SOURCE'));
  });

  it('validates table-owned pagination references independently of editor groups', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    const page = file.template.pages[0];
    const final = textElement('el_final');
    const anotherTable = {
      ...textElement('table_2'),
      type: 'table',
    };
    const firstTable = {
      ...textElement('table_1'),
      type: 'table',
      props: {
        pagination: {
          finalElementIds: [final.id, final.id],
          repeatElementIds: [final.id, 'table_2'],
        },
      },
    };
    const secondTable = {
      ...anotherTable,
      props: {
        pagination: {
          finalElementIds: [final.id, 'missing'],
          repeatElementIds: ['table_2'],
        },
      },
    };
    page.elements.push(firstTable, secondTable, final);

    const issues = validateTemplateFile(file).filter(issue =>
      issue.code === 'INVALID_TABLE_PAGINATION_REFERENCE'
    );
    assert.ok(issues.some(issue => issue.elementId === firstTable.id));
    assert.ok(issues.some(issue => issue.elementId === firstTable.id && issue.message.includes('duplicate')));
    assert.ok(issues.some(issue => issue.elementId === firstTable.id && issue.message.includes('both final-page')));
    assert.ok(issues.some(issue => issue.elementId === secondTable.id && issue.message.includes('same page')));
    assert.ok(issues.some(issue => issue.elementId === secondTable.id && issue.message.includes('only one table')));
  });

  it('rejects missing and non-PDF background assets', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.template.pages[0].background = { kind: 'pdf', assetId: 'asset_bg', pageIndex: 0 };

    assert.ok(validateTemplateFile(file).some(issue => issue.code === 'MISSING_BACKGROUND_ASSET'));

    file.assets.asset_bg = {
      kind: 'image',
      name: 'background.png',
      mimeType: 'image/png',
      dataEncoding: 'base64',
      data: 'AA==',
    };
    assert.ok(validateTemplateFile(file).some(issue => issue.code === 'INVALID_BACKGROUND_ASSET_TYPE'));
  });

  it('rejects page padding that leaves no content area', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.template.pages[0].padding = [10, 105, 10, 105];
    assert.ok(validateTemplateFile(file).some(issue => issue.code === 'PAGE_PADDING_EXCEEDS_SIZE'));
  });

  it('throws a structured validation error at strict boundaries', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.template.pages[0].elements.push({ ...textElement('el_1'), opacity: 10 });

    assert.throws(
      () => assertValidTemplateFile(file),
      (error: unknown) => error instanceof LayoutPDFValidationError && error.issues.length > 0,
    );
  });

  it('rejects malformed base64 asset data at the TemplateFile boundary', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.assets.asset_1 = {
      kind: 'image',
      name: 'broken.png',
      mimeType: 'image/png',
      dataEncoding: 'base64',
      data: 'not-base64',
    };
    const issues = validateTemplateFile(file);
    assert.ok(issues.some(issue =>
      issue.code === 'INVALID_ASSET_DATA' && issue.path === 'assets.asset_1.data'
    ));
  });

  it('enforces complexity limits at the TemplateFile boundary', () => {
    const file = createBlankTemplateFile({ idGenerator: prefix => `${prefix}_1` });
    file.template.pages[0].elements.push({
      ...textElement('table_1'),
      type: 'table',
      value: Array.from(
        { length: TEMPLATE_COMPLEXITY_LIMITS.maxTableRowsPerElement + 1 },
        (_, index) => ({ id: `row_${index}` }),
      ),
    });

    assert.ok(validateTemplateFile(file).some(issue =>
      issue.code === 'TABLE_ROW_COUNT_EXCEEDS_LIMIT' && issue.elementId === 'table_1'
    ));
  });
});
