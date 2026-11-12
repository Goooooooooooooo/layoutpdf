import { rgb } from 'pdf-lib';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { RectNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';

export function renderRectPdf(node: RectNode, context: PdfNodeRenderContext): void {
  const fill = node.fill ? hex2Rgb(node.fill) : null;
  const borderWidth = node.border && node.border.width > 0 ? node.border.width : 0;
  const borderRgb = borderWidth > 0 ? hex2Rgb(node.border!.color) : null;
  const borderColor = borderRgb ? rgb(borderRgb.r, borderRgb.g, borderRgb.b) : undefined;
  const borderDashArray = borderRgb && node.border!.style === 'dashed'
    ? [4, 3]
    : borderRgb && node.border!.style === 'dotted' ? [1, 2] : undefined;
  context.page.drawRectangle({
    x: mmToPdfPt(node.box.x),
    y: context.page.getHeight() - mmToPdfPt(node.box.y + node.box.height),
    width: mmToPdfPt(node.box.width),
    height: mmToPdfPt(node.box.height),
    color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
    borderColor,
    borderWidth,
    borderDashArray,
    opacity: node.opacity,
    borderOpacity: node.opacity,
  });
}
