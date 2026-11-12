import { mkdir, writeFile } from 'node:fs/promises';
import { createNodeEngine } from '../../dist/pdf-node.js';

async function main() {
  const engine = await createNodeEngine();

  const template = engine
    .createTemplate({ name: 'Node quote' })
    .addElement('label', {
      x: 18,
      y: 18,
      box: { width: 120, height: 14 },
      value: 'Quote',
      props: { fontSize: 18, fontWeight: 'bold' },
    })
    .addElement('text', {
      x: 18,
      y: 42,
      box: { width: 120, height: 12 },
      name: 'Customer',
      binding: { key: 'customerName', required: true },
      value: 'Customer',
    })
    .build();

  const bytes = await engine
    .createDocument(template, { customerName: 'Example customer' })
    .generatePdf({ subsetter: true });

  await mkdir(new URL('./out/', import.meta.url), { recursive: true });
  const target = new URL('./out/quote.pdf', import.meta.url);
  await writeFile(target, bytes);

  console.log(`Wrote ${bytes.byteLength.toLocaleString()} bytes to ${target.pathname}`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
