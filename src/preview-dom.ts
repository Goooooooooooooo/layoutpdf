import type { JsonValue } from '@/engine/core/document.js';
import type { DomPluginRenderContext } from '@/engine/core/plugin.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import type {
  EllipseNode,
  GridNode,
  ImageNode,
  LineNode,
  PluginNode,
  RectNode,
  RenderDocument,
  RenderNode,
  RenderPage,
  TableNode,
  TextNode,
} from '@/engine/renderTree/model.js';
import { DEFAULT_TABLE_CELL_PADDING_MM } from '@/engine/renderTree/tablePresentation.js';
import { SYNTHETIC_BOLD_OFFSET_PT } from '@/engine/renderTree/textWeight.js';
import { updateTableCell } from '@/editor/utils/tableInput.js';
import { mmToCssPx, ptToCssPx } from '@/engine/utils/units.js';

export type DomPreviewMode = 'preview' | 'form';

type StyleValue = string | number | undefined;
type StyleMap = Partial<Record<keyof CSSStyleDeclaration, StyleValue>>;

export interface DomPreviewOptions {
  mode?: DomPreviewMode;
  zoom?: number;
  className?: string;
  /** Gap between pages in CSS pixels. Defaults to 24. */
  pageGapPx?: number;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  pluginRenderers?: PluginRendererRegistry<DomPluginRenderContext>;
  inputLabels?: Record<string, string>;
  onInputChange?: (key: string, value: JsonValue) => void;
  onInputActivate?: (key: string) => void;
  /** Optional PDF-background renderer. Vanilla DOM cannot render PDF pages itself. */
  renderPdfBackground?: (page: RenderPage) => Node | string | undefined;
}

export interface DomPreviewHandle {
  readonly element: HTMLElement;
  update(document: RenderDocument): void;
  destroy(): void;
}

function assertDomAvailable(): void {
  if (typeof document === 'undefined') {
    throw new Error('DOM preview requires a browser-like environment with `document`.');
  }
}

function applyStyle(element: HTMLElement | SVGElement, style: StyleMap): void {
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;
    (element.style as unknown as Record<string, StyleValue>)[key] = value;
  }
}

function setData(element: HTMLElement, data: Record<string, string | number | undefined>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    element.dataset[key] = String(value);
  }
}

function borderStyle(
  border: TextNode['style']['border'] | RectNode['border'] | EllipseNode['border'],
  zoom: number,
): StyleMap {
  if (!border) return {};
  return {
    border: `${ptToCssPx(border.width, zoom)}px ${border.style} ${border.color}`,
  };
}

function syntheticBoldStyle(bold: boolean, zoom: number, syntheticBold = bold): StyleMap {
  return {
    fontWeight: 'normal',
    textShadow: bold && syntheticBold
      ? `${ptToCssPx(SYNTHETIC_BOLD_OFFSET_PT, zoom)}px 0 currentColor`
      : undefined,
  };
}

