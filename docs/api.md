# API reference

`layoutpdf` turns a JSON template plus an input record into a laid-out
document and, optionally, a PDF. The API is split into small entry points so a
host can use only the layer it needs.

- Template format JSON Schema:
  [`schema/template.schema.json`](./schema/template.schema.json)
- Architecture: [`architecture.md`](./architecture.md)
- Plugin authoring: [`plugin-guide.md`](./plugin-guide.md)
- Release policy: [`release.md`](./release.md)

## Requirements

- ESM only. The package has no CommonJS build.
- Node `>=22.13.0` for headless/PDF use.
- React `>=18.3.0` is an optional peer dependency. Only
  `layoutpdf/designer` and `layoutpdf/preview-react`
  require it.
- Font binaries are **not** included in the npm tarball. See
  [Fonts](#fonts).

## Entry points

| Import | Purpose |
|---|---|
| `layoutpdf` | Browser default engine, all built-in plugins, browser font loader |
| `layoutpdf/core` | Document types, validation, plugin registry, render tree, layout, PDF types, `TemplateBuilder`, `TemplateEditor` |
| `layoutpdf/pdf` | `renderDocumentPdf`, font manager, PDF types, worker client |
| `layoutpdf/pdf/node` | Node/headless engine and file-based font loading |
| `layoutpdf/pdf/worker` | Ready-made module worker entry |
| `layoutpdf/plugins` | Full default plugin list |
| `layoutpdf/plugins/basic` | Text, shape, image, barcode, QR, and form controls |
| `layoutpdf/plugins/business` | Table, grid, summary, calculated field |
| `layoutpdf/preview-react` | React preview components |
| `layoutpdf/preview-dom` | Framework-independent DOM preview |
| `layoutpdf/presets` | Invoice preset and reusable-block helpers |
| `layoutpdf/i18n` | Locale, formatters, messages |
| `layoutpdf/designer` | React designer and `<layoutpdf-designer>` Web Component |
| `layoutpdf/schema/template.schema.json` | JSON Schema file for the template format |

## Document model

A serialized template is a `TemplateFile`:

```ts
interface TemplateFile {
  format: 'layoutpdf-template';
  version: 3;
  template: {
    version: 3;
    id: string;
    name: string;
    metadata?: { title?: string; author?: string; subject?: string; language?: string };
    pages: TemplatePage[];
  };
  assets: Record<string, TemplateAsset>;
}
```

Each page contains elements:

```ts
interface TemplateElement {
  id: string;
  type: string;            // plugin type, e.g. 'text' or 'table'
  name: string;
  box: { x: number; y: number; width: number; height: number };
  rotate: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  value: JsonValue;
  binding?: { key: string; required?: boolean };
  props: Record<string, unknown>;
  groupId?: string;
  presetId?: string;
}
```

Coordinates and dimensions are millimetres.

## Creating a template

### `TemplateBuilder` (append-only)

```ts
import { createDefaultEngine } from 'layoutpdf';

const engine = await createDefaultEngine();

const template = engine.createTemplate({ name: 'Quote' })
  .addPage({ size: { width: 210, height: 297 } })
  .addElement('text', {
    pageIndex: 0,
    x: 20,
    y: 40,
    name: 'Customer',
    binding: { key: 'customerName' },
    props: { fontSize: 12 },
  })
  .build();
```

`DocumentEngine.createTemplate(options)` returns a `TemplateBuilder`.

| Method | Description |
|---|---|
| `setMetadata(metadata)` | Replaces template metadata |
| `addPage(options?)` | Appends a page; defaults to page 1 size/padding |
| `addElement(type, options)` | Creates a plugin default element and appends it |
| `buildJson(space?)` | Validated JSON string |
| `build()` | Validated deep-cloned `TemplateFile` |

### `TemplateEditor` (headless editing)

`TemplateEditor` updates, removes, moves, and duplicates existing content. It is
available from `layoutpdf/core`. It does not require React or a DOM.

```ts
import { TemplateEditor } from 'layoutpdf/core';
import { plugins } from 'layoutpdf/plugins';

const editor = new TemplateEditor(templateFile, { plugins });

const page = editor.addPage({ afterPageId: editor.pages[0].id });
const text = editor.addElement('text', { pageId: page.id, x: 24, y: 30 });

editor.updateElement(text.id, [
  { path: 'box.width', value: 100 },
  { path: 'props.fontSize', value: 14 },
]);
editor.moveElement(text.id, { index: 0 });
const [copy] = editor.duplicateElement(text.id);
editor.removeElement(copy.id);

const nextTemplate = editor.toFile();
```

Constructor and factories:

```ts
new TemplateEditor(input: TemplateFile | string, options?: {
  plugins?: PluginRegistry | readonly LayoutPDFPlugin[]; // required only by addElement
  idGenerator?: IdGenerator;
  validate?: boolean;         // default true
});

TemplateEditor.create({
  name?: string,
  pageSize?: { width: number; height: number },
  padding?: [number, number, number, number],
  plugins?: PluginRegistry,
  idGenerator?: IdGenerator,
  validate?: boolean,
});
```

Reads always return deep clones.

| Method | Description |
|---|---|
| `templateId` / `name` | Current template identity |
| `toFile()` / `build()` | Validated snapshot |
| `toJson(space?)` | Validated JSON |
| `template` / `pages` | Deep-cloned document / pages |
| `getPage(pageId)` | Page or `undefined` |
| `getElement(elementId)` | `{ pageId, pageIndex, element }` or `undefined` |
| `listElements(pageId?)` | All elements, optionally for one page |
| `rename(name)` | Rename the template |
| `setMetadata(metadata)` | Replace metadata |
| `cloneAs(newTemplateId)` | Deep-copy the whole document with fresh ids |
| `addPage(options?)` | Insert a blank page at `index` or after `afterPageId` |
| `updatePage(pageId, patch)` | Update `size`, `padding`, and/or `background` |
| `removePage(pageId)` | Delete a page; keeps at least one page |
| `movePage(pageId, toIndex)` | Reorder pages |
| `duplicatePage(pageId, options?)` | Copy a page with fresh element/group/table ids |
| `addElement(type, options)` | Create a plugin element; requires a plugin registry |
| `insertElement(element, options?)` | Insert an already-built element |
| `updateElement(id, patch, options?)` | Apply one path/value patch or an array of patches |
| `updateElements(ids, patch, options?)` | Apply the same patch(es) to several elements |
| `setElementBox(id, box, options?)` | Replace `box` in one call |
| `removeElement(id, options?)` / `removeElements(ids, options?)` | Delete elements and repair references |
| `duplicateElement(id, options?)` / `duplicateElements(ids, options?)` | Copy elements within their page |
| `moveElement(id, options?)` / `moveElements(ids, options?)` | Reorder, offset position, or move across pages |

Element patches use dot-separated paths:

```ts
{ path: 'box.x', value: 10 }
{ path: 'props.style.fontSize', value: 12 }
{ path: 'props.pagination.finalElementIds', value: ['el_1', 'el_2'] }
```

Locked elements throw `ELEMENT_LOCKED` unless `{ force: true }` is passed. The
only exception is a patch whose path is exactly `locked`.

Removal and duplication options:

```ts
editor.removeElements(ids, {
  expandGroups?: boolean,   // default false
  includeLocked?: boolean,  // default false
  ignoreMissing?: boolean,  // default false; unknown ids throw
});

editor.duplicateElements(ids, {
  offset?: { x: number; y: number },       // default { x: 5, y: 5 }
  boxes?: Record<string, ElementBox>,      // per-source explicit box
  expandGroups?: boolean,                  // default false
});

editor.moveElements(ids, {
  pageId?: string,                          // defaults to each element's page
  index?: number,                           // z-order insertion index
  offset?: { x: number; y: number },
  expandGroups?: boolean,
});
```

`TemplateEditor` keeps template-owned identities consistent:

- table row, column, and footer ids are regenerated when duplicated;
- grid column/row ids are regenerated;
- element groups are remapped and normalized;
- table pagination lists and summary output references are remapped on copy;
- references to deleted elements are removed;
- references that would cross pages after a move are dropped.

### JSON and validation

```ts
import {
  parseTemplateJson,
  stringifyTemplateJson,
  validateTemplateFile,
} from 'layoutpdf/core';

const file = parseTemplateJson(json);
const issues = validateTemplateFile(file); // warnings + errors
const text = stringifyTemplateJson(file, { space: 2 });
```

`parseTemplateJson` and `stringifyTemplateJson` validate by default.
`validateTemplateFile` returns `ValidationIssue[]` with `severity`, `code`,
`message`, and optional `path`, `pageId`, `elementId`, and `inputKey`.

The JSON Schema at
[`schema/template.schema.json`](./schema/template.schema.json) describes the
serialized input shape. Regenerate it with `npm run docs:schema`.

## Rendering

### Browser engine

```ts
import { createDefaultEngine } from 'layoutpdf';

const engine = await createDefaultEngine({
  plugins,                    // optional; defaults to the full built-in set
  format: {                   // optional document-level overrides
    locale: 'zh-CN',
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
  },
});
```

`createDefaultEngine()` loads `/fonts/NotoSansCJKjp-Regular.otf` and the Bold
companion through `fetch`. To use another path:

```ts
import { createDefaultEngine, createDefaultFontManager } from 'layoutpdf';

const engine = await createDefaultEngine({
  fontManager: await createDefaultFontManager('/assets/fonts/'),
});
```

`DocumentEngine` exposes:

| Member | Description |
|---|---|
| `plugins` | `PluginRegistry` |
| `fontManager` | `PdfFontManager` |
| `pdfRenderers` / `domRenderers` | Renderer registries for `kind: 'plugin'` nodes |
| `createTemplate(options?)` | `TemplateBuilder` |
| `parseTemplateJson(json)` / `stringifyTemplateJson(file)` | JSON helpers |
| `createDocument(file, input?)` | `DocumentSession` |
| `createDocumentFromJson(json, input?)` | `DocumentSession` |

### `DocumentSession`

```ts
const session = engine.createDocument(template, { customerName: 'ACME' });

const renderDocument = session.preview();       // resolve + layout
const pdfBytes = await session.generatePdf();   // Uint8Array
```

`fill(input)` replaces the input record and invalidates the cached preview.

```ts
session.fill({ customerName: 'Globex' });
const nextPreview = session.preview();
```

A `RenderDocument` contains pages of positioned `RenderNode`s plus a list of
`RenderIssue`s. It is shared by `preview-react`, `preview-dom`, and the PDF
renderer.

### PDF options

```ts
const pdfBytes = await session.generatePdf({
  subsetter: true,          // HarfBuzz subsetting; falls back to full embed
  pageRange: [2, 4],        // 1-based inclusive
  strict: true,             // warning issues become fatal
  signal: abortController.signal,   // main-thread only
  onProgress: event => {            // main-thread only
    // { phase: 'prepare' | 'render' | 'save', page?, pageCount, completedPages }
  },
  metadata: {
    title: 'Invoice',
    author: 'Example Co.',
    keywords: ['invoice'],
  },
});
```

`strict` turns warning-level `RenderIssue`s into a
`LayoutPDFValidationError`. Errors are always fatal.

## Node / headless

The `pdf/node` entry never uses `fetch`, `location`, `document`, or `Worker`.
`createDefaultEngine()` from the package root is browser-only because it
resolves the bundled fonts against the page URL; in Node it throws an error
pointing at `createNodeEngine()`. Pass `fontManager` to `createDefaultEngine()`
if you want the browser engine with your own Node-loaded fonts.

```ts
import { createNodeEngine } from 'layoutpdf/pdf/node';

const engine = await createNodeEngine({
  fontPath: '/srv/fonts/NotoSansCJKjp-Regular.otf',
  boldFontPath: '/srv/fonts/NotoSansCJKjp-Bold.otf',
  familyName: 'Noto Sans CJK JP',
});

const pdf = await engine
  .createDocument(template, input)
  .generatePdf({ subsetter: true });
```

`createNodeEngine(options)`:

| Option | Description |
|---|---|
| `fontManager` | Prebuilt font manager; wins over other font options |
| `fonts` | Array of `{ name, path, family?, weight?, fallback? }` |
| `fontPath` / `boldFontPath` / `familyName` | Single regular/bold pair |
| `fontSubsetting` | `boolean` or `{ wasmPath?, wasmBytes? }`; defaults to `true` |
| `plugins` | Plugin registry/array; defaults to all built-ins |
| `format` | Document-level locale/currency/time-zone overrides |
| `pdfRenderers` / `domRenderers` | Custom renderer registrations |

When no font option is provided, `createNodeEngine()` looks for
`NotoSansCJKjp-Regular.otf` in `public/fonts`, the current working directory,
and the installed module. Since fonts are no longer shipped in the npm tarball,
production deployments should pass `fontPath`, `fonts`, or `fontManager`.

Font helpers:

```ts
import {
  createNodeFontManager,
  createDefaultNodeFontManager,
  configureNodeFontSubsetting,
  resolveBundledNodeFontPath,
} from 'layoutpdf/pdf/node';
```

## Worker PDF export

```ts
import PdfWorker from 'layoutpdf/pdf/worker?worker';
import { createDefaultEngine } from 'layoutpdf';

const engine = await createDefaultEngine({
  pdfExecutionTarget: 'worker',
  pdfWorkerFactory: () => new PdfWorker(),
});
```

Other bundlers can pass their own worker URL with `createPdfWorker(url)`.

Worker limitations:

- `pageRange` and `strict` are supported.
- `signal` and `onProgress` throw; they are main-thread only.
- Custom `kind: 'plugin'` nodes cannot be rendered unless the same renderer
  code is bundled into the worker. Main-thread rendering has no such limit.

## Preview

### React

```tsx
import { PreviewDocument } from 'layoutpdf/preview-react';

<PreviewDocument
  document={renderDocument}
  zoom={1}
  pluginRenderers={engine.domRenderers}
  mode="form"                  // 'preview' | 'form'
  onInputChange={(key, value) => updateInput(key, value)}
/>
```

`preview-react` also exports `RenderDocumentView`, `RenderPage`, and
`RenderElement` for custom composition.

### Framework-independent DOM

```ts
import {
  createDomPreview,
  mountDomPreview,
  renderDomPreview,
} from 'layoutpdf/preview-dom';

const handle = createDomPreview(renderDocument, {
  mode: 'form',
  zoom: 1.25,
  pageGapPx: 24,
  resolveAssetUrl: assetId => `/assets/${assetId}`,
  pluginRenderers: engine.domRenderers,
  onInputChange: (key, value) => updateInput(key, value),
});

host.append(handle.element);
handle.update(nextDocument);
handle.destroy();
```

`mountDomPreview(container, document, options)` mounts and returns a handle;
`renderDomPreview(document, options)` returns an element directly.

DOM plugin renderers must return a DOM `Node` or a string. React elements are
only supported by `preview-react`.

## Plugins and renderers

```ts
import { definePlugin } from 'layoutpdf/core';

const stampPlugin = definePlugin({
  metadata: { type: 'stamp', label: 'Stamp', category: 'business' },
  propsSchema,
  valueSchema,
  createDefaultElement,
  properties,
  buildRenderNodes,
  renderers: {
    pdf(node, context) { /* pdf-lib drawing */ },
    dom(node, context) { /* optional HTML/React element */ },
  },
});

const engine = await createDefaultEngine({
  plugins: [...plugins, stampPlugin],
});
```

`definePluginPack` groups related plugins. Custom render nodes use
`kind: 'plugin'` with a unique `pluginType`; PDF and DOM renderers are looked up
by that type. Entries passed directly through `pdfRenderers` / `domRenderers`
override plugin-contributed renderers with the same type.

See [`plugin-guide.md`](./plugin-guide.md) for the full contract, schema rules,
and worker caveats.

## Designer

```tsx
import { useRef } from 'react';
import { Designer, type DesignerCommandApi } from 'layoutpdf/designer';

const ref = useRef<DesignerCommandApi>(null);

<Designer
  ref={ref}
  engine={engine}
  template={template}
  input={input}
  theme={{ '--layoutpdf-color-primary': '#2563eb' }}
  storage={settingsStorage}
  settingsKey="my-app:designer"
  storageAdapter={designerStorage}
  locale="zh-CN"
  propertyEditors={propertyEditors}
  onTemplateChange={setTemplate}
  onPdf={savePdf}
/>;
```

`DesignerProps` includes `engine`, `template`, `input`, `presets`,
`reusableBlocks`, `onTemplateChange`, `onPreview`, `onExportJson`, `onPdf`,
`onError`, `propertyEditors`, `storageAdapter`, `theme`, `storage`,
`settingsKey`, `locale`, `errorFallback`, and `className`.

Command API: `getTemplate`, `loadTemplate`, `exportJson`, `preview`,
`generatePdf`, `saveTemplate`.

The Web Component `<layoutpdf-designer>` mirrors these props and emits
`template-change`, `preview`, `template-json-export`, `pdf-generated`, and
`designer-error`.

## Errors

Engine operations throw typed errors where possible:

- `LayoutPDFValidationError` — `issues: ValidationIssue[]`. Raised by document
  validation, `strict` PDF export, and blocking render issues.
- `LayoutPDFRuntimeError` — `code: string` and `values`. Use
  `isLayoutPDFRuntimeError(error)` to narrow.

`TemplateEditor` codes:

| Code | Meaning |
|---|---|
| `PAGE_NOT_FOUND` | Unknown page id |
| `ELEMENT_NOT_FOUND` | Unknown element id |
| `PAGE_ID_CONFLICT` | Explicit page id already exists |
| `ELEMENT_ID_CONFLICT` | Element id or generated duplicate id already exists |
| `LAST_PAGE_REQUIRED` | Tried to remove the only page |
| `ELEMENT_LOCKED` | Tried to edit/remove a locked element without `force`/`includeLocked` |
| `INVALID_PAGE_PADDING` | Padding leaves no positive content area |
| `PLUGIN_REGISTRY_REQUIRED` | Called `addElement` without `{ plugins }` |

Plugin resolution errors, font errors, and PDF worker limitations currently
throw plain `Error` instances with descriptive messages.

## Fonts

Font binaries are intentionally excluded from the npm package.

- Development/test checkout: `npm run fonts:fetch`
- Browser: serve your own fonts and pass a base URL to
  `createDefaultFontManager(baseUrl)`
- Node: pass `fontPath` / `fonts` / `fontManager` to `createNodeEngine`
- Node/browser subsetting uses `dist/fonts/hb-subset.wasm`, which **is** included
  in the package.

Missing glyphs are detected per font. The default policy is `throw`:

```ts
import { createFontManager } from 'layoutpdf/pdf';

const fontManager = createFontManager(fonts, {
  missingGlyphPolicy: 'warn', // 'throw' | 'warn' | 'ignore'
  onMissingGlyphs: (fontName, missing) => report(fontName, missing),
});
```

`warn` logs and continues; `ignore` skips the check; `onMissingGlyphs` is called
before the policy is applied.

## Versioning

See [`release.md`](./release.md). Template files currently use
`format: "layoutpdf-template"` and `version: 3`. The package follows SemVer;
pre-1.0 minor releases may include breaking changes.
