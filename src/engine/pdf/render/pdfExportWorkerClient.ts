import type { RenderDocumentPdfArgs } from '@/engine/pdf/render/renderDocumentPdf.js';
import { collectUsedCodePointsByFont } from '@/engine/pdf/font/collectUsedCodePoints.js';

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

export type PdfWorkerFactory = () => Worker;

/**
 * Creates a module worker for `layoutpdf/pdf/worker`.
 *
 * Most bundlers require the URL to be resolvable by the bundler itself, so
 * prefer the bundler-specific factory (for example Vite's `?worker` import).
 */
export function createPdfWorker(url: string | URL): Worker {
  return new Worker(url, { type: 'module' });
}

let worker: Worker | null = null;

function getWorker(createWorker: PdfWorkerFactory): Worker {
  if (!worker) worker = createWorker();
  return worker;
}

export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
}

export async function renderDocumentPdfInWorker(
  args: RenderDocumentPdfArgs,
  createWorker: PdfWorkerFactory,
): Promise<Uint8Array> {
  const { fontManager, ...rest } = args;
  const fontEntries: WorkerRequest['fontEntries'] = {};
  const defaultName = fontManager.getDefaultFontName();
  const usedFontNames = new Set([
    defaultName,
    ...collectUsedCodePointsByFont(rest.document, defaultName).keys(),
  ]);
  for (const name of usedFontNames) {
    fontEntries[name] = {
      bytes: fontManager.getFontBytes(name).slice(),
      fallback: name === defaultName,
    };
  }

  const targetWorker = getWorker(createWorker);
  return new Promise<Uint8Array>((resolve, reject) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      targetWorker.removeEventListener('message', handler);
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.bytes) resolve(event.data.bytes);
      else reject(new Error('Worker returned no data.'));
    };
    targetWorker.addEventListener('message', handler);

    const transferables = Object.values(fontEntries).map(entry => entry.bytes.buffer);
    targetWorker.postMessage({
      document: rest.document,
      file: rest.file,
      fontEntries,
      metadata: rest.metadata,
      subsetter: rest.subsetter,
      pageRange: rest.pageRange,
      strict: rest.strict,
    } satisfies WorkerRequest, transferables);
  });
}
