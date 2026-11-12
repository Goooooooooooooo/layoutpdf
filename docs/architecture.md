# LayoutPDF — 架构设计

> 状态：Draft v1  
> 目标：把项目整理成开箱即用的「布局设计 → 渲染 → PDF」模块，同时允许用户替换渲染器、插件、字体、存储和设计器 UI。

---

## 1. 产品定义

LayoutPDF 是一个以模板 JSON 为输入、以 `RenderDocument` 为中间表示、同时输出 DOM 预览和 PDF 的文档排版引擎。

它有三层使用形态：

| 层级 | 目标用户 | 使用方式 |
|---|---|---|
| 开箱即用 | 业务开发者 | `createDefaultEngine()` + 默认插件 + 默认字体 + `generatePdf()` |
| 组合式 | 中高级开发者 | `createEngine({ plugins, fontManager, pdfRenderers })` |
| 深度定制 | 平台/产品团队 | 自定义插件、节点渲染器、设计器主题、属性编辑器、存储适配器 |

「开箱即用」的验收标准：

- 5 分钟内可以从安装跑到第一份 PDF。
- 默认字体支持中日英混排。
- 同一份模板的预览与 PDF 布局一致。
- 设计器可以直接嵌入，不需要宿主实现业务逻辑。
- 所有公开 API 有 TypeScript 类型和错误码。

---

## 2. 分层架构

```
应用层：Web / WebView / Node / CLI / SaaS
        │
设计器层：designer（可选，React + Web Component）
        │
引擎门面：createDefaultEngine / createEngine
        │
┌────────────┬────────────┬────────────┐
│ render-dom │ render-pdf │ presets    │
├────────────┴────────────┴────────────┤
│ layout：文本测量、换行、表格分页、续页 │
├──────────────────────────────────────┤
│ core：template / input / plugin / session │
├──────────────────────────────────────┤
│ contracts：JSON Schema / IR / Issue Code │
└──────────────────────────────────────┘
        │
Providers：FontManager / AssetProvider / StorageAdapter / Locale / Logger
```

### 2.1 依赖规则

- `contracts` 不依赖任何运行时。
- `core` 只依赖 `contracts`。
- `layout` 依赖 `core` 和 `contracts`。
- `render-pdf` / `render-dom` 依赖 `layout` 产出的 `RenderDocument`，不反向依赖模板编辑逻辑。
- 插件只依赖 `contracts` 和节点模型，不允许在插件定义中 import React。
- `designer` 依赖引擎和渲染器，但引擎不依赖设计器。
- 核心与布局层不能出现 `document`、`window`、`Worker`、`fs` 等环境对象；环境能力放到适配器。

### 2.2 目录建议

```
src/
  engine/
    core/          # 模板、输入、插件、会话、校验
    renderTree/    # RenderDocument、resolve、layout、分页
    pdf/           # PDF 渲染、字体、Worker
    utils/         # 单位、颜色、限制、错误
  plugins/
    basic/         # 基础插件入口
    business/      # 业务插件入口
  presets/         # 模板预设、可复用块
  designer/        # 设计器入口
  i18n/            # 文案与格式化
  styles/          # 设计器样式
```

---

## 3. 五个核心抽象

### 3.1 `TemplateFile`：持久化契约

模板是唯一需要落库的格式，必须满足：

- 有明确的 `format` 和 `version`。
- 有公开 JSON Schema，供外部表单、低代码平台、后端校验。
- 有公开迁移函数：`migrateTemplate(json): TemplateFile`。
- 向后兼容承诺只覆盖已发布的大版本。

当前模板版本为 `3`。

### 3.2 `RenderDocument`：渲染中间表示

`RenderDocument` 是所有输出端的唯一输入：

```
TemplateFile + Input
  → resolve（绑定、公式、输出引用）
  → RenderDocument（逻辑节点）
  → layout（字体测量、换行、分页、续页）
  → RenderDocument（最终坐标）
  → DOM / PDF / SVG / Canvas
```

约束：

- 可序列化，可跨线程/跨端传输。
- 同一输入、字体、时区、语言下输出确定。
- 内部单位统一为 mm，只有 PDF 输出层转换为 pt。
- 每个节点都有 `box / zIndex / clip`。
- 布局错误通过 `RenderIssue` 表达，`strict` 模式直接抛错。
- IR 自身也要有版本号，避免插件生态升级时无兼容判断。

