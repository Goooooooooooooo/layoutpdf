import { memo, type CSSProperties, type ReactNode } from 'react';
import { createId, type JsonValue } from '@/engine/core/document.js';
import type { DomPluginRenderContext } from '@/engine/core/plugin.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import { usePluginRendererRegistry } from '@/editor/components/pluginRendererContext.js';
import type {
  GridNode,
  ImageNode,
  EllipseNode,
  LineNode,
  PluginNode,
  RectNode,
  RenderNode,
  TableLayoutCell,
  TableNode,
  TextNode,
} from '@/engine/renderTree/model.js';
import { DEFAULT_TABLE_CELL_PADDING_MM } from '@/engine/renderTree/tablePresentation.js';
import Icon from '@/ui/icon/Icon.js';
import Select from '@/ui/select/Select.js';
import { mmToCssPx, ptToCssPx } from '@/engine/utils/units.js';
import { appendTableRow, removeTableRow, updateTableCell } from '@/editor/utils/tableInput.js';
import { SYNTHETIC_BOLD_OFFSET_PT } from '@/engine/renderTree/textWeight.js';
import { t } from '@/i18n/index.js';

export type RenderViewMode = 'designer' | 'form' | 'preview';

export interface RenderElementProps {
  node: RenderNode;
  mode: RenderViewMode;
  zoom: number;
  onSelect?: (elementId: string, additive: boolean) => void;
  onInputChange?: (key: string, value: JsonValue) => void;
  onInputActivate?: (key: string) => void;
  inputLabel?: string;
  highlighted?: boolean;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  pluginRenderers?: PluginRendererRegistry<DomPluginRenderContext>;
}

function borderStyle(
  border: TextNode['style']['border'] | RectNode['border'],
  zoom: number,
): CSSProperties {
  if (!border) return {};
  return {
    border: `${ptToCssPx(border.width, zoom)}px ${border.style} ${border.color}`,
  };
}

function textWeightStyle(
  bold: boolean,
  zoom: number,
  syntheticBold = bold,
): CSSProperties {
  return {
    fontWeight: 'normal',
    textShadow: bold && syntheticBold
      ? `${ptToCssPx(SYNTHETIC_BOLD_OFFSET_PT, zoom)}px 0 currentColor`
      : undefined,
  };
}

function renderText(node: TextNode, props: RenderElementProps): ReactNode {
  const { zoom, mode, onInputChange } = props;
  const fontSize = ptToCssPx(node.style.fontSize, zoom);
  const content = (
    <div
      data-node-kind="text"
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        background: node.style.backgroundColor,
        ...borderStyle(node.style.border, zoom),
      }}
    >
      {node.layout.lines.map((line, index) => (
        <span
          key={`${node.id}:line:${index}`}
          style={{
            position: 'absolute',
            left: mmToCssPx(line.x, zoom),
            top: mmToCssPx(line.y, zoom),
            width: mmToCssPx(line.width, zoom),
            height: mmToCssPx(node.layout.lineHeightMm, zoom),
            color: node.style.color,
            fontFamily: node.style.fontName || 'sans-serif',
            fontSize,
            ...textWeightStyle(
              node.style.fontWeight === 'bold',
              zoom,
              node.style.syntheticBold,
            ),
            lineHeight: `${mmToCssPx(node.layout.lineHeightMm, zoom)}px`,
            whiteSpace: 'pre',
          }}
        >
          {line.text}
        </span>
      ))}
    </div>
  );

  if (mode !== 'form' || !node.input || node.input.kind === 'table') return content;

  const inputStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    margin: 0,
    padding: node.style.padding.map(value => mmToCssPx(value, zoom)).join('px ') + 'px',
    border: '1px solid var(--layoutpdf-color-primary-border)',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'none',
    background: 'var(--layoutpdf-color-surface-translucent)',
    color: node.style.color,
    fontFamily: node.style.fontName || 'sans-serif',
    fontSize,
    ...textWeightStyle(
      node.style.fontWeight === 'bold',
      zoom,
      node.style.syntheticBold,
    ),
    lineHeight: String(node.style.lineHeight),
    textAlign: node.style.align,
  };
  const value = typeof node.input.value === 'string' || typeof node.input.value === 'number'
    ? String(node.input.value)
    : '';
  const onChange = (raw: string) => {
    if (node.input?.kind === 'number' && raw !== '') {
      const number = Number(raw);
      onInputChange?.(node.input.key, Number.isFinite(number) ? number : raw);
      return;
    }
    onInputChange?.(node.input!.key, raw);
  };

  if (node.input.kind === 'checkbox') {
    return (
      <>
        {content}
        <input
          aria-label={props.inputLabel ?? node.input.key}
          type="checkbox"
          required={node.input.required}
          checked={node.input.value === true}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            opacity: 0,
            cursor: 'pointer',
          }}
          onChange={event => onInputChange?.(node.input!.key, event.currentTarget.checked)}
        />
      </>
    );
  }

  if (node.input.kind === 'multiline') {
    return (
      <>
        {content}
        <textarea
          aria-label={props.inputLabel ?? node.input.key}
          required={node.input.required}
          placeholder={node.input.placeholder}
          value={value}
          style={inputStyle}
          onChange={event => onChange(event.currentTarget.value)}
        />
      </>
    );
  }

  if (node.input.kind === 'select') {
    return (
      <>
        {content}
        <Select
          aria-label={props.inputLabel ?? node.input.key}
          required={node.input.required}
          value={value}
          style={inputStyle}
          onChange={selected => onInputChange?.(node.input!.key, selected)}
          options={[
            { value: '', label: node.input.placeholder ?? '' },
            ...(node.input.options ?? []).map(option => ({ ...option })),
          ]}
        />
      </>
    );
  }

  if (node.input.kind === 'radio' && node.input.optionValue !== undefined) {
    return (
      <>
        {content}
        <input
          aria-label={`${props.inputLabel ?? node.input.key}: ${
            node.input.options?.find(option => option.value === node.input!.optionValue)?.label
              ?? node.input.optionValue
          }`}
          type="radio"
          name={node.input.key}
          required={node.input.required}
          checked={node.input.value === node.input.optionValue}
          value={node.input.optionValue}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            opacity: 0,
            cursor: 'pointer',
          }}
          onChange={() => onInputChange?.(node.input!.key, node.input!.optionValue!)}
        />
      </>
    );
  }

  return (
    <>
      {content}
      <input
        aria-label={props.inputLabel ?? node.input.key}
        type={node.input.kind === 'number' ? 'number' : node.input.kind === 'date' ? 'date' : 'text'}
        required={node.input.required}
        placeholder={node.input.placeholder}
        value={value}
        style={inputStyle}
        onChange={event => onChange(event.currentTarget.value)}
      />
    </>
  );
}

