import type { InputRecord } from '@/engine/core/input.js';
import type { TemplateFile } from '@/engine/core/document.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import type { PdfMetadata } from '@/engine/pdf/render/renderDocumentPdf.js';
import type {
  PdfPageRange,
  PdfProgressEvent,
} from '@/engine/pdf/render/renderDocumentPdf.js';
import { renderDocumentPdf } from '@/engine/pdf/render/renderDocumentPdf.js';
import { renderDocumentPdfInWorker, type PdfWorkerFactory } from '@/engine/pdf/render/pdfExportWorkerClient.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import type { PluginRegistry } from '@/engine/core/plugin.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';

export type PdfExecutionTarget = 'worker' | 'main-thread';

export interface DocumentSessionOptions {
  plugins: PluginRegistry;
  fontManager: PdfFontManager;
  pdfExecutionTarget: PdfExecutionTarget;
  pdfWorkerFactory?: PdfWorkerFactory;
  pdfRenderers?: PluginRendererRegistry<PdfNodeRenderContext>;
  format?: Partial<FormatLocaleSettings>;
  input?: InputRecord;
}

export interface GeneratePdfOptions {
  metadata?: PdfMetadata;
  subsetter?: boolean;
  /** 1-based inclusive page range. */
  pageRange?: PdfPageRange;
  /** Main-thread only. */
  signal?: AbortSignal;
  /** Main-thread only. */
  onProgress?: (event: PdfProgressEvent) => void;
  /** Treat warning-level render issues as fatal. */
  strict?: boolean;
}

export class DocumentSession {
  private input: InputRecord;
  private cachedPreview?: RenderDocument;
  private readonly template: TemplateFile;
  private readonly options: DocumentSessionOptions;

  constructor(template: TemplateFile, options: DocumentSessionOptions) {
    this.template = structuredClone(template);
    this.input = structuredClone(options.input ?? {});
    this.options = options;
  }

  fill(input: InputRecord): this {
    this.input = structuredClone(input);
    this.cachedPreview = undefined;
    return this;
  }

  preview(): RenderDocument {
    if (this.cachedPreview) return this.cachedPreview;
    const logical = resolveRenderTree({
      file: this.template,
      input: this.input,
      plugins: this.options.plugins,
      fontManager: this.options.fontManager,
      format: this.options.format,
    });
    this.cachedPreview = layoutRenderTree(logical, { fontManager: this.options.fontManager });
    return this.cachedPreview;
  }

  async generatePdf(options: GeneratePdfOptions = {}): Promise<Uint8Array> {
    const document = this.preview();
    const args = {
      document,
      file: this.template,
      fontManager: this.options.fontManager,
      metadata: options.metadata,
      subsetter: options.subsetter,
      pageRange: options.pageRange,
      signal: options.signal,
      onProgress: options.onProgress,
      strict: options.strict,
      pdfRenderers: this.options.pdfRenderers,
    };
    if (this.options.pdfExecutionTarget === 'main-thread') return renderDocumentPdf(args);
    if (options.onProgress || options.signal) {
      throw new Error(
        'onProgress and signal are only supported with pdfExecutionTarget: "main-thread".',
      );
    }
    if (!this.options.pdfWorkerFactory) {
      throw new Error('A pdfWorkerFactory is required when pdfExecutionTarget is "worker".');
    }
    if (document.pages.some(page => page.nodes.some(node => node.kind === 'plugin'))) {
      throw new Error(
        'Custom plugin nodes cannot be rendered in worker mode because renderers are not serializable. '
        + 'Use pdfExecutionTarget: "main-thread", or bundle the same plugin renderers into the worker.',
      );
    }
    return renderDocumentPdfInWorker(args, this.options.pdfWorkerFactory);
  }
}
