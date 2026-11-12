import { createDefaultEngine, createDefaultFontManager } from 'layoutpdf';
import {
  createBlankTemplateFile,
  type InputRecord,
  type JsonValue,
  type TemplateFile,
} from 'layoutpdf/core';
import 'layoutpdf/designer';
import { setSubsetWasmLoader } from 'layoutpdf/pdf';
import { invoicePreset } from 'layoutpdf/presets';
import { RenderDocumentView } from 'layoutpdf/preview-react';
import { createRoot } from 'react-dom/client';
import './demo.css';

// Vite rewrites this to '/' at the site root and '/layoutpdf/' on a GitHub
// Pages project site, so the fonts resolve under a sub-path deployment too.
const base = import.meta.env.BASE_URL;

setSubsetWasmLoader(async () => {
  const response = await fetch(`${base}fonts/hb-subset.wasm`);
  if (!response.ok) throw new Error(`Failed to load hb-subset.wasm: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
});

function demoTemplate(engine: Awaited<ReturnType<typeof createDefaultEngine>>): TemplateFile {
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

const sampleInput: InputRecord = {
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

type Mode = 'design' | 'fill';

async function start() {
  const engine = await createDefaultEngine({
    fontManager: await createDefaultFontManager(`${base}fonts/`),
  });

  let template = demoTemplate(engine);
  let input: InputRecord = structuredClone(sampleInput);

  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `
    <header class="demo-bar">
      <span class="demo-brand"><b>LayoutPDF</b><small>designer demo</small></span>
      <div class="demo-tabs" role="tablist" aria-label="demo mode">
        <button type="button" role="tab" data-mode="design" aria-selected="true">设计模板</button>
        <button type="button" role="tab" data-mode="fill" aria-selected="false">填写数据</button>
      </div>
      <span class="demo-hint" data-hint></span>
      <button type="button" class="demo-pdf">生成 PDF</button>
    </header>
    <main class="demo-pane demo-design"><div id="designer-host"></div></main>
    <main class="demo-pane demo-fill" hidden><div id="fill-host"></div></main>
  `;

  const designer = document.createElement('layoutpdf-designer');
  designer.engine = engine;
  designer.template = template;
  designer.input = input;
  designer.addEventListener('template-change', event => {
    template = event.detail;
    document.title = `编辑: ${event.detail.template.name} · LayoutPDF`;
  });
  designer.addEventListener('pdf-generated', event => openPdf(event.detail));
  app.querySelector('#designer-host')!.append(designer);

  const designPane = app.querySelector<HTMLElement>('.demo-design')!;
  const fillPane = app.querySelector<HTMLElement>('.demo-fill')!;
  const hint = app.querySelector<HTMLElement>('[data-hint]')!;
  const fillRoot = createRoot(app.querySelector('#fill-host')!);

  function renderFill() {
    fillRoot.render(
      <div className="demo-fill-scroll">
        <RenderDocumentView
          document={engine.createDocument(template, input).preview()}
          mode="form"
          pluginRenderers={engine.domRenderers}
          onInputChange={updateInput}
        />
      </div>,
    );
  }

  let frame = 0;
  function updateInput(key: string, value: JsonValue) {
    input = { ...input, [key]: value };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderFill();
    });
  }

  function setMode(mode: Mode) {
    const fill = mode === 'fill';
    designPane.hidden = fill;
    fillPane.hidden = !fill;
    for (const tab of app.querySelectorAll<HTMLElement>('[data-mode]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    }
    hint.textContent = fill
      ? '直接改文字和表格单元格，表格行尾的 − / + 增减行'
      : '拖拽控件排版，右侧面板改属性';
    if (fill) {
      renderFill();
    } else {
      designer.input = input;
    }
  }

  for (const tab of app.querySelectorAll<HTMLElement>('[data-mode]')) {
    tab.addEventListener('click', () => setMode(tab.dataset.mode as Mode));
  }

  app.querySelector('.demo-pdf')!.addEventListener('click', async () => {
    const bytes = await engine.createDocument(template, input).generatePdf({ subsetter: true });
    openPdf(bytes);
  });

  setMode('design');
}

function openPdf(bytes: Uint8Array) {
  // Copy into a plain ArrayBuffer: pdf bytes are typed as ArrayBufferLike, which
  // BlobPart does not accept (it could be a SharedArrayBuffer).
  const buffer = new Uint8Array(bytes.byteLength);
  buffer.set(bytes);
  const url = URL.createObjectURL(new Blob([buffer.buffer], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener,noreferrer');
}

void start();
