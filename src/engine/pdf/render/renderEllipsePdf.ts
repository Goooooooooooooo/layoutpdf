import { rgb } from 'pdf-lib';
import { hex2Rgb } from '@/engine/utils/color.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { EllipseNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';

export function renderEllipsePdf(node: EllipseNode, context: PdfNodeRenderContext): void {
  const fill = node.fill ? hex2Rgb(node.fill) : null;
  const border = node.border ? hex2Rgb(node.border.color) : null;
  const xScale = mmToPdfPt(node.box.width) / 2;
  const yScale = mmToPdfPt(node.box.height) / 2;
  context.page.drawEllipse({
    x: mmToPdfPt(node.box.x) + xScale,
    y: context.page.getHeight() - mmToPdfPt(node.box.y) - yScale,
    xScale,
    yScale,
    color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
    borderColor: border ? rgb(border.r, border.g, border.b) : undefined,
    borderWidth: node.border?.width,
    borderDashArray: node.border?.style === 'dashed'
      ? [4, 3]
      : node.border?.style === 'dotted' ? [1, 2] : undefined,
    opacity: node.opacity,
    borderOpacity: node.opacity,
  });
}