function renderRect(node: RectNode, zoom: number): ReactNode {
  return (
    <div
      data-node-kind="rect"
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        background: node.fill,
        borderRadius: node.radius ? mmToCssPx(node.radius, zoom) : undefined,
        ...borderStyle(node.border, zoom),
      }}
    />
  );
}

function renderEllipse(node: EllipseNode, zoom: number): ReactNode {
  return (
    <div
      data-node-kind="ellipse"
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        borderRadius: '50%',
        background: node.fill,
        ...borderStyle(node.border, zoom),
      }}
    />
  );
}

function renderLine(node: LineNode, zoom: number): ReactNode {
  const x1 = mmToCssPx(node.from.x, zoom);
  const y1 = mmToCssPx(node.from.y, zoom);
  const x2 = mmToCssPx(node.to.x, zoom);
  const y2 = mmToCssPx(node.to.y, zoom);
  const dx = x2 - x1;
  const dy = y2 - y1;
  return (
    <div
      data-node-kind="line"
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: Math.hypot(dx, dy),
        borderTop: `${ptToCssPx(node.width, zoom)}px ${node.style} ${node.color}`,
        transform: `rotate(${Math.atan2(dy, dx)}rad)`,
        transformOrigin: 'left center',
      }}
    />
  );
}

function renderImage(node: ImageNode, props: RenderElementProps): ReactNode {
  const src = node.dataUrl || (node.assetId ? props.resolveAssetUrl?.(node.assetId) : undefined);
  const content = src ? (
    <img
      data-node-kind="image"
      src={src}
      alt={node.alt}
      style={{ width: '100%', height: '100%', objectFit: node.fit }}
    />
  ) : (
    <div data-node-kind="image" data-image-missing="true" aria-label={node.alt} />
  );
  if (props.mode !== 'form' || !node.input || node.input.kind !== 'text') return content;
  return (
    <>
      {content}
      <input
        aria-label={props.inputLabel ?? node.input.key}
        type="text"
        required={node.input.required}
        placeholder={node.input.placeholder}
        value={typeof node.input.value === 'string' ? node.input.value : ''}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          padding: 4,
          border: '1px solid var(--layoutpdf-color-primary-border)',
          boxSizing: 'border-box',
          background: 'var(--layoutpdf-color-surface-translucent)',
        }}
        onChange={event => props.onInputChange?.(node.input!.key, event.currentTarget.value)}
      />
    </>
  );
}

