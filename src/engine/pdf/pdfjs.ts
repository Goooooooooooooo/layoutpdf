import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// The bundler inlines this worker into the designer chunk, so the runtime
// `pdfjs-dist` build must match it exactly: pdfjs refuses to load a document
// when the API and worker versions differ. That is why `package.json` pins an
// exact version instead of a range - a caret range would let a consumer
// resolve a newer build than the worker embedded here.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjsLib };
