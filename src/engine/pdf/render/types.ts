import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import type { TemplateAsset } from '@/engine/core/document.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';

export interface PdfNodeRenderContext {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fontManager: PdfFontManager;
  assets: Record<string, TemplateAsset>;
  imageCache: Map<string, Promise<PDFImage>>;
  /** Custom renderers for `kind: 'plugin'` nodes, keyed by plugin type. */
  pluginRenderers: PluginRendererRegistry<PdfNodeRenderContext>;
}
