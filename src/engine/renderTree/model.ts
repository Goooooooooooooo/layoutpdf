import type { ElementBox, JsonObject, JsonValue } from '@/engine/core/document.js';
import type { RenderIssue } from '@/engine/utils/errors.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';

export interface RenderDocument {
  templateId: string;
  format: FormatLocaleSettings;
  pages: RenderPage[];
  issues: RenderIssue[];
}

export interface ResolvedPageBackground {
  kind: 'blank' | 'pdf';
  color?: string;
  assetId?: string;
  pageIndex?: number;
}

export interface RenderPage {
  id: string;
  sourcePageId: string;
  continuationIndex: number;
  size: { width: number; height: number };
  padding: [number, number, number, number];
  background: ResolvedPageBackground;
  nodes: RenderNode[];
}

export interface RenderChoiceOption {
  label: string;
  value: string;
}

export interface RenderInput {
  key: string;
  kind: 'text' | 'multiline' | 'number' | 'date' | 'checkbox' | 'select' | 'radio' | 'table';
  value: JsonValue;
  required?: boolean;
  placeholder?: string;
  options?: RenderChoiceOption[];
  optionValue?: string;
}

export interface RenderNodeBase {
  id: string;
  sourceElementId: string;
  box: ElementBox;
  rotate: number;
  opacity: number;
  clip: boolean;
  zIndex: number;
  input?: RenderInput;
  outputs?: RenderOutput[];
}

