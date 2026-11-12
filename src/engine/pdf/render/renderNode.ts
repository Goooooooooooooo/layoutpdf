import type { RenderNode } from '@/engine/renderTree/model.js';
import { withNodeGraphicsState } from '@/engine/pdf/render/graphicsState.js';
import { renderImagePdf } from '@/engine/pdf/render/renderImagePdf.js';
import { renderEllipsePdf } from '@/engine/pdf/render/renderEllipsePdf.js';
import { renderLinePdf } from '@/engine/pdf/render/renderLinePdf.js';
import { renderRectPdf } from '@/engine/pdf/render/renderRectPdf.js';
import { renderTextPdf } from '@/engine/pdf/render/renderTextPdf.js';
import { renderGridPdf } from '@/engine/pdf/render/renderGridPdf.js';
import { renderTablePdf } from '@/engine/pdf/render/renderTablePdf.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';

export async function renderNodePdf(node: RenderNode, context: PdfNodeRenderContext): Promise<void> {
  await withNodeGraphicsState(context.page, node, async () => {
    switch (node.kind) {
      case 'text':
        await renderTextPdf(node, context);
        return;
      case 'rect':
        renderRectPdf(node, context);
        return;
      case 'ellipse':
        renderEllipsePdf(node, context);
        return;
      case 'line':
        renderLinePdf(node, context);
        return;
      case 'image':
        await renderImagePdf(node, context);
        return;
      case 'grid':
        await renderGridPdf(node, context);
        return;
      case 'table':
        await renderTablePdf(node, context);
        return;
      case 'plugin': {
        const renderer = context.pluginRenderers.require(node.pluginType);
        await renderer(node, context);
        return;
      }
    }
  });
}
