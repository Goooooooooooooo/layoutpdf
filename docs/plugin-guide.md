# 插件开发指南

本文说明如何为 LayoutPDF 编写自定义插件，以及如何让插件参与 PDF 渲染。

## 1. 插件的最小结构

```ts
import { z } from 'zod';
import { definePlugin } from 'layoutpdf/core';

export const stampPlugin = definePlugin({
  metadata: {
    type: 'stamp',
    label: '印章',
    category: 'business',
  },

  propsSchema: z.object({
    text: z.string(),
    color: z.string(),
  }),

  valueSchema: z.string(),

  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'stamp',
      name: '印章',
      box: { ...position, width: 40, height: 40 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: 'APPROVED',
      props: { text: 'APPROVED', color: '#dc2626' },
    };
  },

  properties: [
    { path: 'props.text', label: '文字', editor: 'text', group: 'content' },
    { path: 'props.color', label: '颜色', editor: 'color', group: 'style' },
  ],

  buildRenderNodes({ element, value }) {
    return [{
      kind: 'plugin',
      id: `${element.id}:node:0`,
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: false,
      zIndex: 0,
      pluginType: 'stamp',
      payload: {
        text: (element.props as { text: string }).text,
        color: (element.props as { color: string }).color,
      },
      // 如果 PDF 渲染器会绘制文本，必须声明，供字体子集化收集字形。
      textRuns: [{ text: value }],
    }];
  },
});
```

注册插件：

```ts
import { createDefaultEngine } from 'layoutpdf';
import { stampPlugin } from './stampPlugin.js';

const engine = await createDefaultEngine({
  plugins: [...(await import('layoutpdf/plugins')).plugins, stampPlugin],
});
```

## 2. 自定义 PDF 渲染器

插件通过 `renderers.pdf` 贡献自己的画法：

```ts
import { rgb } from 'pdf-lib';

renderers: {
  async pdf(node, context) {
    const { text } = node.payload as { text: string };
    const { page } = context;

    page.drawRectangle({
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      borderColor: rgb(0.8, 0.1, 0.1),
      borderWidth: 2,
    });
  },
}
```

也可以由宿主动态注册或覆盖：

```ts
const engine = createEngine({
  plugins,
  pdfRenderers: [
    {
      pluginType: 'stamp',
      render: (node, context) => {
        // 自定义实现
      },
    },
  ],
});
```

`pdfRenderers` 中同类型的条目会覆盖插件自带的渲染器。

## 3. 文本与字体子集化

核心只能看到 `RenderNode`，无法知道自定义渲染器内部画了什么文本。因此：

- 只要 PDF 渲染器会绘制文字，就必须在 `plugin` 节点的 `textRuns` 中声明。
- `textRuns` 支持为每段文字指定 `fontName`。
- 如果没有声明，字体子集化可能漏掉字形，最终 PDF 出现空白或乱码。

```ts
textRuns: [
  { text: '請求書', fontName: 'Noto Sans CJK JP Regular' },
]
```

## 4. DOM 预览

插件可以通过 `renderers.dom` 提供 React 预览：

```ts
renderers: {
  dom(node, context) {
    const { text } = node.payload as { text: string };
    return <div style={{ border: '2px solid red' }}>{text}</div>;
  },
}
```

约束：

- React 预览要求 `dom` 渲染器**同步**返回 `ReactNode`。
- 返回 `Promise` 时会打印警告并回退到 `data-plugin-type` 占位框。
- 没有 `dom` 渲染器时，预览显示占位框，不会导致设计器崩溃。

宿主也可以覆盖或追加 DOM 渲染器：

```ts
const engine = createEngine({
  plugins,
  domRenderers: [
    { pluginType: 'stamp', render: renderStampDom },
  ],
});
```

独立预览时通过 `PreviewDocument` 传入：

```tsx
<PreviewDocument document={document} pluginRenderers={engine.domRenderers} />
```

## 5. Worker 限制

Worker 不能接收函数，因此：

- 自定义插件节点默认只能在主线程渲染（`pdfExecutionTarget: 'main-thread'`）。
- 如果使用 Worker，需要把相同的插件渲染器打包进 Worker。
- `DocumentSession` 在 Worker 模式下遇到 `plugin` 节点会直接报错，避免静默生成错误 PDF。

## 6. 属性面板

`properties` 中的 `editor` 是字符串 key，由设计器侧解析：

```ts
properties: [
  { path: 'props.text', label: '文字', editor: 'text' },
  { path: 'props.color', label: '颜色', editor: 'color' },
]
```

内置编辑器包括 `text`、`textarea`、`number`、`color`、`select`、`checkbox` 等。后续会开放 `propertyEditors` 注册表，允许宿主注册自己的编辑器。

## 7. 插件包

把多个插件组合成一个包：

```ts
import { definePluginPack } from 'layoutpdf/core';

export const myPack = definePluginPack({
  id: 'my-pack',
  plugins: [stampPlugin, signaturePlugin],
});
```

官方插件包：

- `layoutpdf/plugins/basic`：文本、形状、图片、条码、二维码、表单控件。
- `layoutpdf/plugins/business`：表格、网格、汇总块、计算字段。
- `layoutpdf/plugins`：默认全量插件集合。

## 8. 测试建议

- 用 `resolveRenderTree()` 断言插件生成的节点。
- 用 `layoutRenderTree()` 断言尺寸与分页。
- 用 `renderDocumentPdf()` + 自定义 `pdfRenderers` 做端到端 PDF 测试。
- 对 `INVALID_PLUGIN_NODE`、`MISSING_PLUGIN_RENDERER` 等错误码做断言。