function tableInputType(cell: TableLayoutCell): 'text' | 'number' | 'date' {
  if (cell.valueType === 'number' || cell.valueType === 'currency') return 'number';
  if (cell.valueType === 'date') return 'date';
  return 'text';
}

function renderTable(node: TableNode, props: RenderElementProps): ReactNode {
  const { zoom, mode, onInputChange } = props;
  const tableWidth = mmToCssPx(node.box.width, zoom);
  const tableHeight = mmToCssPx(node.layout.height, zoom);
  const hasPatternedLine = node.layout.lines.some(line =>
    (line.border ?? node.style.border).style !== 'solid'
  );
  const lastColumnKey = node.columns.at(-1)?.key;
  const editable = mode === 'form' && node.input && onInputChange;
  const updateRows = (rows: TableNode['rows']) => onInputChange?.(node.input!.key, rows);

  return (
    <div data-node-kind="table" style={{ position: 'absolute', inset: 0 }}>
      {node.layout.cells.map(cell => (
        <div
          key={cell.id}
          data-table-cell-role={cell.role}
          data-table-row-index={cell.rowIndex}
          data-table-column-key={cell.columnKey}
          style={{
            position: 'absolute',
            left: mmToCssPx(cell.box.x, zoom),
            top: mmToCssPx(cell.box.y, zoom),
            width: mmToCssPx(cell.box.width, zoom),
            height: mmToCssPx(cell.box.height, zoom),
            background: cell.backgroundColor,
            boxSizing: 'border-box',
          }}
        >
          {cell.prefixText && cell.prefixTextX !== undefined ? (
            <span
              style={{
                position: 'absolute',
                left: mmToCssPx(cell.prefixTextX - cell.box.x, zoom),
                top: mmToCssPx(cell.textY - cell.box.y, zoom),
                width: mmToCssPx(cell.prefixTextWidth ?? 0, zoom),
                height: mmToCssPx(cell.lineHeightMm, zoom),
                color: cell.color,
                fontFamily: cell.fontName || 'sans-serif',
                fontSize: ptToCssPx(cell.fontSize, zoom),
                ...textWeightStyle(cell.bold, zoom, cell.syntheticBold),
                lineHeight: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
                whiteSpace: 'pre',
              }}
            >
              {cell.prefixText}
            </span>
          ) : null}
          {(cell.lines ?? [{
            text: cell.text,
            x: cell.textX,
            y: cell.textY,
            width: cell.textWidth,
          }]).map((line, lineIndex) => (
            <span
              key={`${cell.id}:line:${lineIndex}`}
              data-table-text-line="true"
              style={{
                position: 'absolute',
                left: mmToCssPx(line.x - cell.box.x, zoom),
                top: mmToCssPx(line.y - cell.box.y, zoom),
                width: mmToCssPx(line.width, zoom),
                height: mmToCssPx(cell.lineHeightMm, zoom),
                color: cell.color,
                fontFamily: cell.fontName || 'sans-serif',
                fontSize: ptToCssPx(cell.fontSize, zoom),
                ...textWeightStyle(cell.bold, zoom, cell.syntheticBold),
                lineHeight: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
                whiteSpace: 'pre',
              }}
            >
              {line.text}
            </span>
          ))}
          {editable && cell.role === 'body' && cell.rowIndex !== undefined && cell.columnKey && cell.valueType !== 'formula' ? (
            <input
              aria-label={`${props.inputLabel ?? node.input!.key} ${cell.rowIndex + 1} ${node.columns.find(column => column.key === cell.columnKey)?.label ?? cell.columnKey}`}
              type={tableInputType(cell)}
              value={String(node.rows[cell.rowIndex]?.[cell.columnKey] ?? '')}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                padding: `${mmToCssPx(
                  node.style.cellPadding ?? DEFAULT_TABLE_CELL_PADDING_MM,
                  zoom,
                )}px`,
                border: '1px solid var(--layoutpdf-color-primary-border)',
                outline: 'none',
                boxSizing: 'border-box',
                background: 'var(--layoutpdf-color-surface-translucent)',
                color: cell.color,
                fontSize: ptToCssPx(cell.fontSize, zoom),
                textAlign: cell.align,
              }}
              onChange={event => updateRows(updateTableCell(
                node.rows,
                cell.rowIndex!,
                cell.columnKey!,
                event.currentTarget.value,
                cell.valueType!,
              ))}
            />
          ) : null}
          {editable && cell.role === 'body' && cell.rowIndex !== undefined && cell.columnKey === lastColumnKey ? (
            <button
              type="button"
              title={t('form.table.deleteRow')}
              aria-label={t('form.table.deleteRowIndex', { index: cell.rowIndex + 1 })}
              style={{
                position: 'absolute',
                top: 1,
                right: -22,
                width: 20,
                height: 20,
                padding: 0,
                border: 0,
                background: 'var(--layoutpdf-color-surface)',
                color: 'var(--layoutpdf-color-danger)',
                cursor: 'pointer',
              }}
              onClick={() => updateRows(removeTableRow(node.rows, cell.rowIndex!))}
            >
              <Icon name="trash" size={14} />
            </button>
          ) : null}
          {editable && cell.role === 'header' && cell.columnKey === lastColumnKey ? (
            <button
              type="button"
              title={t('form.table.addRow')}
              aria-label={t('form.table.addRow')}
              style={{
                position: 'absolute',
                top: 1,
                right: -22,
                width: 20,
                height: 20,
                padding: 0,
                border: 0,
                background: 'var(--layoutpdf-color-surface)',
                color: 'var(--layoutpdf-color-primary)',
                cursor: 'pointer',
              }}
              onClick={() => updateRows(appendTableRow(
                node.rows,
                node.columns,
                createId('row'),
              ))}
            >
              <Icon name="plus" size={14} />
            </button>
          ) : null}
        </div>
      ))}
      <svg
        aria-hidden="true"
        width={tableWidth}
        height={tableHeight}
        shapeRendering={hasPatternedLine ? 'geometricPrecision' : 'crispEdges'}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {node.layout.lines.map((line, index) => {
          const border = line.border ?? node.style.border;
          const borderWidth = ptToCssPx(border.width, zoom);
          const strokeDasharray = border.style === 'dashed'
            ? `${borderWidth * 4} ${borderWidth * 3}`
            : border.style === 'dotted'
              ? `${borderWidth} ${borderWidth * 2}`
              : undefined;
          return (
            <line
              key={`${node.id}:grid:${index}`}
              data-table-grid-line="true"
              data-table-grid-line-scope={line.border ? 'footer' : 'table'}
              x1={mmToCssPx(line.from.x, zoom)}
              y1={mmToCssPx(line.from.y, zoom)}
              x2={mmToCssPx(line.to.x, zoom)}
              y2={mmToCssPx(line.to.y, zoom)}
              stroke={border.color}
              strokeWidth={borderWidth}
              strokeDasharray={strokeDasharray}
              strokeLinecap={border.style === 'dotted' ? 'round' : 'butt'}
            />
          );
        })}
      </svg>
    </div>
  );
}

