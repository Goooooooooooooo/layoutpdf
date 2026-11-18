import { createNodeEngine } from '@/pdf-node.js';
import { resolveRenderTree } from '@/engine/renderTree/resolve.js';
import { layoutRenderTree } from '@/engine/renderTree/layout.js';
import { runBenchmarks, type BenchmarkCase } from './harness.js';

const ROW_COUNT = 500;
const PAGE_COUNT = 50;
const ELEMENT_COUNT = 300;

const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: `row_${index}`,
  item: `品目 ${index + 1} サンプル`,
  quantity: index % 7 + 1,
  amount: (index + 1) * 1250,
}));

async function main(): Promise<void> {
  const engine = await createNodeEngine();

  const tableTemplate = engine
    .createTemplate({ name: 'Bench table' })
    .addElement('table', {
      id: 'table',
      x: 20,
      y: 20,
      box: { width: 170, height: 20 },
      props: {
        columns: [
          { id: 'col_item', label: '品名', key: 'item', width: 3, valueType: 'text', align: 'left' },
          { id: 'col_quantity', label: '数量', key: 'quantity', width: 1, valueType: 'number', align: 'right' },
          { id: 'col_amount', label: '金額', key: 'amount', width: 1.5, valueType: 'currency', align: 'right' },
        ],
        footers: [{
          id: 'total',
          label: '合計',
          formula: { kind: 'expression', expression: 'SUM(column.amount)' },
        }],
      },
      value: rows,
    })
    .build();
  const tableSession = engine.createDocument(tableTemplate, {});
  tableSession.preview();

  const multiPageBuilder = engine.createTemplate({ name: 'Bench pages' });
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex += 1) {
    if (pageIndex > 0) multiPageBuilder.addPage();
    for (let elementIndex = 0; elementIndex < 6; elementIndex += 1) {
      const y = 20 + elementIndex * 18;
      if (elementIndex % 2 === 0) {
        multiPageBuilder.addElement('text', {
          pageIndex,
          x: 20,
          y,
          box: { width: 160, height: 10 },
          value: `ページ ${pageIndex + 1} 行 ${elementIndex + 1}`,
          props: { fontSize: 10 },
        });
      } else {
        multiPageBuilder.addElement('rect', {
          pageIndex,
          x: 20,
          y,
          box: { width: 160, height: 10 },
          props: { fill: '#f0f0f0' },
        });
      }
    }
  }
  const multiPageTemplate = multiPageBuilder.build();
  const multiPageSession = engine.createDocument(multiPageTemplate, {});
  multiPageSession.preview();

  const designerBuilder = engine.createTemplate({ name: 'Bench designer', pageSize: { width: 420, height: 297 } });
  for (let index = 0; index < ELEMENT_COUNT; index += 1) {
    const column = index % 15;
    const row = Math.floor(index / 15);
    designerBuilder.addElement(index % 3 === 0 ? 'text' : 'rect', {
      x: 10 + column * 26,
      y: 10 + row * 13,
      box: { width: 24, height: 10 },
      ...(index % 3 === 0
        ? { value: `要素 ${index + 1}`, props: { fontSize: 8 } }
        : { props: { fill: index % 2 === 0 ? '#f5f5f5' : '#e0e0e0' } }),
    });
  }
  const designerTemplate = designerBuilder.build();

  const designerFrame = () => {
    const logical = resolveRenderTree({
      file: designerTemplate,
      input: {},
      plugins: engine.plugins,
      fontManager: engine.fontManager,
    });
    return layoutRenderTree(logical, { fontManager: engine.fontManager }, { paginate: false });
  };

  const cases: BenchmarkCase[] = [
    {
      name: `${ROW_COUNT}-row table layout + pagination`,
      run: () => {
        // A fresh session so the cached preview cannot hide the layout work.
        engine.createDocument(tableTemplate, {}).preview();
      },
      iterations: 7,
    },
    {
      name: `${ROW_COUNT}-row table PDF (no subset)`,
      run: async () => {
        await tableSession.generatePdf({ subsetter: false });
      },
      iterations: 3,
    },
    {
      name: `${ROW_COUNT}-row table PDF (CJK subset)`,
      run: async () => {
        await tableSession.generatePdf({ subsetter: true });
      },
      iterations: 2,
      warmup: 1,
    },
    {
      name: `${PAGE_COUNT}-page PDF (no subset)`,
      run: async () => {
        await multiPageSession.generatePdf({ subsetter: false });
      },
      iterations: 3,
    },
    {
      name: `${PAGE_COUNT}-page PDF (CJK subset)`,
      run: async () => {
        await multiPageSession.generatePdf({ subsetter: true });
      },
      iterations: 2,
      warmup: 1,
    },
    {
      name: `${ELEMENT_COUNT}-element designer frame (resolve + layout)`,
      run: designerFrame,
      iterations: 10,
    },
  ];

  await runBenchmarks(cases);
}

await main();
