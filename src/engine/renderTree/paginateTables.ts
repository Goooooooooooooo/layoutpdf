import type { RenderIssue } from '@/engine/utils/errors.js';
import type {
  RenderDocument,
  RenderNode,
  RenderPage,
  TableNode,
  TablePaginationOptions,
  TextNode,
} from '@/engine/renderTree/model.js';
import { normalizeTablePaginationOptions } from '@/engine/renderTree/tablePaginationOptions.js';
import { pdfPtToMm } from '@/engine/utils/units.js';

export interface TableFragment {
  pageOffset: number;
  node: TableNode;
  continuationTitle?: TextNode;
}

const EPSILON_MM = 0.001;
function fits(required: number, available: number): boolean {
  return required <= available + EPSILON_MM;
}

export function resolveTablePagination(node: TableNode): TablePaginationOptions {
  return normalizeTablePaginationOptions(node.pagination);
}

function footerHeight(node: TableNode): number {
  if (node.showInlineFooter === false) return 0;
  if (node.footerBand?.enabled) {
    return node.footerBand.headerHeight + node.footerBand.valueHeight;
  }
  return node.computedFooters.length * node.style.rowHeight;
}

function rowHeightAt(node: TableNode, rowIndex: number): number {
  return node.rowHeights?.[rowIndex] ?? node.style.rowHeight;
}

function rowsHeight(node: TableNode, rowStart: number, rowEnd: number): number {
  let height = 0;
  for (let index = rowStart; index < rowEnd; index++) height += rowHeightAt(node, index);
  return height;
}

function fragmentHeight(
  node: TableNode,
  rowStart: number,
  rowEnd: number,
  includeFooter: boolean,
  fillRows = 0,
): number {
  return node.style.headerHeight
    + rowsHeight(node, rowStart, rowEnd)
    + (includeFooter ? footerHeight(node) : 0)
    + fillRows * node.style.rowHeight;
}

function horizontalOverlap(a: RenderNode, b: RenderNode): boolean {
  return a.box.x < b.box.x + b.box.width - EPSILON_MM
    && b.box.x < a.box.x + a.box.width - EPSILON_MM;
}

function horizontalOverlapAny(node: RenderNode, flowNodes: readonly RenderNode[]): boolean {
  return flowNodes.some(flowNode => horizontalOverlap(node, flowNode));
}

function fragmentNode(
  node: TableNode,
  pageOffset: number,
  rowStart: number,
  rowEnd: number,
  y: number,
  includeFooter: boolean,
  includeFinalGroup: boolean,
  fillRows = 0,
): TableNode {
  const height = fragmentHeight(node, rowStart, rowEnd, includeFooter, fillRows);
  return {
    ...node,
    id: `${node.id}:fragment:${pageOffset}`,
    box: { ...node.box, y, height },
    fragment: {
      rowStart,
      rowEnd,
      repeatHeader: true,
      includeFooter,
      ...(includeFinalGroup ? { includeFinalGroup: true } : {}),
      ...(fillRows > 0 ? { fillRows } : {}),
    },
  };
}

interface ContinuationTitleMetrics {
  text: string;
  height: number;
  gap: number;
}

function continuationTitleMetrics(
  node: TableNode,
  options: TablePaginationOptions,
): ContinuationTitleMetrics | undefined {
  const text = options.continuation?.title?.trim();
  if (!text) return undefined;
  const padding = Math.max(0, node.style.cellPadding ?? 1.5);
  return {
    text,
    height: node.continuationTitleHeight
      ?? Math.max(node.style.rowHeight, pdfPtToMm(node.style.fontSize * 1.2) + padding * 2),
    gap: padding,
  };
}

