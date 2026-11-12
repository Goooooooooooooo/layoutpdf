import { PDFDocument, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import type { TemplateFile } from '@/engine/core/document.js';
import { LayoutPDFValidationError } from '@/engine/utils/errors.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import { decodeBase64Asset } from '@/engine/utils/assets.js';
import { fontkit } from '@/engine/pdf/font/fontkitRuntime.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { PluginNode, RenderDocument, RenderPage } from '@/engine/renderTree/model.js';
import { createPluginRendererRegistry, type PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import { renderNodePdf } from '@/engine/pdf/render/renderNode.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';
import {
  collectRenderedText,
  collectUsedCodePointsByFont,
} from '@/engine/pdf/font/collectUsedCodePoints.js';
import { subsetFontBytes } from '@/engine/pdf/font/subsetFont.js';
import { assertCffCharsetIdentity } from '@/engine/pdf/font/cffCharset.js';
import { createUnicodeAwareFontkit } from '@/engine/pdf/font/unicodeAwareFontkit.js';

const DEFAULT_PDF_CREATOR = 'LayoutPDF';
const DEFAULT_PDF_PRODUCER = 'LayoutPDF PDF Renderer';

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  language?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

/** 1-based inclusive page range. */
export type PdfPageRange = readonly [start: number, end: number];

export interface PdfProgressEvent {
  phase: 'prepare' | 'render' | 'save';
  /** Number of pages in this export. */
  pageCount: number;
  /** Number of pages completed so far. */
  completedPages: number;
  /** 1-based page number within the exported range. Present during render. */
  page?: number;
}

export interface RenderDocumentPdfArgs {
  document: RenderDocument;
  file: TemplateFile;
  fontManager: PdfFontManager;
  metadata?: PdfMetadata;
  subsetter?: boolean;
  /** 1-based inclusive page range. Defaults to every page. */
  pageRange?: PdfPageRange;
  /** Aborts between pages and nodes. Main-thread only. */
  signal?: AbortSignal;
  /** Progress callback. Main-thread only. */
  onProgress?: (event: PdfProgressEvent) => void;
  /** Treat warning-level render issues as fatal. */
  strict?: boolean;
  /** Custom renderers for plugin nodes. An empty registry is used by default. */
  pdfRenderers?: PluginRendererRegistry<PdfNodeRenderContext>;
}

function assertRenderable(document: RenderDocument, strict = false): void {
  const blocking = document.issues.filter(issue =>
    issue.severity === 'error' || (strict && issue.severity === 'warning'));
  if (blocking.length > 0) {
    throw new LayoutPDFValidationError(
      strict ? 'RenderDocument contains blocking issues' : 'RenderDocument contains errors',
      blocking,
    );
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  throw new Error('PDF export aborted.');
}

function selectPageIndices(document: RenderDocument, pageRange?: PdfPageRange): number[] {
  const total = document.pages.length;
  if (!pageRange) return document.pages.map((_, index) => index);

  const [start, end] = pageRange;
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new RangeError('pageRange must contain integer page numbers.');
  }
  if (start < 1 || end < start) {
    throw new RangeError(`Invalid pageRange [${start}, ${end}].`);
  }
  if (end > total) {
    throw new RangeError(`pageRange end ${end} exceeds document page count ${total}.`);
  }

  const indices: number[] = [];
  for (let page = start; page <= end; page += 1) indices.push(page - 1);
  return indices;
}

async function createPage(
  target: PDFDocument,
  page: RenderPage,
  backgroundPage?: PDFPage,
) {
  if (page.background.kind === 'pdf') {
    if (!backgroundPage) throw new Error(`Prepared PDF background is missing for page ${page.id}.`);
    target.addPage(backgroundPage);
    return backgroundPage;
  }

  const created = target.addPage([
    mmToPdfPt(page.size.width),
    mmToPdfPt(page.size.height),
  ]);
  if (page.background.color) {
    const hex = page.background.color.replace('#', '');
    const normalized = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      throw new Error(`Invalid hex color: ${page.background.color}`);
    }
    const value = Number.parseInt(normalized, 16);
    created.drawRectangle({
      x: 0,
      y: 0,
      width: created.getWidth(),
      height: created.getHeight(),
      color: rgb(
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255,
      ),
    });
  }
  return created;
}

interface PdfBackgroundRequest {
  renderPageIndex: number;
  sourcePageIndex: number;
  renderPageId: string;
}

async function preparePdfBackgroundPages(
  target: PDFDocument,
  document: RenderDocument,
  file: TemplateFile,
): Promise<Map<number, PDFPage>> {
  const requestsByAsset = new Map<string, PdfBackgroundRequest[]>();
  document.pages.forEach((page, renderPageIndex) => {
    if (page.background.kind !== 'pdf') return;
    const assetId = page.background.assetId;
    if (!assetId) throw new Error(`PDF background asset is missing for page ${page.id}.`);
    const requests = requestsByAsset.get(assetId) ?? [];
    requests.push({
      renderPageIndex,
      sourcePageIndex: page.background.pageIndex ?? 0,
      renderPageId: page.id,
    });
    requestsByAsset.set(assetId, requests);
  });

  const prepared = new Map<number, PDFPage>();
  for (const [assetId, requests] of requestsByAsset) {
    const asset = file.assets[assetId];
    if (!asset || asset.kind !== 'pdf') throw new Error(`PDF background asset not found: ${assetId}`);
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(decodeBase64Asset(asset), { updateMetadata: false });
    } catch (error) {
      console.warn(`Failed to load PDF background "${asset.name}":`, error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`PDF background "${asset.name}" is encrypted, password-protected, or structurally unsupported. Please use an unprotected PDF.`);
    }
    const pageCount = source.getPageCount();
    const requestsBySourcePage = new Map<number, PdfBackgroundRequest[]>();
    for (const request of requests) {
      if (request.sourcePageIndex < 0 || request.sourcePageIndex >= pageCount) {
        throw new Error(
          `PDF background page index ${request.sourcePageIndex} is out of range for page ${request.renderPageId}.`,
        );
      }
      const grouped = requestsBySourcePage.get(request.sourcePageIndex) ?? [];
      grouped.push(request);
      requestsBySourcePage.set(request.sourcePageIndex, grouped);
    }

    const groups = [...requestsBySourcePage.entries()];
    const copyRounds = Math.max(...groups.map(([, grouped]) => grouped.length));
    for (let round = 0; round < copyRounds; round += 1) {
      const roundRequests = groups.flatMap(([sourcePageIndex, grouped]) => {
        const request = grouped[round];
        return request ? [{ sourcePageIndex, request }] : [];
      });
      let copiedPages: PDFPage[];
      try {
        copiedPages = await target.copyPages(source, roundRequests.map(item => item.sourcePageIndex));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to copy PDF background "${asset.name}": ${reason}`);
      }
      roundRequests.forEach(({ request }, index) => {
        prepared.set(request.renderPageIndex, copiedPages[index]);
      });
    }
  }
  return prepared;
}

function applyMetadata(pdfDoc: PDFDocument, file: TemplateFile, metadata: PdfMetadata): void {
  const templateMetadata = file.template.metadata ?? {};
  const title = metadata.title ?? templateMetadata.title ?? file.template.name;
  const author = metadata.author ?? templateMetadata.author;
  const subject = metadata.subject ?? templateMetadata.subject;
  const language = metadata.language ?? templateMetadata.language;
  const creator = metadata.creator ?? DEFAULT_PDF_CREATOR;
  const producer = metadata.producer ?? DEFAULT_PDF_PRODUCER;
  if (title !== undefined) pdfDoc.setTitle(title, { showInWindowTitleBar: true });
  if (author !== undefined) pdfDoc.setAuthor(author);
  if (subject !== undefined) pdfDoc.setSubject(subject);
  if (metadata.keywords !== undefined) pdfDoc.setKeywords(metadata.keywords);
  if (language !== undefined) pdfDoc.setLanguage(language);
  pdfDoc.setCreator(creator);
  pdfDoc.setProducer(producer);
  if (metadata.creationDate !== undefined) pdfDoc.setCreationDate(metadata.creationDate);
  if (metadata.modificationDate !== undefined) pdfDoc.setModificationDate(metadata.modificationDate);
}

export async function renderDocumentPdf(args: RenderDocumentPdfArgs): Promise<Uint8Array> {
  const pageIndices = selectPageIndices(args.document, args.pageRange);
  const scopedDocument: RenderDocument = {
    ...args.document,
    pages: pageIndices.map(index => args.document.pages[index]),
  };
  const pageCount = scopedDocument.pages.length;

  assertRenderable(scopedDocument, args.strict);
  throwIfAborted(args.signal);
  args.onProgress?.({ phase: 'prepare', pageCount, completedPages: 0 });

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(createUnicodeAwareFontkit(
    fontkit,
    collectRenderedText(scopedDocument),
  ));

  let restoreFont: (() => void) | null = null;
  if (args.subsetter) {
    restoreFont = await applySubset({ ...args, document: scopedDocument });
  }

  try {
    const imageCache = new Map<string, Promise<PDFImage>>();
    const pluginRenderers = args.pdfRenderers
      ?? createPluginRendererRegistry<PdfNodeRenderContext>([]);
    const missingRenderers = scopedDocument.pages.flatMap(page =>
      page.nodes
        .filter((node): node is PluginNode =>
          node.kind === 'plugin' && !pluginRenderers.has(node.pluginType))
        .map(node => ({
          severity: 'error' as const,
          code: 'MISSING_PLUGIN_RENDERER',
          message: `No renderer is registered for plugin type: ${node.pluginType}`,
          pageId: page.id,
          elementId: node.sourceElementId,
        })),
    );
    if (missingRenderers.length > 0) {
      throw new LayoutPDFValidationError('Missing plugin renderers', missingRenderers);
    }
    const backgroundPages = await preparePdfBackgroundPages(pdfDoc, scopedDocument, args.file);

    for (let pageIndex = 0; pageIndex < scopedDocument.pages.length; pageIndex += 1) {
      throwIfAborted(args.signal);
      const renderPage = scopedDocument.pages[pageIndex];
      args.onProgress?.({
        phase: 'render',
        page: pageIndex + 1,
        pageCount,
        completedPages: pageIndex,
      });
      const page = await createPage(pdfDoc, renderPage, backgroundPages.get(pageIndex));
      const nodes = [...renderPage.nodes].sort((a, b) => a.zIndex - b.zIndex);
      for (const node of nodes) {
        throwIfAborted(args.signal);
        try {
          await renderNodePdf(node, {
            pdfDoc,
            page,
            fontManager: args.fontManager,
            assets: args.file.assets,
            imageCache,
            pluginRenderers,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to render element ${node.sourceElementId} on page ${renderPage.id}: ${reason}`);
        }
      }
    }

    throwIfAborted(args.signal);
    args.onProgress?.({ phase: 'save', pageCount, completedPages: pageCount });
    applyMetadata(pdfDoc, args.file, args.metadata ?? {});
    return pdfDoc.save();
  } finally {
    restoreFont?.();
  }
}

async function applySubset(args: RenderDocumentPdfArgs): Promise<(() => void) | null> {
  const originals = new Map<string, Uint8Array>();
  try {
    const defaultName = args.fontManager.getDefaultFontName();
    const codepointsByFont = collectUsedCodePointsByFont(args.document, defaultName);
    for (const [name, codepoints] of codepointsByFont) {
      const originalBytes = args.fontManager.getFontBytes(name);
      originals.set(name, originalBytes);
      const subset = await subsetFontBytes(originalBytes, codepoints);
      fontkit.create(subset);
      assertCffCharsetIdentity(subset, name);
      args.fontManager.replaceFontBytes(name, subset);
    }
    return () => {
      for (const [name, bytes] of originals) args.fontManager.replaceFontBytes(name, bytes);
    };
  } catch (e) {
    for (const [name, bytes] of originals) args.fontManager.replaceFontBytes(name, bytes);
    console.warn('Font subsetting failed, fallback to full embed:', e);
    return null;
  }
}