function formatInputValue(value: JsonValue): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function applyInputOverlay(
  element: HTMLElement,
  node: RenderNode,
  options: DomPreviewOptions,
): HTMLElement | null {
  const input = node.input;
  if (!input || options.mode !== 'form') return null;

  const style: StyleMap = {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    margin: '0',
    boxSizing: 'border-box',
    border: '1px solid rgba(107, 114, 128, 0.75)',
    outline: 'none',
    background: 'rgba(255, 255, 255, 0.72)',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  };
  const onFocus = () => options.onInputActivate?.(input.key);

  if (input.kind === 'checkbox' || (input.kind === 'radio' && input.optionValue !== undefined)) {
    const control = document.createElement('input');
    control.type = input.kind === 'checkbox' ? 'checkbox' : 'radio';
    control.name = input.key;
    control.required = input.required ?? false;
    control.checked = input.kind === 'checkbox'
      ? input.value === true
      : input.value === input.optionValue;
    if (input.kind === 'radio' && input.optionValue !== undefined) {
      control.value = input.optionValue;
    }
    applyStyle(control, { ...style, opacity: '0', cursor: 'pointer' });
    control.addEventListener('focus', onFocus);
    control.addEventListener('change', () => {
      options.onInputChange?.(
        input.key,
        input.kind === 'checkbox' ? control.checked : input.optionValue ?? '',
      );
    });
    element.appendChild(control);
    return control;
  }

  if (input.kind === 'select') {
    const select = document.createElement('select');
    select.required = input.required ?? false;
    select.value = formatInputValue(input.value);
    applyStyle(select, { ...style, padding: '0 4px' });
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = input.placeholder ?? '';
    select.appendChild(placeholder);
    for (const option of input.options ?? []) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    }
    select.addEventListener('focus', onFocus);
    select.addEventListener('change', () => options.onInputChange?.(input.key, select.value));
    element.appendChild(select);
    return select;
  }

  const control = input.kind === 'multiline'
    ? document.createElement('textarea')
    : document.createElement('input');
  if (control.tagName === 'TEXTAREA') {
    const textarea = control as HTMLTextAreaElement;
    textarea.rows = 1;
    textarea.value = formatInputValue(input.value);
  } else {
    const inputElement = control as HTMLInputElement;
    inputElement.type = input.kind === 'number' ? 'number' : input.kind === 'date' ? 'date' : 'text';
    inputElement.value = formatInputValue(input.value);
  }
  control.required = input.required ?? false;
  if (input.placeholder !== undefined) control.placeholder = input.placeholder;
  applyStyle(control, { ...style, padding: '0 2px', resize: 'none' });
  control.addEventListener('focus', onFocus);
  control.addEventListener('input', () => {
    const raw = control.value;
    if (input.kind === 'number' && raw !== '') {
      const parsed = Number(raw);
      options.onInputChange?.(input.key, Number.isFinite(parsed) ? parsed : raw);
      return;
    }
    options.onInputChange?.(input.key, raw);
  });
  element.appendChild(control);
  return control;
}

function renderText(node: TextNode, options: DomPreviewOptions, zoom: number): HTMLElement {
  const container = document.createElement('div');
  setData(container, { nodeKind: 'text' });
  applyStyle(container, {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    background: node.style.backgroundColor,
    ...borderStyle(node.style.border, zoom),
  });

  for (const line of node.layout.lines) {
    const span = document.createElement('span');
    span.textContent = line.text;
    applyStyle(span, {
      position: 'absolute',
      left: `${mmToCssPx(line.x, zoom)}px`,
      top: `${mmToCssPx(line.y, zoom)}px`,
      width: `${mmToCssPx(line.width, zoom)}px`,
      height: `${mmToCssPx(node.layout.lineHeightMm, zoom)}px`,
      color: node.style.color,
      fontFamily: node.style.fontName || 'sans-serif',
      fontSize: `${ptToCssPx(node.style.fontSize, zoom)}px`,
      lineHeight: `${mmToCssPx(node.layout.lineHeightMm, zoom)}px`,
      whiteSpace: 'pre',
      ...syntheticBoldStyle(node.style.fontWeight === 'bold', zoom, node.style.syntheticBold),
    });
    container.appendChild(span);
  }

  applyInputOverlay(container, node, options);
  return container;
}

function renderRect(node: RectNode, zoom: number): HTMLElement {
  const element = document.createElement('div');
  setData(element, { nodeKind: 'rect' });
  applyStyle(element, {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    background: node.fill,
    borderRadius: node.radius ? `${mmToCssPx(node.radius, zoom)}px` : undefined,
    ...borderStyle(node.border, zoom),
  });
  return element;
}

function renderEllipse(node: EllipseNode, zoom: number): HTMLElement {
  const element = document.createElement('div');
  setData(element, { nodeKind: 'ellipse' });
  applyStyle(element, {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    borderRadius: '50%',
    background: node.fill,
    ...borderStyle(node.border, zoom),
  });
  return element;
}

function renderLine(node: LineNode, zoom: number): HTMLElement {
  const x1 = mmToCssPx(node.from.x, zoom);
  const y1 = mmToCssPx(node.from.y, zoom);
  const x2 = mmToCssPx(node.to.x, zoom);
  const y2 = mmToCssPx(node.to.y, zoom);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const element = document.createElement('div');
  setData(element, { nodeKind: 'line' });
  applyStyle(element, {
    position: 'absolute',
    left: `${x1}px`,
    top: `${y1}px`,
    width: `${Math.hypot(dx, dy)}px`,
    borderTop: `${ptToCssPx(node.width, zoom)}px ${node.style} ${node.color}`,
    transform: `rotate(${Math.atan2(dy, dx)}rad)`,
    transformOrigin: 'left center',
  });
  return element;
}

