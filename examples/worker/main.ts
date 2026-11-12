import { createDefaultEngine } from '../../dist/index.js';
import PdfWorker from './worker-entry?worker';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const generateButton = document.querySelector<HTMLButtonElement>('#generate')!;
const pdfFrame = document.querySelector<HTMLIFrameElement>('#pdf')!;

async function main() {
  // Vite bundles `worker-entry?worker` into a module worker chunk.
  // Other bundlers can use `createPdfWorker(new URL('.../pdf-worker.js', import.meta.url))`.
  const engine = await createDefaultEngine({
    pdfExecutionTarget: 'worker',
    pdfWorkerFactory: () => new PdfWorker(),
  });

  const template = engine.createTemplate({ name: 'Worker PDF' })
    .addElement('label', {
      x: 18,
      y: 18,
      box: { width: 120, height: 14 },
      value: 'Worker PDF',
      props: { fontSize: 20, fontWeight: 'bold' },
    })
    .addElement('text', {
      x: 18,
      y: 45,
      box: { width: 140, height: 12 },
      name: 'Message',
      binding: { key: 'message' },
      value: 'Message',
    })
    .build();
  const session = engine
    .createDocument(template, { message: 'Rendered off the main thread' });

  status.textContent = 'Engine ready.';
  generateButton.disabled = false;
  generateButton.addEventListener('click', async () => {
    generateButton.disabled = true;
    status.textContent = 'Rendering PDF in a worker…';
    try {
      const bytes = await session.generatePdf({ subsetter: true });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      pdfFrame.src = url;
      status.textContent = `PDF ready (${bytes.byteLength.toLocaleString()} bytes).`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      generateButton.disabled = false;
    }
  });
}

void main().catch(error => {
  status.textContent = error instanceof Error ? error.message : String(error);
});
