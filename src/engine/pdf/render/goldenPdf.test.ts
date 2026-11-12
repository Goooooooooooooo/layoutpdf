import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createNodeEngine } from '@/pdf-node.js';

interface GoldenTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface GoldenPage {
  width: number;
  height: number;
  text: GoldenTextItem[];
}

interface GoldenSummary {
  pageCount: number;
  pages: GoldenPage[];
}

const fixtureUrl = new URL('./__golden__/invoice.json', import.meta.url);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function summarize(bytes: Uint8Array): Promise<GoldenSummary> {
  const loaded = await PDFDocument.load(bytes);
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  try {
    const pages: GoldenPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      pages.push({
        width: round(viewport.width),
        height: round(viewport.height),
        text: text.items.map(item => ({
          text: 'str' in item ? item.str : '',
          x: round(item.transform[4]),
          y: round(item.transform[5]),
          width: round(item.width),
        })),
      });
    }
    assert.equal(loaded.getPageCount(), doc.numPages);
    return { pageCount: doc.numPages, pages };
  } finally {
    await loadingTask.destroy();
  }
}

async function buildGoldenPdf(): Promise<Uint8Array> {
  const engine = await createNodeEngine();
  const template = engine
    .createTemplate({ name: 'Golden invoice' })
    .addElement('label', {
      id: 'title',
      x: 20,
      y: 20,
      box: { width: 100, height: 12 },
      value: 'INVOICE',
      props: { fontSize: 16, fontWeight: 'bold' },
    })
    .addElement('text', {
      id: 'customer',
      x: 20,
      y: 40,
      box: { width: 80, height: 10 },
      binding: { key: 'customer' },
      props: { fontSize: 11 },
    })
    .addElement('rect', {
      id: 'box',
      x: 20,
      y: 60,
      box: { width: 80, height: 20 },
      props: { fill: '#f0f0f0' },
    })
    .addElement('line', {
      id: 'rule',
      x: 20,
      y: 90,
      box: { width: 120, height: 1 },
    })
    .build();

  return engine
    .createDocument(template, { customer: 'Acme Corp' })
    .generatePdf({ subsetter: true });
}

describe('golden PDF', () => {
  it('matches the checked-in layout snapshot', async () => {
    const bytes = await buildGoldenPdf();

    // Subsetting keeps the CJK fallback font out of the golden artifact.
    assert.ok(bytes.length > 0);
    assert.ok(bytes.length < 1_500_000, `expected a subsetted PDF, got ${bytes.length} bytes`);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');

    const summary = await summarize(bytes);
    if (process.env.UPDATE_GOLDEN === '1') {
      await writeFile(fixtureUrl, `${JSON.stringify(summary, null, 2)}\n`);
    }
    const expected = JSON.parse(await readFile(fixtureUrl, 'utf8')) as GoldenSummary;
    assert.deepEqual(summary, expected);
  });
});