function renderImage(node: ImageNode, options: DomPreviewOptions): HTMLElement {
  const src = node.dataUrl || (node.assetId ? options.resolveAssetUrl?.(node.assetId) : undefined);
  const container = document.createElement('div');
  applyStyle(container, { position: 'absolute', inset: '0' });

  if (src) {
    const image = document.createElement('img');
    image.dataset.nodeKind = 'image';
    image.src = src;
    image.alt = node.alt;
    applyStyle(image, { width: '100%', height: '100%', objectFit: node.fit });
    container.appendChild(image);
  } else {
    const missing = document.createElement('div');
    setData(missing, { nodeKind: 'image', imageMissing: 'true' });
    missing.setAttribute('aria-label', node.alt);
    applyStyle(missing, { width: '100%', height: '100%', background: 'rgba(0,0,0,0.04)' });
    container.appendChild(missing);
  }
  applyInputOverlay(container, node, options);
  return container;
}

function svgLine(
  svg: SVGSVGElement,
  line: { from: { x: number; y: number }; to: { x: number; y: number } },
  zoom: number,
  stroke: string,
  width: number,
  dasharray: string | undefined,
  cap: 'butt' | 'round',
): void {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  element.setAttribute('x1', String(mmToCssPx(line.from.x, zoom)));
  element.setAttribute('y1', String(mmToCssPx(line.from.y, zoom)));
  element.setAttribute('x2', String(mmToCssPx(line.to.x, zoom)));
  element.setAttribute('y2', String(mmToCssPx(line.to.y, zoom)));
  element.setAttribute('stroke', stroke);
  element.setAttribute('stroke-width', String(width));
  if (dasharray) element.setAttribute('stroke-dasharray', dasharray);
  element.setAttribute('stroke-linecap', cap);
  svg.appendChild(element);
}

function createSvg(width: number, height: number, crisp: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('shape-rendering', crisp ? 'crispEdges' : 'geometricPrecision');
  applyStyle(svg, {
    position: 'absolute',
    inset: '0',
    overflow: 'visible',
    pointerEvents: 'none',
  });
  return svg;
}

function dashArray(style: string, width: number): string | undefined {
  if (style === 'dashed') return `${width * 4} ${width * 3}`;
  if (style === 'dotted') return `${width} ${width * 2}`;
  return undefined;
}

