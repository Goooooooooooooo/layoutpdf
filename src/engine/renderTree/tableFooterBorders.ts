import type {
  TableFooterBorderEdge,
  TableFooterBorderPreset,
  TableFooterStyle,
} from './model.js';

export const TABLE_FOOTER_BORDER_EDGES: TableFooterBorderEdge[] = [
  'top',
  'bottom',
  'left',
  'right',
  'horizontal',
  'vertical',
];

const PRESET_EDGES: Record<
  Exclude<TableFooterBorderPreset, 'inherit' | 'custom'>,
  TableFooterBorderEdge[]
> = {
  top: ['top'],
  outer: ['top', 'bottom', 'left', 'right'],
  all: [...TABLE_FOOTER_BORDER_EDGES],
  none: [],
};

export function resolveTableFooterBorderEdges(
  style: TableFooterStyle,
): TableFooterBorderEdge[] {
  if (style.borderPreset === 'inherit') return [];
  if (style.borderPreset === 'custom') {
    const selected = new Set(style.borderEdges ?? []);
    return TABLE_FOOTER_BORDER_EDGES.filter(edge => selected.has(edge));
  }
  return [...PRESET_EDGES[style.borderPreset]];
}

export function toggleTableFooterBorderEdge(
  style: TableFooterStyle,
  edge: TableFooterBorderEdge,
): TableFooterStyle {
  const selected = new Set(resolveTableFooterBorderEdges(style));
  if (selected.has(edge)) selected.delete(edge);
  else selected.add(edge);
  return {
    ...style,
    borderPreset: 'custom',
    borderEdges: TABLE_FOOTER_BORDER_EDGES.filter(candidate => selected.has(candidate)),
  };
}
