import {
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rotateRadians,
  translate,
  type PDFPage,
} from 'pdf-lib';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { RenderNode } from '@/engine/renderTree/model.js';

export async function withNodeGraphicsState(
  page: PDFPage,
  node: RenderNode,
  draw: () => Promise<void> | void,
): Promise<void> {
  const pageHeight = page.getHeight();
  const left = mmToPdfPt(node.box.x);
  const bottom = pageHeight - mmToPdfPt(node.box.y + node.box.height);
  const width = mmToPdfPt(node.box.width);
  const height = mmToPdfPt(node.box.height);
  const operators = [pushGraphicsState()];

  if (node.rotate) {
    const centerX = left + width / 2;
    const centerY = bottom + height / 2;
    operators.push(
      translate(centerX, centerY),
      rotateRadians(-node.rotate * Math.PI / 180),
      translate(-centerX, -centerY),
    );
  }

  if (node.clip) {
    operators.push(rectangle(left, bottom, width, height), clip(), endPath());
  }

  page.pushOperators(...operators);
  try {
    await draw();
  } finally {
    page.pushOperators(popGraphicsState());
  }
}
