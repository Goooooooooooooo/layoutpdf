import type { RenderDocumentPdfArgs } from '@/engine/pdf/render/renderDocumentPdf.js';
import type { LayoutPDFFont } from '@/engine/utils/fontTypes.js';
import { createFontManager, type PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import { renderDocumentPdf } from '@/engine/pdf/render/renderDocumentPdf.js';

interface WorkerRequest {
  document: RenderDocumentPdfArgs['document'];
  file: RenderDocumentPdfArgs['file'];
  fontEntries: Record<string, { bytes: Uint8Array; fallback?: boolean; subset?: boolean }>;
  metadata?: RenderDocumentPdfArgs['metadata'];
  subsetter?: boolean;
  pageRange?: RenderDocumentPdfArgs['pageRange'];
  strict?: boolean;
}

interface WorkerResponse {
  bytes?: Uint8Array;
  error?: string;
}

function buildFontManager(fontEntries: WorkerRequest['fontEntries']): PdfFontManager {
  const fonts: LayoutPDFFont = {};
  for (const [name, entry] of Object.entries(fontEntries)) {
    fonts[name] = {
      data: entry.bytes,
      fallback: entry.fallback,
      subset: entry.subset,
    };
  }
  return createFontManager(fonts);
}

const workerSelf = typeof self !== 'undefined' && typeof document === 'undefined'
  ? self as unknown as Worker
  : null;

if (workerSelf) workerSelf.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { document, file, fontEntries, metadata, subsetter, pageRange, strict } = event.data;
  try {
    const fontManager = buildFontManager(fontEntries);
    const bytes = await renderDocumentPdf({
      document,
      file,
      fontManager,
      metadata,
      subsetter,
      pageRange,
      strict,
    });
    workerSelf.postMessage({ bytes } satisfies WorkerResponse, [bytes.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerSelf.postMessage({ error: message } satisfies WorkerResponse);
  }
};