function renderGrid(node: GridNode, zoom: number): ReactNode {
  const { layout, style } = node;
  const { border } = style;
  const borderWidth = ptToCssPx(border.width, zoom);
  const gridWidth = mmToCssPx(node.box.width, zoom);
  const gridHeight = mmToCssPx(layout.height, zoom);
  const halfBorder = borderWidth / 2;
  const clampX = (value: number) => Math.min(
    Math.max(halfBorder, gridWidth - halfBorder),
    Math.max(halfBorder, mmToCssPx(value, zoom)),
  );
  const clampY = (value: number) => Math.min(
    Math.max(halfBorder, gridHeight - halfBorder),
    Math.max(halfBorder, mmToCssPx(value, zoom)),
  );
  const strokeDasharray = border.style === 'dashed'
    ? `${borderWidth * 4} ${borderWidth * 3}`
    : border.style === 'dotted'
      ? `${borderWidth} ${borderWidth * 2}`
      : undefined;

  return (
    <div data-node-kind="grid" style={{ position: 'absolute', inset: 0 }}>
      {layout.cells.map(cell => (
        <div
          key={cell.id}
          data-grid-cell-role={cell.role}
          style={{
            position: 'absolute',
            left: mmToCssPx(cell.box.x, zoom),
            top: mmToCssPx(cell.box.y, zoom),
            width: mmToCssPx(cell.box.width, zoom),
            height: mmToCssPx(cell.box.height, zoom),
            background: cell.backgroundColor,
            boxSizing: 'border-box',
          }}
        >
          {[...(cell.prefixLines ?? []).map((line, index) => ({
            line,
            key: `${cell.id}:prefix-line:${index}`,
          })), ...cell.lines.map((line, index) => ({
            line,
            key: `${cell.id}:line:${index}`,
          }))].map(({ line, key }) => (
            <span
              key={key}
              style={{
                position: 'absolute',
                left: mmToCssPx(line.x, zoom),
                top: mmToCssPx(line.y, zoom),
                width: mmToCssPx(line.width, zoom),
                height: mmToCssPx(cell.lineHeightMm, zoom),
                color: cell.color,
                fontFamily: cell.fontName || 'sans-serif',
                fontSize: ptToCssPx(cell.fontSize, zoom),
                ...textWeightStyle(cell.bold, zoom, cell.syntheticBold),
                lineHeight: `${mmToCssPx(cell.lineHeightMm, zoom)}px`,
                whiteSpace: 'pre',
              }}
            >
              {line.text}
            </span>
          ))}
        </div>
      ))}
      <svg
        aria-hidden="true"
        width={gridWidth}
        height={gridHeight}
        shapeRendering={border.style === 'solid' ? 'crispEdges' : 'geometricPrecision'}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {layout.lines.map((line, index) => (
          <line
            key={`${node.id}:grid-line:${index}`}
            data-grid-line="true"
            x1={clampX(line.from.x)}
            y1={clampY(line.from.y)}
            x2={clampX(line.to.x)}
            y2={clampY(line.to.y)}
            stroke={border.color}
            strokeWidth={borderWidth}
            strokeDasharray={strokeDasharray}
            strokeLinecap={border.style === 'dotted' ? 'round' : 'butt'}
          />
        ))}
      </svg>
    </div>
  );
}