### 3.3 `Plugin`：数据 + 节点 + 可选渲染器

插件负责四件事：

1. 声明元数据（类型、名称、分类、图标）。
2. 校验 props/value（zod）。
3. 创建默认元素、描述属性面板。
4. 把元素转换为 `RenderNode`，必要时提供自定义节点渲染器。

插件定义必须是 headless 的：

```ts
export const stampPlugin = definePlugin({
  type: 'stamp',
  apiVersion: 1,
  metadata: { label: '印章', category: 'business' },
  propsSchema: z.object({ ... }),
  valueSchema: z.string(),
  createDefaultElement(args) { ... },
  properties: [ ... ],
  buildRenderNodes({ element, value }) {
    return [{ kind: 'plugin', pluginType: 'stamp', payload: { ... } }];
  },
  renderers: {
    pdf(node, context) { ... },
  },
});
```

属性面板通过字符串 editor key 引用编辑器，设计器侧注册具体组件，核心不依赖 React。

### 3.4 `RendererRegistry`：渲染器注册表

核心节点类型保持稳定：

```
text | rect | ellipse | line | image | table | grid
```

第三方扩展统一使用 `plugin` 节点：

```ts
interface PluginNode extends RenderNodeBase {
  kind: 'plugin';
  pluginType: string;
  payload: JsonValue;
  /** 可选：声明渲染时使用的文本，供字体子集化收集字形。 */
  textRuns?: Array<{ text: string; fontName?: string }>;
}
```

渲染器按 `pluginType` 注册：

```ts
const engine = createEngine({
  plugins: [...basicPlugins, ...businessPlugins],
  pdfRenderers: [
    { pluginType: 'stamp', render: renderStampPdf },
  ],
});
```

这样插件既能定义数据，也能定义画法，同时不破坏核心 IR。

### 3.5 `Providers`：可注入能力

| Provider | 职责 |
|---|---|
| `FontManager` | 字体加载、测量、回退、子集化 |
| `AssetProvider` | 图片、PDF 背景、模板资源解析 |
| `StorageAdapter` | 模板、可复用块、偏好设置持久化 |
| `LocaleSettings` | 文档语言、币种、时区、日历 |
| `Logger / Telemetry` | 渲染耗时、缺字、插件错误 |

---

## 4. 公共 API

### 4.1 L1：开箱即用

```ts
import { createDefaultEngine } from 'layoutpdf';

const engine = await createDefaultEngine({ locale: 'zh-CN' });

const template = engine.createTemplate({ name: '报价单' })
  .addElement('label', { x: 20, y: 20, value: '报价单' })
  .addElement('text', {
    x: 20,
    y: 40,
    name: '客户',
    binding: { key: 'customerName' },
  })
  .build();

const bytes = await engine
  .createDocument(template, { customerName: '示例客户' })
  .generatePdf();
```

### 4.2 L2：组合式

```ts
import {
  createEngine,
  createFontManager,
} from 'layoutpdf/core';
import { basicPlugins } from 'layoutpdf/plugins/basic';
import { businessPlugins } from 'layoutpdf/plugins/business';

const engine = createEngine({
  plugins: [...basicPlugins, ...businessPlugins],
  fontManager: createFontManager({ ... }),
  pdfExecutionTarget: 'worker',
  pdfWorkerFactory: () => new Worker(...),
});
```

### 4.3 L3：深度定制

```ts
import { resolveRenderTree, layoutRenderTree } from 'layoutpdf/core';
import { renderDocumentPdf } from 'layoutpdf/pdf';

const resolved = resolveRenderTree({ file, input, plugins, fontManager });
const laidOut = layoutRenderTree(resolved, { fontManager });
const bytes = await renderDocumentPdf({
  document: laidOut,
  file,
  fontManager,
  pdfRenderers,
});
```

### 4.4 L4：设计器

```ts
const designer = document.createElement('layoutpdf-designer');
designer.engine = engine;
designer.template = template;
designer.theme = { accent: '#2563eb', radius: '10px' };
designer.propertyEditors = { 'my-color-picker': MyColorPicker };
designer.storage = myStorageAdapter;
```