export interface BorderStyle {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface TextLayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface TextLayout {
  lines: TextLayoutLine[];
  lineHeightMm: number;
  overflow: boolean;
}

export interface TextNode extends RenderNodeBase {
  kind: 'text';
  /** Runtime-only role for text synthesized by shared layout; never persisted. */
  runtimeRole?: 'table-continuation-title';
  text: string;
  numericFormula?: {
    expression: string;
    format: 'number' | 'currency';
    prefix: string;
    suffix: string;
    decimalPlaces: number;
    negativeStyle?: NegativeCurrencyStyle;
  };
  fieldReference?: {
    key: string;
    prefix: string;
    suffix: string;
    decimalPlaces: number;
    negativeStyle?: NegativeCurrencyStyle;
  };
  style: {
    fontName?: string;
    fontSize: number;
    color: string;
    fontWeight: 'normal' | 'bold';
    /** Runtime-only resolved face. Falls back to fontName/default before layout. */
    syntheticBold?: boolean;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    lineHeight: number;
    padding: [number, number, number, number];
    backgroundColor?: string;
    border?: BorderStyle;
  };
  layout: TextLayout;
}

export interface RectNode extends RenderNodeBase {
  kind: 'rect';
  fill?: string;
  border?: BorderStyle;
  radius?: number;
}

export interface EllipseNode extends RenderNodeBase {
  kind: 'ellipse';
  fill?: string;
  border?: BorderStyle;
}

export interface LineNode extends RenderNodeBase {
  kind: 'line';
  from: { x: number; y: number };
  to: { x: number; y: number };
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface ImageNode extends RenderNodeBase {
  kind: 'image';
  assetId?: string;
  dataUrl?: string;
  fit: 'contain' | 'cover' | 'fill';
  alt: string;
}

export type TableValueRow = JsonObject & { id: string };

export const FORMULA_ERROR = '###FORMULA_ERROR###';

export type TableFormulaEvaluationError =
  | {
      kind: 'row';
      rowId: string;
      rowIndex: number;
      columnKey: string;
      message: string;
    }
  | {
      kind: 'footer';
      footerId: string;
      message: string;
    };

export interface TableFormula {
  kind: 'expression';
  expression: string;
}

export type TableColumnAlign = 'left' | 'center' | 'right';

export interface ElementOutputRef {
  sourceElementId: string;
  outputId: string;
}

export type RenderOutputValue = string | number | boolean | null;

export type NegativeCurrencyStyle =
  | 'minus-after-symbol'
  | 'minus-before-symbol'
  | 'parentheses'
  | 'triangle';

export interface NumericDisplayFormat {
  prefix: string;
  symbolLayout: 'attached' | 'edge';
  zeroDisplay: 'zero' | 'dash' | 'blank';
  emptyDisplay: 'blank' | 'dash';
  decimalPlaces?: number;
  negativeStyle?: NegativeCurrencyStyle;
}

export type TableNumericFormat = NumericDisplayFormat;

export interface RenderOutput {
  id: string;
  kind: 'text' | 'number' | 'boolean';
  label: string;
  value: RenderOutputValue;
  numericFormat?: NumericDisplayFormat;
  decimalPlaces?: number;
}

export interface TableColumn {
  id: string;
  label: string;
  key: string;
  width: number;
  valueType: 'text' | 'number' | 'currency' | 'date' | 'formula';
  align: TableColumnAlign;
  headerAlign?: TableColumnAlign;
  decimalPlaces?: number;
  formula?: TableFormula;
  numericFormat?: TableNumericFormat;
}

export interface TableFooter {
  id: string;
  label: string;
  formula: TableFormula;
  bold?: boolean;
  fontSize?: number;
  startColumnKey?: string;
  valueColumnKey?: string;
  outputFieldKey?: string;
  decimalPlaces?: number;
  numericFormat?: TableNumericFormat;
}

export interface ComputedTableFooter {
  id: string;
  label: string;
  value: number;
  bold: boolean;
  fontSize?: number;
  startColumnKey?: string;
  valueColumnKey?: string;
  outputFieldKey?: string;
  decimalPlaces?: number;
  numericFormat?: TableNumericFormat;
}

export interface TableFooterBandItem {
  footerId: string;
  width: number;
}

export interface TableFooterBand {
  enabled: boolean;
  label: string;
  startColumnKey?: string;
  leadWidth: number;
  headerHeight: number;
  valueHeight: number;
  items: TableFooterBandItem[];
}

export type TableFooterBorderPreset = 'inherit' | 'top' | 'outer' | 'all' | 'none' | 'custom';

export type TableFooterBorderEdge =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'horizontal'
  | 'vertical';

export interface TableFooterStyle {
  borderPreset: TableFooterBorderPreset;
  borderEdges?: TableFooterBorderEdge[];
  border: BorderStyle;
  background?: string;
  color?: string;
}

export interface TableLayoutCell {
  id: string;
  role: 'header' | 'body' | 'footer-label' | 'footer-value';
  box: ElementBox;
  text: string;
  textX: number;
  textY: number;
  textWidth: number;
  /** Final wrapped lines. Present for body text cells; DOM/PDF draw these verbatim. */
  lines?: TextLayoutLine[];
  prefixText?: string;
  prefixTextX?: number;
  prefixTextWidth?: number;
  lineHeightMm: number;
  fontSize: number;
  align: TableColumnAlign;
  color: string;
  backgroundColor?: string;
  bold: boolean;
  fontName?: string;
  syntheticBold?: boolean;
  rowIndex?: number;
  columnKey?: string;
  valueType?: TableColumn['valueType'];
}

export interface TableLayoutLine {
  from: { x: number; y: number };
  to: { x: number; y: number };
  border?: BorderStyle;
}

export interface TableLayout {
  cells: TableLayoutCell[];
  lines: TableLayoutLine[];
  height: number;
}

export interface TablePaginationOptions {
  /** Elements moved as one rigid block below the final table fragment. */
  finalElementIds: string[];
  /** Page decorations cloned onto every continuation page for this table. */
  repeatElementIds: string[];
  rowMode: 'compact' | 'preserve';
  minRowsOnLastPage: number;
  gapAfterTable: number;
  /** Optional title synthesized above continuation fragments. */
  continuation?: {
    title?: string;
    showFragmentIndex?: boolean;
  };
}

export interface TableFragmentSlice {
  rowStart: number;
  rowEnd: number;
  repeatHeader: boolean;
  includeFooter: boolean;
  /** True only on the final fragment: the following group is anchored below the table. */
  includeFinalGroup?: boolean;
  /** Blank rows to render so a 'preserve' table keeps its design height. */
  fillRows?: number;
}

export interface TableNode extends RenderNodeBase {
  kind: 'table';
  pagination?: TablePaginationOptions;
  formulaFields?: Record<string, number | string>;
  columns: TableColumn[];
  rows: TableValueRow[];
  computedRows: TableValueRow[];
  /** Runtime-only row measurements aligned with computedRows; never persisted. */
  rowHeights?: number[];
  /** Runtime-only reserved title height for every continuation fragment. */
  continuationTitleHeight?: number;
  formulaErrors?: TableFormulaEvaluationError[];
  footers: TableFooter[];
  footerBand?: TableFooterBand;
  footerStyle?: TableFooterStyle;
  showInlineFooter?: boolean;
  computedFooters: ComputedTableFooter[];
  layout: TableLayout;
  style: {
    headerHeight: number;
    rowHeight: number;
    fontSize: number;
    cellPadding?: number;
    headerBold?: boolean;
    border: BorderStyle;
    headerBackground: string;
    headerColor: string;
    bodyColor: string;
  };
  fragment?: TableFragmentSlice;
}

export interface GridColumn {
  id: string;
  key: string;
  width: number;
  numericFormat?: NumericDisplayFormat;
}

export interface GridRow {
  id: string;
  height?: number;
}

export type GridCellRole = 'header' | 'body' | 'footer';

export interface GridCell {
  content: string;
  role: GridCellRole;
  numericFormat?: NumericDisplayFormat;
  columnSpan?: number;
  rowSpan?: number;
  bold?: boolean;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  borders?: {
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
  };
  backgroundColor?: string;
  color?: string;
}

export interface ComputedGridCell extends GridCell {
  prefixText?: string;
}

export interface GridStyle {
  border: BorderStyle;
  headerHeight: number;
  rowHeight: number;
  fontSize: number;
  cellPadding?: number;
}

export interface GridLayoutCell {
  id: string;
  role: GridCellRole;
  box: ElementBox;
  lines: TextLayoutLine[];
  prefixLines?: TextLayoutLine[];
  lineHeightMm: number;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  color: string;
  backgroundColor?: string;
  bold: boolean;
  fontName?: string;
  syntheticBold?: boolean;
  overflow: boolean;
  borders: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}

export interface GridLayoutLine {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface GridLayout {
  cells: GridLayoutCell[];
  lines: GridLayoutLine[];
  height: number;
}

export interface GridNode extends RenderNodeBase {
  kind: 'grid';
  columns: GridColumn[];
  rows: GridRow[];
  cells: Record<string, GridCell>;
  computedCells: Record<string, ComputedGridCell>;
  outputBindings?: GridOutputBinding[];
  layout: GridLayout;
  style: GridStyle;
}

export interface GridOutputBinding {
  cellKey: string;
  source: ElementOutputRef;
  part: 'label' | 'value';
  labelMode?: 'source' | 'custom';
  customLabel?: string;
}

/**
 * Text painted by a custom plugin node. Plugins that draw text in PDF must
 * declare it here so font subsetting can collect the required glyphs.
 */
export interface PluginTextRun {
  text: string;
  fontName?: string;
}

/**
 * Extension node for third-party plugins. Core never interprets `payload`;
 * a renderer registered for `pluginType` is responsible for painting it.
 */
export interface PluginNode extends RenderNodeBase {
  kind: 'plugin';
  pluginType: string;
  payload: JsonValue;
  textRuns?: PluginTextRun[];
}

export type RenderNode =
  | TextNode
  | RectNode
  | EllipseNode
  | LineNode
  | ImageNode
  | TableNode
  | GridNode
  | PluginNode;
