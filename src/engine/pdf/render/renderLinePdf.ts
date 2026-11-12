import { rgb } from 'pdf-lib';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { LineNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';

export function renderLinePdf(node: LineNode, context: PdfNodeRenderContext): void {
  const color = hex2Rgb(node.color);
  const pageHeight = context.page.getHeight();
  context.page.drawLine({
    start: {
      x: mmToPdfPt(node.box.x + node.from.x),
      y: pageHeight - mmToPdfPt(node.box.y + node.from.y),
    },
    end: {
      x: mmToPdfPt(node.box.x + node.to.x),
      y: pageHeight - mmToPdfPt(node.box.y + node.to.y),
    },
    thickness: node.width,
    color: rgb(color.r, color.g, color.b),
    dashArray: node.style === 'dashed' ? [4, 3] : node.style === 'dotted' ? [1, 2] : undefined,
    opacity: node.opacity,
  });
}