### 4.5 会话 API 建议

`DocumentSession` 需要补齐：

- `signal: AbortSignal`
- `onProgress`
- `strict`
- `pageRange`
- `metadata`
- 输出 `Uint8Array | Blob | ReadableStream`

---

## 5. 渲染核心

### 5.1 流水线

```
validate
  → resolve
  → layout
  → paint
```

- `validate`：模板结构、插件 schema、资源限制。
- `resolve`：输入绑定、公式、元素输出引用、插件节点生成。
- `layout`：字体测量、文本换行、表格分页、续页、越界检查。
- `paint`：DOM / PDF / 其他输出。

### 5.2 一致性约束

1. 预览和 PDF 必须使用同一份布局后的 `RenderDocument`。
2. 字体测量结果必须可复用，不能预览一套、PDF 一套。
3. 所有节点必须有明确边界，自定义节点也一样。
4. 渲染错误必须带 `code / severity / message / elementId / path`。
5. 单个插件失败不能导致整份文档崩溃，除非 `strict` 开启。

### 5.3 自定义节点渲染器

- `plugin` 节点的 `payload` 必须是 JSON 可序列化数据。
- PDF 渲染器按 `pluginType` 解析。
- 如果插件在 PDF 中绘制文本，必须通过 `textRuns` 声明，供字体子集化收集字形。
- 缺失渲染器时，生成明确的 `MISSING_PLUGIN_RENDERER` 错误，而不是静默跳过。
- Worker 模式不能传递函数；自定义插件节点需要主线程渲染，或把相同的插件渲染器打包进 Worker（后续 M2 提供）。

---

## 6. PDF 模块

### 6.1 入口

- `layoutpdf/pdf`：浏览器/Worker 可用的 PDF 渲染。
- `layoutpdf/pdf/node`：Node/Headless 入口。提供 `createNodeEngine()`、`createNodeFontManager()`、`configureNodeFontSubsetting()`；不依赖 `fetch` / `location` / `Worker`，wasm 从 `dist/fonts` 解析，字体内置查找为可选取路径。
- `layoutpdf/pdf/worker`：Worker 工厂封装。提供独立 worker 入口，Vite 可用 `?worker` 导入；`createPdfWorker(url)` 供其他 bundler 使用。

### 6.2 字体

- npm 包不携带字体二进制；开发环境用 `npm run fonts:fetch`，生产由宿主提供 `fontPath` / `baseUrl` / `fontManager`。
- 示例默认使用 Noto Sans CJK JP。
- 后续增加独立字体包：CJK SC / TC / KR / Latin。
- 支持 fallback chain。
- 缺字策略：`throw / warn / ignore`，并提供 `onMissingGlyphs`。
- HarfBuzz 子集化在浏览器和 Node 下都要可用。
  - 浏览器默认从 `/fonts/hb-subset.wasm` 加载。
  - Node 通过 `configureNodeFontSubsetting()` 从 `dist/fonts` 或显式路径加载。
  - 子集化失败时回退到完整字体嵌入，不阻断导出。
- wasm 与字体许可证随包发布。

### 6.3 输出能力

- `Uint8Array`、`Blob`、`ReadableStream`。
- 元数据、页码范围、PDF 背景合并。
- 打印能力（出血、裁切线、缩放）放到 v1.1。
- 加密/权限、PDF/A、Tagged PDF 第一版不承诺。

### 6.4 环境适配

- 浏览器主线程。
- Web Worker。
- Node/Headless：`pdf/node` 已实现，核心路径不引用 `pdfjs-dist`、`Worker` 或 Vite `?url`。
- 不允许 `pdfjs-dist` 的 Vite `?url` 依赖进入核心路径；它只服务 PDF 背景预览/解析。

---

## 7. 设计器模块

设计器是可选包，宿主不强制使用 React。

### 7.1 能力

- 模板编辑、元素拖拽、属性面板、网格/吸附、缩放。
- 多页、表格分页预览、表单填写模式。
- 预设、可复用块。
- 导入/导出 JSON、生成 PDF。
- Web Component 事件：`template-change / preview / pdf-generated / designer-error`。

