import type { TemplateAsset } from '@/engine/core/document.js';
import { decodeBase64Asset } from '@/engine/utils/assets.js';

interface PdfJsRenderTask {
  promise: Promise<unknown>;
  cancel(): void;
}

interface PdfJsPage {
  getViewport(options: { scale: number }): { width: number };
  render(options: { canvas: HTMLCanvasElement; viewport: unknown }): PdfJsRenderTask;
}

interface PdfJsDocument {
  getPage(pageNumber: number): Promise<PdfJsPage>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
  destroy(): Promise<void>;
}

interface PdfCanvasDocumentEntry {
  users: number;
  destroyed: boolean;
  releaseTimer?: ReturnType<typeof setTimeout>;
  loadingTask: Promise<PdfJsLoadingTask>;
  document: Promise<PdfJsDocument>;
}

interface PdfCanvasDocumentHandle {
  document: Promise<PdfJsDocument>;
  release(): void;
}

const documentCache = new WeakMap<TemplateAsset, PdfCanvasDocumentEntry>();

function createDocumentEntry(asset: TemplateAsset): PdfCanvasDocumentEntry {
  const loadingTask = import('@/engine/pdf/pdfjs.js').then(({ pdfjsLib }) =>
    pdfjsLib.getDocument({ data: decodeBase64Asset(asset) }) as unknown as PdfJsLoadingTask
  );
  const entry: PdfCanvasDocumentEntry = {
    users: 0,
    destroyed: false,
    loadingTask,
    document: loadingTask.then(task => task.promise),
  };
  entry.document.catch(() => {
    destroyDocumentEntry(asset, entry);
  });
  return entry;
}

function destroyDocumentEntry(asset: TemplateAsset, entry: PdfCanvasDocumentEntry): void {
  if (entry.destroyed) return;
  entry.destroyed = true;
  if (documentCache.get(asset) === entry) documentCache.delete(asset);
  void entry.loadingTask.then(task => task.destroy()).catch(() => undefined);
}

export function acquirePdfCanvasDocument(asset: TemplateAsset): PdfCanvasDocumentHandle {
  let entry = documentCache.get(asset);
  if (!entry) {
    entry = createDocumentEntry(asset);
    documentCache.set(asset, entry);
  }
  if (entry.releaseTimer !== undefined) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = undefined;
  }
  entry.users += 1;
  let released = false;

  return {
    document: entry.document,
    release() {
      if (released) return;
      released = true;
      entry.users -= 1;
      if (entry.users > 0) return;
      entry.releaseTimer = setTimeout(() => {
        if (entry.users > 0 || documentCache.get(asset) !== entry) return;
        destroyDocumentEntry(asset, entry);
      }, 0);
    },
  };
}

export async function renderPdfPageToCanvas(
  documentPromise: Promise<PdfJsDocument>,
  pageIndex: number,
  canvasElement: HTMLCanvasElement,
  widthPx: number,
  heightPx: number,
  signal?: AbortSignal,
): Promise<void> {
  const doc = await documentPromise;
  if (signal?.aborted) return;
  const page = await doc.getPage(pageIndex + 1);
  if (signal?.aborted) return;
  const dpr = window.devicePixelRatio || 1;
  canvasElement.width = Math.round(widthPx * dpr);
  canvasElement.height = Math.round(heightPx * dpr);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = widthPx / baseViewport.width;
  const viewport = page.getViewport({ scale: scale * dpr });
  const renderTask = page.render({ canvas: canvasElement, viewport });
  const cancel = () => renderTask.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await renderTask.promise;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