function renderTable(node: TableNode, options: DomPreviewOptions, zoom: number): HTMLElement {
  const container = document.createElement('div');
  setData(container, { nodeKind: 'table' });
  applyStyle(container, { position: 'absolute', inset: '0' });
  const editable = options.mode === 'form' && node.input && options.onInputChange;

  for (const cell of node.layout.cells) {
    const cellElement = document.createElement('div');
    setData(cellElement, {
      tableCellRole: cell.role,
      tableRowIndex: cell.rowIndex,
      tableColumnKey: cell.columnKey,
    });
    applyStyle(cellElement, {
      position: 'absolute',
      left: `${mmToCssPx(cell.box.x, zoom)}px`,
      top: `${mmToCssPx(cell.box.y, zoom)}px`,
      width: `${mmToCssPx(cell.box.width, zoom)}px`,
      height: `${mmToCssPx(cell.box.height, zoom)}px`,
      background: cell.backgroundColor,
      boxSizing: 'border-box',
    });

    if (cell.prefixText && cell.prefixTextX !== undefined) {
      const prefix = document.createElement('span');
      prefix.textContent = cell.prefixText;
      applyStyle(prefix, {
        position: 'absolute',
        left: `${mmToCssPx(cell.prefixTextX - cell.box.x, zoom)}px`,
        top: `${mmToCssPx(cell.textY - cell.box.y, zoom)}px`,
        width: `${mmToCssPx(cell.prefixTextWidth ?? 0, zoom)}px`,
        height: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
        color: cell.color,
        fontFamily: cell.fontName || 'sans-serif',
        fontSize: `${ptToCssPx(cell.fontSize, zoom)}px`,
        lineHeight: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
        whiteSpace: 'pre',
        ...syntheticBoldStyle(cell.bold, zoom, cell.syntheticBold),
      });
      cellElement.appendChild(prefix);
    }

    const lines = cell.lines ?? [{
      text: cell.text,
      x: cell.textX,
      y: cell.textY,
      width: cell.textWidth,
    }];
    for (const line of lines) {
      const span = document.createElement('span');
      span.textContent = line.text;
      span.dataset.tableTextLine = 'true';
      applyStyle(span, {
        position: 'absolute',
        left: `${mmToCssPx(line.x - cell.box.x, zoom)}px`,
        top: `${mmToCssPx(line.y - cell.box.y, zoom)}px`,
        width: `${mmToCssPx(line.width, zoom)}px`,
        height: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
        color: cell.color,
        fontFamily: cell.fontName || 'sans-serif',
        fontSize: `${ptToCssPx(cell.fontSize, zoom)}px`,
        lineHeight: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
        whiteSpace: 'pre',
        ...syntheticBoldStyle(cell.bold, zoom, cell.syntheticBold),
      });
      cellElement.appendChild(span);
    }

    if (editable
      && cell.role === 'body'
      && cell.rowIndex !== undefined
      && cell.columnKey
      && cell.valueType !== 'formula') {
      const input = document.createElement('input');
      input.type = cell.valueType === 'number' || cell.valueType === 'currency'
        ? 'number'
        : cell.valueType === 'date' ? 'date' : 'text';
      input.value = String(node.rows[cell.rowIndex]?.[cell.columnKey] ?? '');
      input.setAttribute(
        'aria-label',
        `${options.inputLabels?.[node.input!.key] ?? node.input!.key} ${cell.rowIndex + 1} ${
          node.columns.find(column => column.key === cell.columnKey)?.label ?? cell.columnKey
        }`,
      );
      applyStyle(input, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        padding: `${mmToCssPx(node.style.cellPadding ?? DEFAULT_TABLE_CELL_PADDING_MM, zoom)}px`,
        border: '1px solid rgba(107, 114, 128, 0.75)',
        outline: 'none',
        boxSizing: 'border-box',
        background: 'rgba(255, 255, 255, 0.72)',
        color: cell.color,
        fontSize: `${ptToCssPx(cell.fontSize, zoom)}px`,
        textAlign: cell.align,
      });
      input.addEventListener('input', () => {
        options.onInputChange?.(
          node.input!.key,
          updateTableCell(
            node.rows,
            cell.rowIndex!,
            cell.columnKey!,
            input.value,
            cell.valueType!,
          ),
        );
      });
      if (cell.rowIndex !== undefined) {
        input.addEventListener('focus', () => options.onInputActivate?.(node.input!.key));
      }
      cellElement.appendChild(input);
    }

    // Keep the cell content independent of future add/remove row controls.
    container.appendChild(cellElement);
  }

  const hasPatternedLine = node.layout.lines.some(line =>
    (line.border ?? node.style.border).style !== 'solid');
  const svg = createSvg(
    mmToCssPx(node.box.width, zoom),
    mmToCssPx(node.layout.height, zoom),
    !hasPatternedLine,
  );
  for (const line of node.layout.lines) {
    const border = line.border ?? node.style.border;
    const width = ptToCssPx(border.width, zoom);
    svgLine(
      svg,
      line,
      zoom,
      border.color,
      width,
      dashArray(border.style, width),
      border.style === 'dotted' ? 'round' : 'butt',
    );
  }
  container.appendChild(svg);
  return container;
}