### 7.2 可定制点

| 定制点 | 方式 |
|---|---|
| 主题 | CSS variables / design tokens |
| 属性编辑器 | `propertyEditors` 注册表 |
| 插件面板 | `PluginManifest` + 懒加载 |
| 存储 | `StorageAdapter` |
| 国际化 | `locale` 属性 |
| 命令 | `designer.commands`（undo/redo/zoom/export） |

### 7.3 健壮性

- 插件/属性面板错误边界。
- 受控/非受控模板语义明确。
- 键盘导航、焦点管理、ARIA。
- 大模板虚拟化或分页渲染。

---

## 8. 打包与发布

### 8.1 v1 策略

先保持一个包 + 多子路径导出，内部严格分层。等插件生态成熟后再拆 `@layoutpdf/core`、`@layoutpdf/pdf` 等包。

建议 `exports`：

```json
{
  ".": "./dist/index.js",
  "./core": "./dist/core.js",
  "./pdf": "./dist/pdf.js",
  "./pdf/node": "./dist/pdf-node.js",
  "./preview-dom": "./dist/preview-dom.js",
  "./preview-react": "./dist/preview-react.js",
  "./plugins": "./dist/plugins.js",
  "./plugins/basic": "./dist/plugins-basic.js",
  "./plugins/business": "./dist/plugins-business.js",
  "./presets": "./dist/presets.js",
  "./designer": "./dist/designer.js",
  "./i18n": "./dist/i18n.js",
  "./schema/template.schema.json": "./docs/schema/template.schema.json",
  "./styles/*": "./dist/styles/*"
}
```

### 8.2 依赖策略

- `react` / `react-dom`：optional peer，仅设计器和 React 预览需要。
- `pdf-lib`：PDF 入口依赖。
- `pdfjs-dist`：仅在 PDF 背景预览/解析时加载。
- `zod`：核心依赖。
- `sideEffects: false`；构建产物不自动注册 Web Component。

### 8.3 发布物

- `dist/`（不含字体二进制）
- `dist/fonts/hb-subset.wasm` 与许可证
- `docs/`（含 API reference 与 `schema/template.schema.json`）
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- 类型声明

### 8.4 版本策略

| 对象 | 策略 |
|---|---|
| npm 包 | semver |
| 模板 | `version` + JSON Schema + migration |
| 插件 | `apiVersion` |
| IR | `RenderDocument.version` |

废弃策略：至少保留一个大版本，并提供迁移说明。

---

## 9. 质量与开发体验

### 9.1 测试

- 单元测试：模板、输入、插件、布局、单位。
- Golden PDF：结构快照 + 关键坐标断言。
- 跨渲染器一致性：预览节点与 PDF 节点尺寸一致。
- 构建冒烟：从 `dist` 导入并在 Node 中生成 PDF。
- 性能基准：大表格、多页、CJK 字体子集化。

### 9.2 CI

- `typecheck`
- `test`
- `build`
- `dist` 冒烟
- 包体积检查

### 9.3 文档

- README：5 分钟 quickstart。
- `docs/architecture.md`：本文。
- `docs/plugin-guide.md`：插件开发指南。
- `docs/api.md`：API reference。
- `docs/recipes/`：Vite、Next.js、Node CLI、自定义插件、自定义主题。
- Playground：在线模板编辑 + PDF 预览。

---

## 10. 路线图

### M0：定边界（2–3 天）

- 本文档定稿。
- 增加 `test` 脚本与 CI。
- 补齐 `package.json` 子路径导出。
- 决定业务插件是否进入默认包。

### M1：插件/渲染核心（约 1 周）

- ✅ `definePlugin` / `definePluginPack`。
- ✅ `plugin` 节点类型 + PDF/DOM RendererRegistry。
- ✅ 拆分 `plugins/basic` 和 `plugins/business`。
- ✅ 抽出 `preview-react` 公开预览入口。
- ✅ 框架无关的 `preview-dom`。
- ✅ 引擎级 `format`（locale / currency / timeZone）配置。
- ⏳ 引擎级字体配置与插件清单懒加载。

### M2：PDF 产品化（约 1 周）

- ✅ `pdf/node` 入口（开发字体解析、wasm 子集化注入）。
- ✅ `pdf/worker` 独立入口与 `createPdfWorker()`。
- ✅ `pageRange`、`signal`、`onProgress`、`strict`。
- ✅ golden PDF 测试（布局快照 + 文本坐标）。
- ✅ Worker bundler 示例（`examples/worker`）。
- ✅ CI 与 `npm run smoke` 构建冒烟。
- ✅ 缺字策略（`missingGlyphPolicy` + `onMissingGlyphs`）。
- 字体包（CJK SC / TC / KR / Latin）与真正的 fallback chain。

### M3：Designer 产品化（约 1 周）

- ✅ 主题 tokens（`theme` 覆盖 `--layoutpdf-*`）。
- ✅ 偏好设置存储（`storage` + `settingsKey`）。
- ✅ 自定义属性编辑器（`propertyEditors` + `ownedPaths`）。
- ✅ `DesignerStorageAdapter` 支持模板与可复用块。
- ✅ 设计器 i18n（`locale` + 可订阅的全局语言）。
- ✅ 错误边界与命令 API。
- ✅ Web Component 属性、事件与命令文档。

### M4：交付与发布（3–5 天）

- ✅ `docs/api.md` + 公开 JSON Schema（`docs/schema/template.schema.json`）。
- ✅ headless 模板编辑 API（`TemplateEditor`：add/update/remove/move/duplicate）。
- ✅ 字体拆包：npm 包不再携带 32MB Noto CJK 字体，按需 `npm run fonts:fetch` 或自托管。
- ✅ `license`、`sideEffects`、CHANGELOG、版本策略与发布清单。
- ✅ `prepublishOnly` + CI 字体准备。
- 示例矩阵。
- Playground。
- 发布 0.2 / 1.0。

---

## 11. 当前差距

| 能力 | 现状 | 下一步 |
|---|---|---|
| 模板/数据/IR | `TemplateFile v3` + `RenderDocument` | 公开 JSON Schema、迁移 API、IR 版本 |
| 模板编辑 | `TemplateBuilder` + `TemplateEditor`（页面/元素 add、update、remove、move、duplicate） | 更多批量/布局辅助 API |
| 插件 | 18 个默认插件（basic + business） | 插件可贡献渲染器；插件清单懒加载 |
| 插件渲染扩展 | `plugin` 节点 + RendererRegistry | 保持 |
| 预览 | `preview-react` + `preview-dom` + DOM 插件渲染器 | 主题样式、更多表单控件 |
| PDF | pdf-lib + CJK 子集化 | 独立字体包、真正的 fallback chain |
| Designer | React + Web Component | 更多设计器细节 |
| 包入口 | 已补 `pdf`、`pdf/node`、`pdf/worker`、`preview-react`、`preview-dom`、`plugins/presets/i18n`、schema | 保持 |
| 测试 | `npm test` + 357 个测试（含 Node PDF、Worker、导出选项、golden PDF、DOM 预览、设计器运行时、缺字策略、TemplateEditor） | 更多视觉回归 |
| 文档 | README + 架构文档 + 插件指南 + API reference + schema + 发布清单 | 示例矩阵、recipes |
| 语言/区域 | 引擎级 `format` 覆盖 + 设计器 `locale` | 保持 |
| 构建 | 仅 ESM；字体不再进入 npm tarball | Node 入口补 CJS 或明确只支持 ESM |

---

## 12. 已落地决定与待决策

已落地：

- 业务插件默认包含在 `layoutpdf` 中，同时保留 `plugins/basic` 和 `plugins/business` 分包。
- v1 采用单包多入口，不拆 monorepo。
- 插件自定义节点统一使用 `kind: 'plugin'`，渲染器按 `pluginType` 注册。
- Worker 模式暂不支持下传函数，自定义插件节点先走主线程。

待决策：

1. 主打市场：日本发票优先，还是中日英通用？
2. 是否把 Node 服务端批量 PDF 列为 v1 必做？
3. 设计器是否需要完全 headless 的自定义 UI？
4. 模板 v3 是否作为长期稳定格式？
5. 商业模式：MPL-2.0 核心开源 + 商业插件，还是全开源？
