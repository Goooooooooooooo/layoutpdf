import type {
  AnyLayoutPDFPlugin,
  DomPluginRenderContext,
  PluginRegistry,
} from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import {
  collectPluginRenderers,
  createPluginRendererRegistry,
  type PluginRendererContribution,
  type PluginRendererRegistry,
} from '@/engine/core/pluginRendererRegistry.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';
import type { TemplateFile } from '@/engine/core/document.js';
import type { InputRecord } from '@/engine/core/input.js';
import { DocumentSession, type PdfExecutionTarget } from '@/engine/documentSession.js';
import { TemplateBuilder, type TemplateBuilderOptions } from '@/engine/templateBuilder.js';
import type { PdfWorkerFactory } from '@/engine/pdf/render/pdfExportWorkerClient.js';
import { parseTemplateJson, stringifyTemplateJson, type StringifyTemplateJsonOptions } from '@/engine/templateJson.js';

export interface CreateEngineOptions {
  fontManager: PdfFontManager;
  plugins: PluginRegistry | readonly AnyLayoutPDFPlugin[];
  pdfExecutionTarget?: PdfExecutionTarget;
  pdfWorkerFactory?: PdfWorkerFactory;
  /**
   * Additional or replacement PDF renderers for `kind: 'plugin'` nodes.
   * Entries here override renderers contributed by plugins with the same type.
   */
  pdfRenderers?: readonly PluginRendererContribution<PdfNodeRenderContext>[];
  /**
   * Additional or replacement DOM renderers for `kind: 'plugin'` nodes.
   * React previews expect these renderers to return a ReactNode.
   */
  domRenderers?: readonly PluginRendererContribution<DomPluginRenderContext>[];
  /**
   * Document-level locale/currency/time-zone overrides. Template metadata
   * provides the base values.
   */
  format?: Partial<FormatLocaleSettings>;
}

function toPluginRegistry(
  plugins: PluginRegistry | readonly AnyLayoutPDFPlugin[],
): PluginRegistry {
  if (!Array.isArray(plugins)
    && typeof (plugins as PluginRegistry).validateElement === 'function') {
    return plugins as PluginRegistry;
  }
  return createPluginRegistry(plugins as readonly AnyLayoutPDFPlugin[]);
}

export class DocumentEngine {
  readonly plugins: PluginRegistry;
  readonly fontManager: PdfFontManager;
  readonly pdfExecutionTarget: PdfExecutionTarget;
  readonly pdfRenderers: PluginRendererRegistry<PdfNodeRenderContext>;
  readonly domRenderers: PluginRendererRegistry<DomPluginRenderContext>;
  readonly format?: Partial<FormatLocaleSettings>;
  private readonly pdfWorkerFactory?: PdfWorkerFactory;

  constructor(options: CreateEngineOptions) {
    this.plugins = toPluginRegistry(options.plugins);
    this.fontManager = options.fontManager;
    this.pdfExecutionTarget = options.pdfExecutionTarget ?? 'main-thread';
    this.pdfWorkerFactory = options.pdfWorkerFactory;
    this.format = options.format;
    this.pdfRenderers = createPluginRendererRegistry<PdfNodeRenderContext>([
      ...collectPluginRenderers<PdfNodeRenderContext>(this.plugins.list(), 'pdf'),
      ...(options.pdfRenderers ?? []),
    ], { onDuplicate: 'override' });
    this.domRenderers = createPluginRendererRegistry<DomPluginRenderContext>([
      ...collectPluginRenderers<DomPluginRenderContext>(this.plugins.list(), 'dom'),
      ...(options.domRenderers ?? []),
    ], { onDuplicate: 'override' });
  }

  createTemplate(options: TemplateBuilderOptions = {}): TemplateBuilder {
    return new TemplateBuilder(this.plugins, options);
  }

  parseTemplateJson(json: string): TemplateFile {
    return parseTemplateJson(json);
  }

  stringifyTemplateJson(template: TemplateFile, options: StringifyTemplateJsonOptions = {}): string {
    return stringifyTemplateJson(template, options);
  }

  createDocumentFromJson(json: string, input: InputRecord = {}): DocumentSession {
    return this.createDocument(this.parseTemplateJson(json), input);
  }

  createDocument(template: TemplateFile, input: InputRecord = {}): DocumentSession {
    return new DocumentSession(template, {
      plugins: this.plugins,
      fontManager: this.fontManager,
      pdfExecutionTarget: this.pdfExecutionTarget,
      pdfWorkerFactory: this.pdfWorkerFactory,
      pdfRenderers: this.pdfRenderers,
      format: this.format,
      input,
    });
  }
}

export function createEngine(options: CreateEngineOptions): DocumentEngine {
  return new DocumentEngine(options);
}
