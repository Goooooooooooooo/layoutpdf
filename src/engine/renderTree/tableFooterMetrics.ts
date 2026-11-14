import { pdfPtToMm } from '@/engine/utils/units.js';

/**
 * Height of one inline footer row. The table style's row height stays the floor so
 * existing templates keep their measured layout; an explicitly larger footer font
 * grows the row enough to contain its line box and padding instead of clipping it.
 */
export function tableFooterRowHeight(args: {
  rowHeight: number;
  baseFontSize: number;
  fontSize?: number;
  cellPadding: number;
}): number {
  const fontSize = args.fontSize ?? args.baseFontSize;
  if (!(fontSize > args.baseFontSize)) return args.rowHeight;
  const lineHeight = pdfPtToMm(fontSize * 1.2) + Math.max(0, args.cellPadding) * 2;
  return Math.max(args.rowHeight, lineHeight);
}
