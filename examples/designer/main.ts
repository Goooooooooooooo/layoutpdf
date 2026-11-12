import { createDefaultEngine } from 'layoutpdf';
import 'layoutpdf/designer';

async function start() {
  const engine = await createDefaultEngine();
  const template = engine.createTemplate({ name: '可定制的报价单' })
    .addElement('label', { x: 18, y: 16, value: '报价单' })
    .addElement('text', {
      x: 18,
      y: 28,
      name: '客户名称',
      binding: { key: 'customerName' },
    })
    .build();
  const designer = document.createElement('layoutpdf-designer');
  designer.engine = engine;
  designer.template = template;
  designer.input = { customerName: '示例客户' };
  designer.addEventListener('template-change', event => {
    document.title = `编辑中：${event.detail.template.name}`;
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