function createContinuationTitleNode(
  node: TableNode,
  options: TablePaginationOptions,
  metrics: ContinuationTitleMetrics,
  pageOffset: number,
  fragmentIndex: number,
  y: number,
): TextNode {
  const text = options.continuation?.showFragmentIndex
    ? `${metrics.text} ${fragmentIndex}`
    : metrics.text;
  const padding = Math.max(0, node.style.cellPadding ?? 1.5);
  return {
    kind: 'text',
    runtimeRole: 'table-continuation-title',
    id: `${node.id}:continuation-title:${pageOffset}`,
    sourceElementId: node.sourceElementId,
    box: { x: node.box.x, y, width: node.box.width, height: metrics.height },
    rotate: 0,
    opacity: node.opacity,
    clip: true,
    zIndex: node.zIndex,
    text,
    style: {
      fontSize: node.style.fontSize,
      color: node.style.bodyColor,
      fontWeight: 'bold',
      align: 'left',
      verticalAlign: 'middle',
      lineHeight: 1.2,
      padding: [padding, 0, padding, 0],
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
  };
}

function tableIssue(node: TableNode, page: RenderPage, code: string, message: string): RenderIssue {
  return {
    severity: 'error',
    code,
    message,
    pageId: page.id,
    elementId: node.sourceElementId,
  };
}

function pageContentBottom(page: RenderPage): number {
  const [, , paddingBottom] = page.padding;
  return page.size.height - paddingBottom;
}

/** Source-page floor the table may grow to before covering a fixed node below it. */
function resolveFixedBottom(
  page: RenderPage,
  table: TableNode,
  flowNodes: readonly RenderNode[],
  excludedIds: ReadonlySet<string>,
  gap: number,
): number {
  let bottom = pageContentBottom(page);
  for (const node of page.nodes) {
    if (node.id === table.id || excludedIds.has(node.id)) continue;
    if (node.box.y + node.box.height <= table.box.y + EPSILON_MM) continue;
    if (!horizontalOverlapAny(node, flowNodes)) continue;
    bottom = Math.min(bottom, node.box.y - gap);
  }
  return bottom;
}

interface Slot {
  top: number;
  bottom: number;
  height: number;
}

/** Continuation-page slot for the table, bounded by repeated header/footer nodes. */
function continuationSlot(
  page: RenderPage,
  table: TableNode,
  flowNodes: readonly RenderNode[],
  repeatNodes: RenderNode[],
  gap: number,
): { ok: true; slot: Slot } | { ok: false; issue: RenderIssue } {
  const [paddingTop] = page.padding;
  const contentBottom = pageContentBottom(page);
  const tableTop = table.box.y;
  const tableBottom = table.box.y + table.box.height;
  const inner = repeatNodes.filter(node => horizontalOverlapAny(node, flowNodes));
  const topSet = inner.filter(node => node.box.y + node.box.height <= tableTop + EPSILON_MM);
  const bottomSet = inner.filter(node => node.box.y >= tableBottom - EPSILON_MM);
  const middle = inner.filter(node => !topSet.includes(node) && !bottomSet.includes(node));
  if (middle.length > 0) {
    return {
      ok: false,
      issue: tableIssue(table, page, 'CONTINUATION_REPEAT_REGION_INVALID', 'A repeated node in the middle of the table flow cannot be repeated on a continuation page.'),
    };
  }
  const top = Math.max(paddingTop, ...topSet.map(node => node.box.y + node.box.height + gap), paddingTop);
  const bottom = Math.min(contentBottom, ...bottomSet.map(node => node.box.y - gap), contentBottom);
  return { ok: true, slot: { top, bottom, height: Math.max(0, bottom - top) } };
}

/** Vertical extent of the group as a rigid block, preserving its designed relative layout. */
function stackedGroupHeight(groupNodes: RenderNode[]): number {
  if (groupNodes.length === 0) return 0;
  const top = Math.min(...groupNodes.map(node => node.box.y));
  const bottom = Math.max(...groupNodes.map(node => node.box.y + node.box.height));
  return bottom - top;
}

/** Group vertical space reserved above the source/continuation bottom. */
function groupExtra(groupNodes: RenderNode[], gap: number): number {
  const block = stackedGroupHeight(groupNodes);
  return block > 0 ? gap + block : 0;
}

interface TablePlan {
  fragments: TableFragment[];
  issues: RenderIssue[];
  options: TablePaginationOptions;
  finalGap: number;
  finalNodes: RenderNode[];
  repeatNodes: RenderNode[];
}

/** Measure + plan a single table: returns fragment slices; never mutates nodes. */
function planTable(root: TableNode, page: RenderPage): TablePlan {
  const opts = resolveTablePagination(root);
  const finalElementIds = new Set(opts.finalElementIds);
  const finalNodes = page.nodes.filter(node =>
    node.sourceElementId !== root.sourceElementId
    && node.kind !== 'table'
    && finalElementIds.has(node.sourceElementId)
  );
  const finalNodeIds = new Set(finalNodes.map(node => node.id));
  const repeatElementIds = new Set(opts.repeatElementIds);
  const repeatNodes = page.nodes.filter(node =>
    node.kind !== 'table'
    && node.sourceElementId !== root.sourceElementId
    && repeatElementIds.has(node.sourceElementId)
    && !finalNodeIds.has(node.id),
  );
  const designedFinalGap = finalNodes.length > 0
    ? Math.max(
        0,
        Math.min(...finalNodes.map(node => node.box.y))
          - (root.box.y + root.box.height),
      )
    : 0;
  const finalGap = Math.max(designedFinalGap, opts.gapAfterTable);
  const finish = (fragments: TableFragment[], issues: RenderIssue[]): TablePlan => ({
    fragments,
    issues,
    options: opts,
    finalGap,
    finalNodes,
    repeatNodes,
  });

  const sourceStart = root.box.y;
  const flowNodes = [root, ...finalNodes];
  const hardBottom = resolveFixedBottom(page, root, flowNodes, finalNodeIds, opts.gapAfterTable);
  const sourceAvail = Math.max(0, hardBottom - sourceStart);
  const finalBlockHeight = stackedGroupHeight(finalNodes);
  const extra = groupExtra(finalNodes, finalGap);

  const header = root.style.headerHeight;
  const rowHeight = root.style.rowHeight;
  const rowCount = root.computedRows.length;
  const footer = footerHeight(root);
  const measuredRowHeights = root.computedRows.map((_, index) => rowHeightAt(root, index));

  if (!(Number.isFinite(rowHeight) && rowHeight > 0
    && Number.isFinite(header) && header >= 0
    && Number.isFinite(footer) && footer >= 0
    && measuredRowHeights.every(height => Number.isFinite(height) && height > 0))) {
    return finish([], [tableIssue(root, page, 'INVALID_TABLE_PAGINATION_METRICS', 'Table pagination metrics are invalid.')]);
  }

  // Pagination is data-driven: continuation constraints matter only when the current data
  // cannot fit the source page together with its final-page block.
  const allRowsHeight = rowsHeight(root, 0, rowCount);
  const whole = header + allRowsHeight + footer + extra;
  if (fits(whole, sourceAvail)) {
    const desiredFillRows = opts.rowMode === 'preserve'
      ? Math.max(0, Math.floor((root.box.height - (header + allRowsHeight + footer)) / rowHeight))
      : 0;
    const availableFillRows = Math.max(0, Math.floor((sourceAvail - whole) / rowHeight));
    const fillRows = Math.min(desiredFillRows, availableFillRows);
    return finish([{
      pageOffset: 0,
      node: fragmentNode(root, 0, 0, rowCount, sourceStart, true, finalBlockHeight > 0, fillRows),
    }], []);
  }

  const slotResult = continuationSlot(page, root, flowNodes, repeatNodes, opts.gapAfterTable);
  if (!slotResult.ok) return finish([], [slotResult.issue]);
  const titleMetrics = continuationTitleMetrics(root, opts);
  const titleExtra = titleMetrics ? titleMetrics.height + titleMetrics.gap : 0;
  const slotH = Math.max(0, slotResult.slot.height - titleExtra);
  const slotTop = slotResult.slot.top + titleExtra;
  const fullContinuationHeight = pageContentBottom(page) - page.padding[0];
  const hasContinuationDecoration = repeatNodes.length > 0 || Boolean(titleMetrics);
  const decorationIssue = (message: string): RenderIssue => tableIssue(
    root,
    page,
    'TABLE_CONTINUATION_DECORATION_TOO_TALL',
    message,
  );
  const finishContinuation = (fragments: TableFragment[], issues: RenderIssue[]): TablePlan => {
    if (!titleMetrics || issues.length > 0) return finish(fragments, issues);
    return finish(fragments.map((fragment, index) => fragment.pageOffset === 0
      ? fragment
      : {
          ...fragment,
          continuationTitle: createContinuationTitleNode(
            root,
            opts,
            titleMetrics,
            fragment.pageOffset,
            index + 1,
            slotResult.slot.top,
          ),
        }), issues);
  };

  // Empty table moves as one unit when the source slot is insufficient.
  if (rowCount === 0) {
    if (fits(whole, slotH)) {
      return finishContinuation([{
        pageOffset: 1,
        node: fragmentNode(root, 1, 0, 0, slotTop, true, finalBlockHeight > 0),
      }], []);
    }
    if (hasContinuationDecoration && fits(whole, fullContinuationHeight)) {
      return finishContinuation([], [decorationIssue('Continuation decorations leave too little room for the table header and footer.')]);
    }
    return finish([], [tableIssue(
      root,
      page,
      finalBlockHeight > 0 ? 'TABLE_FINAL_GROUP_TOO_TALL' : 'TABLE_FOOTER_TOO_TALL',
      'Table header and footer exceed the available content height.',
    )]);
  }

  // Every row is atomic, so each measured row must fit below the repeated header.
  if (measuredRowHeights.some(height => !fits(header + height, slotH))) {
    if (
      hasContinuationDecoration
      && measuredRowHeights.every(height => fits(header + height, fullContinuationHeight))
    ) {
      return finishContinuation([], [decorationIssue('Continuation decorations leave too little room for the table header and one row.')]);
    }
    return finish([], [tableIssue(root, page, 'TABLE_ROW_TOO_TALL', 'Table header and one row exceed the continuation page content height.')]);
  }
  const minFinalRows = Math.min(opts.minRowsOnLastPage, rowCount);
  const minFinalContent = header
    + rowsHeight(root, rowCount - minFinalRows, rowCount)
    + footer
    + extra;
  if (!fits(minFinalContent, slotH)) {
    if (hasContinuationDecoration && fits(minFinalContent, fullContinuationHeight)) {
      return finishContinuation([], [decorationIssue('Continuation decorations leave too little room for the final table fragment.')]);
    }
    return finish([], [tableIssue(root, page, finalBlockHeight > 0 ? 'TABLE_FINAL_GROUP_TOO_TALL' : 'TABLE_FOOTER_TOO_TALL', 'A final fragment with footer cannot fit a continuation page.')]);
  }

  // Paginate across pages: greedy, rows are atomic, footer/group only on the final fragment.
  const fragments: TableFragment[] = [];
  let rowStart = 0;
  let pageOffset = 0;
  while (rowStart < rowCount) {
    const available = pageOffset === 0 ? sourceAvail : slotH;
    const y = pageOffset === 0 ? sourceStart : slotTop;
    const remaining = rowCount - rowStart;
    if (fits(header + rowsHeight(root, rowStart, rowCount) + footer + extra, available)) {
      fragments.push({ pageOffset, node: fragmentNode(root, pageOffset, rowStart, rowCount, y, true, finalBlockHeight > 0) });
      break;
    }
    const minFinal = Math.min(opts.minRowsOnLastPage, remaining);
    const maxBodyEnd = rowCount - minFinal;
    let rowEnd = rowStart;
    let bodyHeight = header;
    while (
      rowEnd < maxBodyEnd
      && fits(bodyHeight + rowHeightAt(root, rowEnd), available)
    ) {
      bodyHeight += rowHeightAt(root, rowEnd);
      rowEnd += 1;
    }
    if (rowEnd === rowStart) {
      pageOffset += 1;
      continue;
    }
    fragments.push({ pageOffset, node: fragmentNode(root, pageOffset, rowStart, rowEnd, y, false, false) });
    rowStart = rowEnd;
    pageOffset += 1;
  }
  return finishContinuation(fragments, []);
}

export interface PaginateTableResult {
  fragments: TableFragment[];
  issues: RenderIssue[];
}

export function paginateTableNode(node: TableNode, page: RenderPage): PaginateTableResult {
  const plan = planTable(node, page);
  return { fragments: plan.fragments, issues: plan.issues };
}

function isDynamic(fragments: TableFragment[]): boolean {
  return fragments.length > 1 || fragments[0]?.pageOffset !== 0;
}

/**
 * Translate the whole group as a rigid block so its top sits at `startTop`, preserving the
 * members' designed relative positions (members may sit side-by-side or staggered).
 */
function placeGroup(groupNodes: RenderNode[], startTop: number): RenderNode[] {
  if (groupNodes.length === 0) return [];
  const groupTop = Math.min(...groupNodes.map(node => node.box.y));
  const dy = startTop - groupTop;
  return groupNodes.map(node => ({
    ...node,
    box: { ...node.box, y: node.box.y + dy },
  }));
}

function cloneRepeat(repeatNodes: RenderNode[], index: number): RenderNode[] {
  return repeatNodes.map(node => ({ ...node, id: `${node.id}:continuation:${index}` }));
}

function continuationPage(source: RenderPage, index: number, nodes: RenderNode[]): RenderPage {
  return {
    id: `${source.sourcePageId}:continuation:${index}`,
    sourcePageId: source.sourcePageId,
    continuationIndex: index,
    size: { ...source.size },
    padding: [...source.padding],
    background: { ...source.background },
    nodes,
  };
}

interface FinalBlockMove {
  nodes: RenderNode[];
  gap: number;
  pageOffset: number; // 0 = source page, >0 = continuation page index
}

function paginatePage(page: RenderPage): { pages: RenderPage[]; issues: RenderIssue[] } {
  const tables = page.nodes.filter((node): node is TableNode => node.kind === 'table');
  if (tables.length === 0) return { pages: [page], issues: [] };

  const plans = new Map<string, TablePlan>();
  for (const table of tables) {
    const plan = planTable(table, page);
    if (plan.issues.length > 0) return { pages: [page], issues: plan.issues };
    plans.set(table.id, plan);
  }

  const dynamic = tables.filter(table => isDynamic(plans.get(table.id)!.fragments));
  if (dynamic.length > 1) {
    return {
      pages: [page],
      issues: [{
        severity: 'error',
        code: 'MULTIPLE_DYNAMIC_TABLES_ON_PAGE_UNSUPPORTED',
        message: 'Only one paginated table is supported on a source page.',
        pageId: page.id,
      }],
    };
  }

  const sourceReplacement = new Map<string, TableNode>();
  const removedTableIds = new Set<string>();
  const continuations = new Map<number, RenderNode[]>();
  const finalBlockMoves: FinalBlockMove[] = [];
  const finalNodeIds = new Set<string>();

  for (const table of tables) {
    const plan = plans.get(table.id)!;
    for (const fragment of plan.fragments) {
      if (fragment.pageOffset === 0) {
        sourceReplacement.set(table.id, fragment.node);
      } else {
        let list = continuations.get(fragment.pageOffset);
        if (!list) { list = []; continuations.set(fragment.pageOffset, list); }
        if (fragment.continuationTitle) list.push(fragment.continuationTitle);
        list.push(fragment.node);
      }
    }
    if (isDynamic(plan.fragments) && !sourceReplacement.has(table.id)) {
      // All rows start on a continuation page: drop the original node from source.
      removedTableIds.add(table.id);
    }

    if (plan.finalNodes.length > 0) {
      if (isDynamic(plan.fragments)) {
        // The explicit final block moves below the final table fragment.
        const lastOffset = Math.max(...plan.fragments.map(fragment => fragment.pageOffset));
        finalBlockMoves.push({
          nodes: plan.finalNodes,
          gap: plan.finalGap,
          pageOffset: lastOffset,
        });
        for (const node of plan.finalNodes) finalNodeIds.add(node.id);
      } else {
        // With the current data fitting one page, preserve the user's designed spacing
        // between the table bottom and the followed block (WYSIWYG). The table's box
        // height is data-driven, so re-anchor the block to the rendered bottom using
        // `max(design gap, gapAfterTable)`: the dragged gap keeps layout, while the
        // configured gap remains the minimum safe spacing.
        const fragment0 = plan.fragments[0].node;
        const gap = plan.finalGap;
        const startTop = fragment0.box.y + fragment0.box.height + gap;
        const repositioned = placeGroup(plan.finalNodes, startTop);
        finalBlockMoves.push({
          nodes: repositioned,
          gap,
          pageOffset: 0,
        });
        for (const node of plan.finalNodes) finalNodeIds.add(node.id);
      }
    }
  }

  // Only the table that actually overflows owns continuation-page decorations.
  const repeatNodes = dynamic.length === 1
    ? plans.get(dynamic[0].id)!.repeatNodes
    : [];

  // Move final blocks into their destination page node lists.
  for (const move of finalBlockMoves) {
    if (move.pageOffset === 0) continue;
    let list = continuations.get(move.pageOffset);
    if (!list) { list = []; continuations.set(move.pageOffset, list); }
    const anchor = list.find(node => node.kind === 'table');
    if (!anchor) continue;
    const startTop = anchor.box.y + anchor.box.height + move.gap;
    list.push(...placeGroup(move.nodes, startTop));
  }

  // Build continuation pages (table fragment + repeated nodes + optional group).
  const pages: RenderPage[] = [];
  const sourceNodes = page.nodes
    .filter(node => !finalNodeIds.has(node.id))
    .filter(node => node.kind !== 'table' || !removedTableIds.has(node.id))
    .map(node => sourceReplacement.get(node.id) ?? node);
  const reanchoredGroups = finalBlockMoves
    .filter(move => move.pageOffset === 0)
    .flatMap(move => move.nodes);
  pages.push({ ...page, nodes: [...sourceNodes, ...reanchoredGroups] });

  for (const [offset, tableFragment] of [...continuations.entries()].sort((a, b) => a[0] - b[0])) {
    const nodes = [...cloneRepeat(repeatNodes, offset), ...tableFragment];
    pages.push(continuationPage(page, offset, nodes));
  }

  return { pages, issues: [] };
}

export function paginateTables(document: RenderDocument): RenderDocument {
  if (
    document.pages.some(page => page.continuationIndex > 0)
    || document.pages.some(page => page.nodes.some(node => node.kind === 'table' && node.fragment))
  ) {
    return document;
  }

  const pages: RenderPage[] = [];
  const issues = [...document.issues];
  for (const page of document.pages) {
    const result = paginatePage(page);
    pages.push(...result.pages);
    issues.push(...result.issues);
  }
  return {
    templateId: document.templateId,
    format: document.format,
    pages,
    issues,
  };
}