function renderGrid(node: GridNode, zoom: number): HTMLElement {
  const container = document.createElement('div');
  setData(container, { nodeKind: 'grid' });
  applyStyle(container, { position: 'absolute', inset: '0' });
  const { layout, style } = node;
  const border = style.border;

  for (const cell of layout.cells) {
    const cellElement = document.createElement('div');
    setData(cellElement, { gridCellRole: cell.role });
    applyStyle(cellElement, {
      position: 'absolute',
      left: `${mmToCssPx(cell.box.x, zoom)}px`,
      top: `${mmToCssPx(cell.box.y, zoom)}px`,
      width: `${mmToCssPx(cell.box.width, zoom)}px`,
      height: `${mmToCssPx(cell.box.height, zoom)}px`,
      background: cell.backgroundColor,
      boxSizing: 'border-box',
    });

    const lines = [
      ...(cell.prefixLines ?? []),
      ...cell.lines,
    ];
    for (const line of lines) {
      const span = document.createElement('span');
      span.textContent = line.text;
      applyStyle(span, {
        position: 'absolute',
        left: `${mmToCssPx(line.x, zoom)}px`,
        top: `${mmToCssPx(line.y, zoom)}px`,
        width: `${mmToCssPx(line.width, zoom)}px`,
        height: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
        color: cell.color,
        fontFamily: cell.fontName || 'sans-serif',
        fontSize: `${ptToCssPx(cell.fontSize, zoom)}px`,
        lineHeight: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
        whiteSpace: 'pre',
        ...syntheticBoldStyle(cell.bold, zoom, cell.syntheticBold),
      });
      cellElement.appendChild(span);
    }
    container.appendChild(cellElement);
  }

  const width = mmToCssPx(node.box.width, zoom);
  const height = mmToCssPx(layout.height, zoom);
  const borderWidth = ptToCssPx(border.width, zoom);
  const half = borderWidth / 2;
  const clampX = (value: number) => Math.min(
    Math.max(half, width - half),
    Math.max(half, mmToCssPx(value, zoom)),
  );
  const clampY = (value: number) => Math.min(
    Math.max(half, height - half),
    Math.max(half, mmToCssPx(value, zoom)),
  );

  const svg = createSvg(width, height, border.style === 'solid');
  for (const line of layout.lines) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    element.setAttribute('x1', String(clampX(line.from.x)));
    element.setAttribute('y1', String(clampY(line.from.y)));
    element.setAttribute('x2', String(clampX(line.to.x)));
    element.setAttribute('y2', String(clampY(line.to.y)));
    element.setAttribute('stroke', border.color);
    element.setAttribute('stroke-width', String(borderWidth));
    const dash = dashArray(border.style, borderWidth);
    if (dash) element.setAttribute('stroke-dasharray', dash);
    element.setAttribute('stroke-linecap', border.style === 'dotted' ? 'round' : 'butt');
    svg.appendChild(element);
  }
  container.appendChild(svg);
  return container;
}

function renderPlugin(node: PluginNode, options: DomPreviewOptions, zoom: number): HTMLElement {
  const renderer = options.pluginRenderers?.get(node.pluginType);
  if (renderer) {
    const rendered = renderer(node, { mode: options.mode ?? 'preview', zoom });
    if (rendered && typeof (rendered as Promise<unknown>).then === 'function') {
      console.warn(`DOM renderer for plugin "${node.pluginType}" must be synchronous.`);
    } else if (typeof rendered === 'string') {
      const text = document.createElement('div');
      text.textContent = rendered;
      applyStyle(text, { position: 'absolute', inset: '0' });
      return text;
    } else if (typeof Node !== 'undefined' && rendered instanceof Node) {
      const wrapper = document.createElement('div');
      applyStyle(wrapper, { position: 'absolute', inset: '0' });
      wrapper.appendChild(rendered);
      return wrapper;
    } else if (rendered !== undefined && rendered !== null) {
      console.warn(
        `DOM renderer for plugin "${node.pluginType}" must return a DOM Node or string.`,
      );
    }
  }

  const placeholder = document.createElement('div');
  setData(placeholder, { nodeKind: 'plugin', pluginType: node.pluginType });
  applyStyle(placeholder, {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    border: `${Math.max(1, zoom)}px dashed rgba(156, 163, 175, 0.9)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${Math.max(10, 12 * zoom)}px`,
    color: '#6b7280',
    overflow: 'hidden',
  });
  placeholder.textContent = node.pluginType;
  return placeholder;
}

