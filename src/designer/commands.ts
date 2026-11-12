import type { TemplateFile } from '@/engine/core/document.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import type { GeneratePdfOptions } from '@/engine/documentSession.js';

/** Imperative API exposed through `Designer`'s React ref. */
export interface DesignerCommandApi {
  /** Current template, including unsaved edits. */
  getTemplate(): TemplateFile;
  /** Replaces the edited template. */
  loadTemplate(template: TemplateFile): void;
  /** Serialized template JSON. */
  exportJson(options?: { space?: number }): string;
  /** Builds the current render tree without switching the editor mode. */
  preview(): RenderDocument;
  /** Generates a PDF from the current template and active input record. */
  generatePdf(options?: GeneratePdfOptions): Promise<Uint8Array>;
  /** Persists through `storageAdapter` or `onTemplateChange`. */
  saveTemplate(): Promise<void>;
}
