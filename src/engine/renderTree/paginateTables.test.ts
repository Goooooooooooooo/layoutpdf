import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenderDocument, RenderNode, RenderPage, TableNode, TablePaginationOptions, TableValueRow } from './model.js';
import { paginateTableNode, paginateTables } from './paginateTables.js';
import { defaultFormatSettingsForLocale } from '@/i18n/index.js';
import { pdfPtToMm } from '@/engine/utils/units.js';

const format = defaultFormatSettingsForLocale('ja-JP');

function rows(count: number): TableValueRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row_${index}`, amount: index + 1 }));
}

function table(overrides: Partial<TableNode> = {}): TableNode {
  const sourceRows = rows(5);
  return {
    kind: 'table',
    id: 'el_table:node:table',
    sourceElementId: 'el_table',
    box: { x: 10, y: 70, width: 80, height: 20 },
    rotate: 0,
    opacity: 1,
    clip: true,
    zIndex: 1,
    columns: [
      { id: 'amount', label: '金額', key: 'amount', width: 1, valueType: 'currency', align: 'right' },
    ],
    rows: sourceRows,
    computedRows: sourceRows.map(row => ({ ...row })),
    footers: [
      { id: 'total', label: '合計', formula: { kind: 'expression', expression: 'SUM(column.amount)' } },
    ],
    computedFooters: [{ id: 'total', label: '合計', value: 15, bold: true }],
    layout: { cells: [], lines: [], height: 0 },
    style: {
      headerHeight: 8,
      rowHeight: 7,
      fontSize: 10,
      border: { width: 0.5, color: '#cccccc', style: 'solid' },
      headerBackground: '#eeeeee',
      headerColor: '#000000',
      bodyColor: '#333333',
    },
    ...overrides,
  };
}

function page(nodes: RenderNode[] = [table()]): RenderPage {
  return {
    id: 'page_1',
    sourcePageId: 'page_1',
    continuationIndex: 0,
    size: { width: 100, height: 100 },
    padding: [10, 10, 10, 10],
    background: { kind: 'blank', color: '#ffffff' },
    nodes,
  };
}

function document(nodes: RenderNode[] = [table()]): RenderDocument {
  return { templateId: 'tpl_1', format, pages: [page(nodes)], issues: [] };
}

function pagination(overrides: Partial<TablePaginationOptions> = {}): TablePaginationOptions {
  return {
    finalElementIds: [],
    repeatElementIds: [],
    ignoreElementIds: [],
    rowMode: 'compact',
    minRowsOnLastPage: 1,
    gapAfterTable: 3,
    ...overrides,
  };
}

describe('paginateTableNode', () => {
  it('ignores a decoration that starts above the table when resolving the source-page floor', () => {
    const onlyRow = rows(1);
    const node = table({
      box: { x: 10, y: 60, width: 80, height: 20 },
      rows: onlyRow,
      computedRows: onlyRow.map(row => ({ ...row })),
    });
    const background: RenderNode = {
      kind: 'rect',
      id: 'el_bg:node:rect',
      sourceElementId: 'el_bg',
      box: { x: 5, y: 50, width: 90, height: 30 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 0,
      fill: '#ffffff',
    };
    const result = paginateTableNode(node, page([node, background]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.fragments.length, 1);
    assert.equal(result.fragments[0].pageOffset, 0);
  });

  it('still treats a node that starts below the table top as a floor', () => {
    const onlyRow = rows(1);
    const node = table({
      box: { x: 10, y: 70, width: 80, height: 20 },
      rows: onlyRow,
      computedRows: onlyRow.map(row => ({ ...row })),
    });
    const seal: RenderNode = {
      kind: 'rect',
      id: 'el_seal:node:rect',
      sourceElementId: 'el_seal',
      box: { x: 20, y: 75, width: 20, height: 10 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 2,
      fill: '#ff0000',
    };
    const result = paginateTableNode(node, page([node, seal]));

    assert.equal(result.fragments[0].pageOffset, 1);
  });

  it('honours an explicit pagination opt-out for a floor node', () => {
    const onlyRow = rows(1);
    const node = table({
      box: { x: 10, y: 60, width: 80, height: 20 },
      rows: onlyRow,
      computedRows: onlyRow.map(row => ({ ...row })),
      pagination: pagination({ ignoreElementIds: ['el_seal'] }),
    });
    const seal: RenderNode = {
      kind: 'rect',
      id: 'el_seal:node:rect',
      sourceElementId: 'el_seal',
      box: { x: 20, y: 75, width: 20, height: 10 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 2,
      fill: '#ff0000',
    };
    const result = paginateTableNode(node, page([node, seal]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.fragments[0].pageOffset, 0);
  });

  it('repeats the header, keeps rows atomic, and includes footer only on the final fragment', () => {
    const result = paginateTableNode(table(), page());
    assert.equal(result.issues.length, 0);
    assert.equal(result.fragments.length, 2);
    assert.deepEqual(result.fragments.map(fragment => fragment.node.fragment), [
      { rowStart: 0, rowEnd: 1, repeatHeader: true, includeFooter: false },
      { rowStart: 1, rowEnd: 5, repeatHeader: true, includeFooter: true },
    ]);
    assert.equal(result.fragments[0].node.box.y, 70);
    assert.equal(result.fragments[1].node.box.y, 10);
  });

  it('starts on the next page when the first page cannot fit header and one row', () => {
    const node = table({ box: { x: 10, y: 80, width: 80, height: 10 } });
    const result = paginateTableNode(node, page([node]));
    assert.equal(result.fragments.length, 1);
    assert.equal(result.fragments[0].pageOffset, 1);
    assert.deepEqual(result.fragments[0].node.fragment, {
      rowStart: 0,
      rowEnd: 5,
      repeatHeader: true,
      includeFooter: true,
    });
  });

  it('moves the only row to the next page when the source fits the row but not the footer', () => {
    const onlyRow = rows(1);
    const node = table({
      box: { x: 10, y: 75, width: 80, height: 15 },
      rows: onlyRow,
      computedRows: onlyRow.map(row => ({ ...row })),
    });
    const result = paginateTableNode(node, page([node]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.fragments.length, 1);
    assert.equal(result.fragments[0].pageOffset, 1);
    assert.deepEqual(result.fragments[0].node.fragment, {
      rowStart: 0,
      rowEnd: 1,
      repeatHeader: true,
      includeFooter: true,
    });
  });

  it('keeps a row that only fits the source slot on the source page', () => {
    const sourceRows = [
      { id: 'row_tall', amount: 1 },
      { id: 'row_next', amount: 2 },
      { id: 'row_last', amount: 3 },
    ];
    const node = table({
      box: { x: 10, y: 35, width: 80, height: 20 },
      rows: sourceRows,
      computedRows: sourceRows.map(row => ({ ...row })),
      rowHeights: [40, 7, 7],
      continuationTitleHeight: 50,
      pagination: pagination({ continuation: { title: 'Continued' } }),
    });
    const result = paginateTableNode(node, page([node]));

    assert.equal(result.issues.length, 0);
    assert.deepEqual(
      result.fragments.map(fragment => [
        fragment.pageOffset,
        fragment.node.fragment?.rowStart,
        fragment.node.fragment?.rowEnd,
      ]),
      [[0, 0, 2], [1, 2, 3]],
    );
  });

  it('reports a row that cannot fit on a continuation page', () => {
    const node = table({ style: { ...table().style, rowHeight: 80 } });
    const result = paginateTableNode(node, page([node]));
    assert.equal(result.fragments.length, 0);
    assert.equal(result.issues[0].code, 'TABLE_ROW_TOO_TALL');
    assert.equal(result.issues[0].elementId, 'el_table');
  });

  it('paginates with measured row heights instead of multiplying the minimum row height', () => {
    const node = table({
      box: { x: 10, y: 20, width: 80, height: 20 },
      rowHeights: [30, 7, 7, 7, 7],
    });
    const result = paginateTableNode(node, page([node]));

    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.fragments.map(fragment => fragment.node.fragment), [
      { rowStart: 0, rowEnd: 4, repeatHeader: true, includeFooter: false },
      { rowStart: 4, rowEnd: 5, repeatHeader: true, includeFooter: true },
    ]);
    assert.equal(result.fragments[0].node.box.height, 8 + 30 + 7 + 7 + 7);
  });

  it('reports a measured row that is taller than every continuation slot', () => {
    const node = table({ rowHeights: [73, 7, 7, 7, 7] });
    const result = paginateTableNode(node, page([node]));

    assert.equal(result.fragments.length, 0);
    assert.equal(result.issues[0].code, 'TABLE_ROW_TOO_TALL');
  });

  it('grows the final fragment for an explicitly larger footer font', () => {
    const base = table({
      box: { x: 10, y: 30, width: 80, height: 20 },
      computedFooters: [{ id: 'total', label: '合計', value: 15, bold: true, fontSize: 10 }],
    });
    const big = table({
      box: { x: 10, y: 30, width: 80, height: 20 },
      computedFooters: [{ id: 'total', label: '合計', value: 15, bold: true, fontSize: 40 }],
    });

    const baseResult = paginateTableNode(base, page([base]));
    const bigResult = paginateTableNode(big, page([big]));

    assert.equal(baseResult.fragments.length, 1);
    assert.equal(baseResult.fragments[0].pageOffset, 0);
    assert.equal(bigResult.fragments.length, 2);
    assert.equal(bigResult.fragments.at(-1)?.pageOffset, 1);
    const bigHeight = bigResult.fragments.at(-1)!.node.box.height;
    assert.ok(bigHeight > 8 + 7 + pdfPtToMm(40 * 1.2));
  });

  it('uses the two-row footer band height without changing row pagination rules', () => {
    const node = table({
      footerBand: {
        enabled: true,
        label: '合計',
        leadWidth: 1,
        headerHeight: 4,
        valueHeight: 6,
        items: [{ footerId: 'total', width: 2 }],
      },
    });
    const result = paginateTableNode(node, page([node]));
    const final = result.fragments.at(-1)?.node;
    assert.ok(final);
    assert.equal(final.box.height, 8 + 4 * 7 + 10);
  });

  it('excludes inline footer height while retaining computed footer values', () => {
    const node = table({ showInlineFooter: false });
    const result = paginateTableNode(node, page([node]));
    const final = result.fragments.at(-1)?.node;
    assert.ok(final);
    const rowCount = (final.fragment?.rowEnd ?? 0) - (final.fragment?.rowStart ?? 0);
    assert.equal(final.box.height, node.style.headerHeight + rowCount * node.style.rowHeight);
    assert.equal(final.computedFooters[0].value, 15);
  });
});

describe('paginateTables', () => {
  it('creates continuation pages containing only the table fragment', () => {
    const sourceTable = table();
    const rect = {
      kind: 'rect' as const,
      id: 'el_rect:node:rect',
      sourceElementId: 'el_rect',
      box: { x: 1, y: 1, width: 5, height: 5 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 0,
      fill: '#000000',
    };
    const input = document([rect, sourceTable]);
    const before = structuredClone(input);
    const result = paginateTables(input);

    assert.equal(result.pages.length, 2);
    assert.deepEqual(result.pages[0].nodes.map(node => node.kind), ['rect', 'table']);
    assert.deepEqual(result.pages[1].nodes.map(node => node.kind), ['table']);
    assert.equal(result.pages[1].id, 'page_1:continuation:1');
    assert.equal(result.pages[1].continuationIndex, 1);
    assert.deepEqual(result.pages[1].background, input.pages[0].background);
    assert.deepEqual(input, before);
  });

  it('places a numbered title above every continuation fragment', () => {
    const sourceTable = table({
      pagination: pagination({
        continuation: { title: '明细续表', showFragmentIndex: true },
      }),
    });
    const result = paginateTables(document([sourceTable]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.pages.length, 2);
    const [title, continuedTable] = result.pages[1].nodes;
    assert.equal(title.kind, 'text');
    assert.equal(title.kind === 'text' && title.runtimeRole, 'table-continuation-title');
    assert.equal(title.kind === 'text' && title.text, '明细续表 2');
    assert.equal(continuedTable.kind, 'table');
    assert.ok(continuedTable.box.y >= title.box.y + title.box.height);
  });

  it('numbers the first fragment as one when the whole table moves to a continuation page', () => {
    const sourceTable = table({
      box: { x: 10, y: 80, width: 80, height: 10 },
      pagination: pagination({
        continuation: { title: 'Details continued', showFragmentIndex: true },
      }),
    });
    const result = paginateTables(document([sourceTable]));

    const title = result.pages[1].nodes[0];
    assert.equal(title.kind === 'text' && title.text, 'Details continued 1');
  });

  it('reports when repeated content and a title leave no room for one table row', () => {
    const sourceTable = table({
      pagination: pagination({
        repeatElementIds: ['el_header'],
        continuation: { title: '明细续表' },
      }),
    });
    const repeatedHeader = {
      kind: 'rect' as const,
      id: 'el_header:node:rect',
      sourceElementId: 'el_header',
      box: { x: 10, y: 10, width: 80, height: 55 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 0,
      fill: '#000000',
    };
    const result = paginateTables(document([repeatedHeader, sourceTable]));

    assert.equal(result.pages.length, 1);
    assert.ok(result.issues.some(issue => issue.code === 'TABLE_CONTINUATION_DECORATION_TOO_TALL'));
  });

  it('removes the source table when all rows start on a continuation page', () => {
    const sourceTable = table({ box: { x: 10, y: 80, width: 80, height: 10 } });
    const result = paginateTables(document([sourceTable]));
    assert.deepEqual(result.pages[0].nodes, []);
    assert.equal(result.pages[1].nodes[0].kind, 'table');
  });

  it('rejects multiple dynamic tables on one source page', () => {
    const first = table();
    const second = table({
      id: 'el_table_2:node:table',
      sourceElementId: 'el_table_2',
      box: { x: 10, y: 70, width: 80, height: 20 },
    });
    const result = paginateTables(document([first, second]));
    assert.equal(result.pages.length, 1);
    assert.ok(result.issues.some(issue => issue.code === 'MULTIPLE_DYNAMIC_TABLES_ON_PAGE_UNSUPPORTED'));
  });

  it('does not paginate an already laid-out document again', () => {
    const first = paginateTables(document());
    assert.deepEqual(paginateTables(first), first);
  });

  it('treats another table below as a fixed obstacle instead of overlapping it', () => {
    const first = table({ box: { x: 10, y: 20, width: 80, height: 20 } });
    const second = table({
      id: 'el_table_2:node:table',
      sourceElementId: 'el_table_2',
      box: { x: 10, y: 60, width: 80, height: 10 },
      rows: [],
      computedRows: [],
      computedFooters: [],
    });
    const result = paginateTables(document([first, second]));

    assert.equal(result.pages.length, 2);
    assert.ok(!result.issues.some(issue => issue.code === 'MULTIPLE_DYNAMIC_TABLES_ON_PAGE_UNSUPPORTED'));
    const firstFragment = result.pages[0].nodes.find(node => node.sourceElementId === first.sourceElementId);
    assert.ok(firstFragment);
    assert.ok(firstFragment.box.y + firstFragment.box.height <= second.box.y - 3 + 0.001);
  });
});

describe('paginateTables grouping', () => {
  function groupRect(id: string, y: number, height = 6): RenderNode {
    return {
      kind: 'rect',
      id: `${id}:node:rect`,
      sourceElementId: id,
      box: { x: 10, y, width: 40, height },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 0,
      fill: '#000000',
    };
  }

  it('moves a followed final group to the last continuation page below the table', () => {
    const sourceTable = table({ pagination: pagination({ finalElementIds: ['el_group'] }) });
    const group = groupRect('el_group', 90);
    const result = paginateTables(document([sourceTable, group]));

    assert.equal(result.pages.length, 2);
    assert.deepEqual(result.pages[0].nodes.map(node => node.kind), ['table']);
    assert.deepEqual(result.pages[1].nodes.map(node => node.kind), ['table', 'rect']);
    const anchor = result.pages[1].nodes[0];
    const rect = result.pages[1].nodes[1];
    if (anchor.kind === 'table' && rect.kind === 'rect') {
      assert.ok(rect.box.y >= anchor.box.y + anchor.box.height);
    }
  });

  it('preserves the designer-dragged gap on the last continuation page', () => {
    const sourceTable = table({
      box: { x: 10, y: 70, width: 80, height: 10 },
      pagination: pagination({ finalElementIds: ['el_group'], gapAfterTable: 3 }),
    });
    // The designed gap is 8mm: group top 88 - table design bottom 80.
    const group = groupRect('el_group', 88);
    const result = paginateTables(document([sourceTable, group]));

    assert.equal(result.pages.length, 2);
    const continuation = result.pages[1];
    const anchor = continuation.nodes.find(node => node.kind === 'table');
    const rect = continuation.nodes.find(node => node.sourceElementId === 'el_group');
    assert.ok(anchor?.kind === 'table');
    assert.ok(rect?.kind === 'rect');
    assert.equal(rect.box.y, anchor.box.y + anchor.box.height + 8);
  });

  it('re-anchors a group below a static table on the source page', () => {
    const sourceTable = table({
      box: { x: 10, y: 55, width: 80, height: 10 },
      rows: rows(1),
      computedRows: rows(1).map(row => ({ ...row })),
      pagination: pagination({ finalElementIds: ['el_group'] }),
    });
    const group = groupRect('el_group', 70);
    const result = paginateTables(document([sourceTable, group]));

    assert.equal(result.pages.length, 1);
    const rect = result.pages[0].nodes[1];
    // The 5mm gap the designer set between the table bottom (55 + 10) and the
    // followed block (70) is preserved after the table grows to its data-driven
    // height (55 + 22).
    assert.equal(rect.kind === 'rect' && rect.box.y, 55 + 22 + (70 - (55 + 10)));
  });

  it('preserves the designer-dragged gap over the gapAfterTable setting for a static table', () => {
    const sourceTable = table({
      box: { x: 10, y: 20, width: 80, height: 10 },
      rows: rows(1),
      computedRows: rows(1).map(row => ({ ...row })),
      pagination: pagination({ finalElementIds: ['el_group'], gapAfterTable: 3 }),
    });
    // The user dragged the followed block to sit 6mm below the table design box.
    const group = groupRect('el_group', 36);
    const result = paginateTables(document([sourceTable, group]));

    assert.equal(result.pages.length, 1);
    const rect = result.pages[0].nodes[1];
    // The dragged 6mm gap wins over the 3mm minimum gapAfterTable configuration.
    assert.equal(rect.kind === 'rect' && rect.box.y, 20 + 22 + 6);
  });

  it('respects gapAfterTable as the minimum safe spacing when the dragged gap is narrower', () => {
    const sourceTable = table({
      box: { x: 10, y: 20, width: 80, height: 10 },
      rows: rows(1),
      computedRows: rows(1).map(row => ({ ...row })),
      pagination: pagination({ finalElementIds: ['el_group'], gapAfterTable: 30 }),
    });
    // The user dragged the followed block only 2mm below the table design box.
    const group = groupRect('el_group', 32);
    const result = paginateTables(document([sourceTable, group]));

    assert.equal(result.pages.length, 1);
    const rect = result.pages[0].nodes[1];
    // The configured 30mm minimum still wins over the narrower dragged gap.
    assert.equal(rect.kind === 'rect' && rect.box.y, 20 + 22 + 30);
  });

  it('reports TABLE_FINAL_GROUP_TOO_TALL when the followed group cannot fit a continuation page', () => {
    const sourceTable = table({ pagination: pagination({ finalElementIds: ['el_group'] }) });
    const group = groupRect('el_group', 90, 120);
    const result = paginateTables(document([sourceTable, group]));

    assert.equal(result.pages.length, 1);
    assert.ok(result.issues.some(issue => issue.code === 'TABLE_FINAL_GROUP_TOO_TALL'));
  });

  it('moves a followed group as a rigid block preserving side-by-side member layout', () => {
    const sourceTable = table({ pagination: pagination({ finalElementIds: ['el_group'] }) });
    const left = groupRect('el_group', 90);
    const right = {
      ...groupRect('el_group', 90),
      id: 'el_group:node:rect:right',
      box: { x: 60, y: 90, width: 40, height: 6 },
    };
    const result = paginateTables(document([sourceTable, left, right]));

    assert.equal(result.pages.length, 2);
    const rects = result.pages[1].nodes.filter(node => node.kind === 'rect');
    assert.equal(rects.length, 2);
    const leftRect = rects.find(node => node.id === 'el_group:node:rect');
    const rightRect = rects.find(node => node.id === 'el_group:node:rect:right');
    if (leftRect && rightRect) {
      assert.equal(leftRect.box.x, 10);
      assert.equal(rightRect.box.x, 60);
      assert.equal(leftRect.box.y, rightRect.box.y);
    }
  });

  it('uses the final group footprint when avoiding fixed source-page controls', () => {
    const sourceTable = table({
      box: { x: 10, y: 20, width: 30, height: 20 },
      pagination: pagination({ finalElementIds: ['el_final'] }),
    });
    const final = {
      ...groupRect('el_final', 80),
      box: { x: 60, y: 80, width: 30, height: 6 },
    };
    const sideControl = {
      ...groupRect('el_side', 75),
      box: { x: 70, y: 75, width: 20, height: 10 },
    };
    const result = paginateTables(document([sourceTable, final, sideControl]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].nodes.some(node => node.sourceElementId === final.sourceElementId), false);
    assert.equal(result.pages[1].nodes.some(node => node.sourceElementId === final.sourceElementId), true);
  });

  it('fills blank rows on the source fragment when rowMode is preserve', () => {
    const sourceTable = table({
      box: { x: 10, y: 40, width: 80, height: 40 },
      rows: rows(2),
      computedRows: rows(2).map(row => ({ ...row })),
      pagination: pagination({ rowMode: 'preserve' }),
    });
    const result = paginateTableNode(sourceTable, page([sourceTable]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.fragments.length, 1);
    assert.equal(result.fragments[0].node.fragment?.fillRows, 1);
  });

  it('clones repeated nodes into every continuation page', () => {
    const sourceTable = table({ pagination: pagination({
      finalElementIds: ['el_group'],
      repeatElementIds: ['el_footer'],
    }) });
    const group = groupRect('el_group', 90);
    const footer = {
      kind: 'rect' as const,
      id: 'el_footer:node:rect',
      sourceElementId: 'el_footer',
      box: { x: 10, y: 90, width: 80, height: 5 },
      rotate: 0,
      opacity: 1,
      clip: false,
      zIndex: 0,
      fill: '#000000',
    };
    const result = paginateTables(document([sourceTable, footer, group]));

    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].nodes.find(node => node.id === 'el_footer:node:rect')?.kind, 'rect');
    const continued = result.pages[1].nodes.find(node => node.id === 'el_footer:node:rect:continuation:1');
    assert.equal(continued?.kind, 'rect');
  });

  it('ignores continuation-page constraints while the actual data still fits the source page', () => {
    const sourceTable = table({
      box: { x: 10, y: 50, width: 80, height: 20 },
      rows: rows(3),
      computedRows: rows(3).map(row => ({ ...row })),
      pagination: pagination({ repeatElementIds: ['el_header'], gapAfterTable: 10 }),
    });
    const repeatedHeader = groupRect('el_header', 40, 10);
    const result = paginateTables(document([repeatedHeader, sourceTable]));

    assert.equal(result.issues.length, 0);
    assert.equal(result.pages.length, 1);
  });

  it('reports a repeated element placed inside the table flow only when overflow needs a continuation page', () => {
    const sourceTable = table({ pagination: pagination({ repeatElementIds: ['el_middle'] }) });
    const repeatedMiddle = groupRect('el_middle', 75, 5);
    const result = paginateTables(document([sourceTable, repeatedMiddle]));

    assert.equal(result.pages.length, 1);
    assert.ok(result.issues.some(issue => issue.code === 'CONTINUATION_REPEAT_REGION_INVALID'));
  });
});