function renderNodeContent(
  node: RenderNode,
  options: DomPreviewOptions,
  zoom: number,
): HTMLElement {
  switch (node.kind) {
    case 'text':
      return renderText(node, options, zoom);
    case 'rect':
      return renderRect(node, zoom);
    case 'ellipse':
      return renderEllipse(node, zoom);
    case 'line':
      return renderLine(node, zoom);
    case 'image':
      return renderImage(node, options);
    case 'grid':
      return renderGrid(node, zoom);
    case 'table':
      return renderTable(node, options, zoom);
    case 'plugin':
      return renderPlugin(node, options, zoom);
  }
}

function renderNode(node: RenderNode, options: DomPreviewOptions, zoom: number): HTMLElement {
  const wrapper = document.createElement('div');
  setData(wrapper, {
    renderNodeId: node.id,
    sourceElementId: node.sourceElementId,
  });
  applyStyle(wrapper, {
    position: 'absolute',
    left: `${mmToCssPx(node.box.x, zoom)}px`,
    top: `${mmToCssPx(node.box.y, zoom)}px`,
    width: `${mmToCssPx(node.box.width, zoom)}px`,
    height: `${mmToCssPx(node.box.height, zoom)}px`,
    transform: node.rotate ? `rotate(${node.rotate}deg)` : undefined,
    transformOrigin: 'center center',
    opacity: node.opacity,
    overflow: node.clip ? 'hidden' : 'visible',
    zIndex: node.zIndex,
    boxSizing: 'border-box',
  });
  wrapper.appendChild(renderNodeContent(node, options, zoom));
  return wrapper;
}

function renderPage(page: RenderPage, options: DomPreviewOptions, zoom: number): HTMLElement {
  const element = document.createElement('div');
  element.className = 'layoutpdf-render-page';
  setData(element, {
    renderPageId: page.id,
    sourcePageId: page.sourcePageId,
    continuationIndex: page.continuationIndex,
  });
  applyStyle(element, {
    position: 'relative',
    overflow: 'hidden',
    width: `${mmToCssPx(page.size.width, zoom)}px`,
    height: `${mmToCssPx(page.size.height, zoom)}px`,
    background: page.background.kind === 'blank'
      ? page.background.color || '#ffffff'
      : '#ffffff',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18)',
  });

  if (page.background.kind === 'pdf' && options.renderPdfBackground) {
    const background = options.renderPdfBackground(page);
    if (typeof background === 'string') {
      const text = document.createElement('div');
      text.textContent = background;
      element.appendChild(text);
    } else if (background) {
      element.appendChild(background);
    }
  }

  for (const node of page.nodes) {
    element.appendChild(renderNode(node, options, zoom));
  }
  return element;
}

function renderInto(root: HTMLElement, documentModel: RenderDocument, options: DomPreviewOptions): void {
  const zoom = options.zoom ?? 1;
  root.replaceChildren();
  root.className = options.className ?? '';
  applyStyle(root, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${options.pageGapPx ?? 24}px`,
  });
  setData(root, { renderDocumentId: documentModel.templateId });
  for (const page of documentModel.pages) {
    root.appendChild(renderPage(page, options, zoom));
  }
}

/**
 * Creates a framework-independent read-only (or form) preview.
 *
 * Plugin DOM renderers must return a DOM `Node` or a string; React elements are
 * not rendered in this adapter.
 */
export function createDomPreview(
  documentModel: RenderDocument,
  options: DomPreviewOptions = {},
): DomPreviewHandle {
  assertDomAvailable();
  const root = document.createElement('div');
  let currentDocument = documentModel;
  const currentOptions = options;

  renderInto(root, currentDocument, currentOptions);

  return {
    element: root,
    update(nextDocument: RenderDocument) {
      currentDocument = nextDocument;
      renderInto(root, currentDocument, currentOptions);
    },
    destroy() {
      root.remove();
    },
  };
}

/** Mounts a preview into `container` and returns its handle. */
export function mountDomPreview(
  container: HTMLElement,
  documentModel: RenderDocument,
  options: DomPreviewOptions = {},
): DomPreviewHandle {
  const handle = createDomPreview(documentModel, options);
  container.replaceChildren(handle.element);
  return handle;
}

/** Convenience helper that returns the preview root without a mount handle. */
export function renderDomPreview(
  documentModel: RenderDocument,
  options: DomPreviewOptions = {},
): HTMLElement {
  return createDomPreview(documentModel, options).element;
}
