/**
 * PDF export worker entry.
 *
 * Consumers create a module worker pointing at this entry:
 *
 * ```ts
 * import PdfWorker from 'layoutpdf/pdf/worker?worker';
 * const engine = await createDefaultEngine({
 *   pdfExecutionTarget: 'worker',
 *   pdfWorkerFactory: () => new PdfWorker(),
 * });
 * ```
 */
import '@/engine/pdf/render/pdfExportWorker.js';