function renderPlugin(node: PluginNode, props: RenderElementProps): ReactNode {
  const renderer = props.pluginRenderers?.get(node.pluginType);
  if (renderer) {
    const rendered = renderer(node, { mode: props.mode, zoom: props.zoom });
    if (rendered !== undefined && rendered !== null) {
      if (typeof (rendered as Promise<unknown>).then === 'function') {
        console.warn(`DOM renderer for plugin "${node.pluginType}" must be synchronous.`);
      } else {
        return rendered as ReactNode;
      }
    }
  }

  return (
    <div
      data-node-kind="plugin"
      data-plugin-type={node.pluginType}
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        border: `${Math.max(1, props.zoom)}px dashed var(--layoutpdf-color-primary-border, #9ca3af)`,
        background: 'var(--layoutpdf-color-surface-translucent, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, 12 * props.zoom),
        color: 'var(--layoutpdf-color-text-muted, #6b7280)',
        overflow: 'hidden',
      }}
    >
      {node.pluginType}
    </div>
  );
}

function renderNodeContent(node: RenderNode, props: RenderElementProps): ReactNode {
  switch (node.kind) {
    case 'text':
      return renderText(node, props);
    case 'rect':
      return renderRect(node, props.zoom);
    case 'ellipse':
      return renderEllipse(node, props.zoom);
    case 'line':
      return renderLine(node, props.zoom);
    case 'image':
      return renderImage(node, props);
    case 'grid':
      return renderGrid(node, props.zoom);
    case 'table':
      return renderTable(node, props);
    case 'plugin':
      return renderPlugin(node, props);
  }
}

export default memo(function RenderElement(props: RenderElementProps) {
  const { node, zoom, mode, onSelect } = props;
  const inheritedPluginRenderers = usePluginRendererRegistry();
  const renderedProps = props.pluginRenderers === undefined && inheritedPluginRenderers
    ? { ...props, pluginRenderers: inheritedPluginRenderers }
    : props;
  return (
    <div
      data-render-node-id={node.id}
      data-source-element-id={node.sourceElementId}
      data-runner-highlighted={props.highlighted || undefined}
      style={{
        position: 'absolute',
        left: mmToCssPx(node.box.x, zoom),
        top: mmToCssPx(node.box.y, zoom),
        width: mmToCssPx(node.box.width, zoom),
        height: mmToCssPx(node.box.height, zoom),
        transform: node.rotate ? `rotate(${node.rotate}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: node.opacity,
        overflow: mode === 'form' && node.kind === 'table'
          ? 'visible'
          : node.clip ? 'hidden' : 'visible',
        zIndex: node.zIndex,
        boxSizing: 'border-box',
      }}
      onFocusCapture={mode === 'form' && node.input && props.onInputActivate
        ? () => props.onInputActivate?.(node.input!.key)
        : undefined}
      onMouseDown={mode === 'designer' && onSelect
        ? event => {
            event.stopPropagation();
            onSelect(node.sourceElementId, event.ctrlKey || event.metaKey);
          }
        : mode === 'preview' && node.input && props.onInputActivate
          ? event => {
              event.stopPropagation();
              props.onInputActivate?.(node.input!.key);
            }
          : undefined}
    >
      {renderNodeContent(node, renderedProps)}
    </div>
  );
});
