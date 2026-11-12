import { createDefaultEngine, createDefaultFontManager } from 'layoutpdf';
import { createBlankTemplateFile } from 'layoutpdf/core';
import 'layoutpdf/designer';
import { setSubsetWasmLoader } from 'layoutpdf/pdf';
import { invoicePreset } from 'layoutpdf/presets';

// Vite rewrites this to '/' at the site root and '/layoutpdf/' on a GitHub
// Pages project site, so the fonts resolve under a sub-path deployment too.
const base = import.meta.env.BASE_URL;

setSubsetWasmLoader(async () => {
  const response = await fetch(`${base}fonts/hb-subset.wasm`);
  if (!response.ok) throw new Error(`Failed to load hb-subset.wasm: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
});

function demoTemplate(engine: Awaited<ReturnType<typeof createDefaultEngine>>) {
  let id = 0;
  const createId = (prefix: string) => `${prefix}_${id++}`;
  const file = createBlankTemplateFile({ name: '請求書 / Invoice', idGenerator: createId });
  const page = file.template.pages[0];
  page.elements.push(...invoicePreset.createElements({
    pageId: page.id,
    origin: { x: 15, y: 10 },
    registry: engine.plugins,
    createId,
  }));
  return file;
}

const input = {
  invoiceNumber: 'INV-2026-0713',
  issueDate: '2026-07-13',
  customerName: '株式会社サンプル 御中',
  issuerInfo: '株式会社 LayoutPDF\n東京都千代田区丸の内 1-2-3\n登録番号: T0000000000000',
  bankInfo: '〇〇銀行 本店支店\n普通 1234567\nカ）レイアウトピーディーエフ',
  note: 'お支払期限: 2026-08-31',
  items: Array.from({ length: 8 }, (_, index) => ({
    id: `row_${index + 1}`,
    item: `作業項目 ${index + 1}`,
    quantity: String(index % 3 + 1),
    unitPrice: String(1000 + index * 250),
  })),
};

async function start() {
  const engine = await createDefaultEngine({
    fontManager: await createDefaultFontManager(`${base}fonts/`),
  });
  const designer = document.createElement('layoutpdf-designer');
  designer.engine = engine;
  designer.template = demoTemplate(engine);
  designer.input = input;
  designer.addEventListener('template-change', event => {
    document.title = `編集: ${event.detail.template.name} · LayoutPDF`;
  });
  designer.addEventListener('pdf-generated', event => {
    const url = URL.createObjectURL(new Blob([
      Uint8Array.from(event.detail).buffer as ArrayBuffer,
    ], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  document.querySelector('#app')!.append(designer);
}

void start();
