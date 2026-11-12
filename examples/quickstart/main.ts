import { createDefaultEngine } from '../../dist/index.js';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const previewOutput = document.querySelector<HTMLPreElement>('#preview')!;
const generateButton = document.querySelector<HTMLButtonElement>('#generate')!;
const pdfFrame = document.querySelector<HTMLIFrameElement>('#pdf')!;

async function main() {
  const engine = await createDefaultEngine();
  const template = engine.createTemplate({ name: 'Quickstart 报价单' })
    .addElement('label', {
      x: 18,
      y: 18,
      box: { width: 90, height: 14 },
      value: '报价单',
      props: { fontSize: 18, fontWeight: 'bold' },
    })
    .addElement('text', {
      x: 18,
      y: 42,
      box: { width: 120, height: 12 },
      name: '客户名称',
      binding: { key: 'customerName', required: true },
      value: '客户名称',
    })
    .build();
  const templateJson = engine.stringifyTemplateJson(template);
  const loadedTemplate = engine.parseTemplateJson(templateJson);
  const documentSession = engine.createDocument(loadedTemplate)
    .fill({ customerName: '示例客户' });

  const preview = documentSession.preview();
  previewOutput.textContent = JSON.stringify({
    templateId: preview.templateId,
    pageCount: preview.pages.length,
    nodeCount: preview.pages.reduce((total, page) => total + page.nodes.length, 0),
    issues: preview.issues,
  }, null, 2);
  status.textContent = '布局预览已就绪。点击按钮生成 PDF。';
  generateButton.disabled = false;
  generateButton.addEventListener('click', async () => {
    generateButton.disabled = true;
    status.textContent = '正在生成 PDF…';
    try {
      const bytes = await documentSession.generatePdf();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      pdfFrame.src = url;
      status.textContent = `PDF 已生成（${bytes.byteLength.toLocaleString()} bytes）。`;
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
