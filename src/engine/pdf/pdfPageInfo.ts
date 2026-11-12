import { assertPageCountWithinLimit } from '@/engine/utils/limits.js';

export interface PdfPageSize {
  width: number;
  height: number;
}

export interface PdfPageInfo {
  pageCount: number;
  pageSizes: PdfPageSize[];
}

export function copyPdfDataForWorker(data: Uint8Array): Uint8Array {
  return data.slice();
}

export async function getPdfPageInfo(data: Uint8Array): Promise<PdfPageInfo> {
  const { pdfjsLib } = await import('./pdfjs.js');
  const loadingTask = pdfjsLib.getDocument({ data: copyPdfDataForWorker(data) });
  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    assertPageCountWithinLimit(pageCount, 'PDF');
    const pageSizes: PdfPageSize[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      pageSizes.push({
        width: viewport.width * 25.4 / 72,
        height: viewport.height * 25.4 / 72,
      });
    }
    return { pageCount, pageSizes };
  } finally {
    await loadingTask.destroy();
  }
}
