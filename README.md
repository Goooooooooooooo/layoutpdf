# LayoutPDF

Browser and WebView template layout and PDF rendering engine. It provides a core rendering pipeline, a visual designer, built-in plugins, and extension points for custom plugins, renderers, fonts, and storage.

- **Layout designer** — drag-and-drop template authoring with a framework-independent Custom Element.
- **Render core** — template + input → `RenderDocument` → laid-out pages, shared by preview and PDF.
- **Plugin core** — schema-validated plugins that can contribute custom nodes and PDF renderers.
- **PDF module** — pdf-lib based rendering with CJK font subsetting.

Architecture: [`docs/architecture.md`](./docs/architecture.md)  
API reference: [`docs/api.md`](./docs/api.md)  
Plugin guide: [`docs/plugin-guide.md`](./docs/plugin-guide.md)  
Changelog: [`CHANGELOG.md`](./CHANGELOG.md)

## Install

The package is distributed from this repository, not from npm. Install it
straight from Git — the `prepare` script builds it during install:

```sh
npm install github:Goooooooooooooo/layoutpdf#v0.1.0
```

Pin a tag or commit so installs stay reproducible. `#main` also works, but it
follows the tip of the branch.

To build and vendor the artifact yourself:

```sh
git clone https://github.com/Goooooooooooooo/layoutpdf.git
cd layoutpdf && npm ci && npm run build && npm pack
# then, in your app:
npm install /absolute/path/to/layoutpdf-0.1.0.tgz
```

A `file:` dependency (`npm install ../layoutpdf`) also works, but npm does not
build those: run `npm run build` in the checkout first, and again after each
pull.

All examples below import from `layoutpdf`, the package name, whichever route
you picked.

Runtime requirements:

- **ESM only.** There is no CommonJS build; use `import`, not `require`.
- **Node `>=22.13.0`** for the Node/PDF entries. The browser build has no Node
  requirement.
- **`react` / `react-dom` `>=18.3.0` are optional peers.** They are only needed
  by `layoutpdf/designer` and `layoutpdf/preview-react`.
- **Browsers:** Chrome/Edge 107+, Firefox 104+, Safari 16+. There is no ES5
  build; see [Browser support](#browser-support).
- **Font binaries are not bundled.** Read [Fonts](#fonts) before your first
  export; the default engine fetches two OTF files at startup.

## Your first document

Add the fonts, then render a template to PDF. Any bundler works; the package
ships no global script build, so a bundler is required. With Vite:

```sh
npm create vite@latest my-app -- --template vanilla-ts
cd my-app && npm install github:Goooooooooooooo/layoutpdf#v0.1.0
mkdir -p public/fonts
cp node_modules/layoutpdf/dist/fonts/hb-subset.wasm public/fonts/
curl -LO --output-dir public/fonts \
  https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf \
  https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf
```

```ts
// main.ts
import {
  createDefaultEngine,
  createDefaultFontManager,
} from 'layoutpdf';

const engine = await createDefaultEngine({
  fontManager: await createDefaultFontManager('/fonts/'),
});

const template = engine.createTemplate({ name: 'Quote' })
  .addElement('label', { x: 20, y: 20, value: 'Quote' })
  .addElement('text', {
    x: 20, y: 40,
    name: 'Customer',
    binding: { key: 'customerName' },
  })
  .build();

const doc = engine.createDocument(template)
  .fill({ customerName: 'Example customer' });

const preview = doc.preview();            // laid-out RenderDocument
const pdfBytes = await doc.generatePdf({ subsetter: true }); // Uint8Array starting with %PDF-

console.log(preview.pages.length, pdfBytes.byteLength);
```

`subsetter: true` keeps the PDF small by embedding only the glyphs the template
uses; it reads `/fonts/hb-subset.wasm`, which is why the command above copies
that file too. Without it the full OTF is embedded.

Calling `createDefaultEngine()` without a `fontManager` uses `/fonts/` relative
to the page, which is why the files above must be served from there.
Downloading or saving the bytes is the host application's responsibility.

## Add the visual designer

```ts
import 'layoutpdf/designer';

const designer = document.createElement('layoutpdf-designer');
designer.engine = engine;
designer.template = template;                 // or a saved template JSON

designer.addEventListener('template-change', event => {
  localStorage.setItem('draft', engine.stringifyTemplateJson(event.detail));
});
designer.addEventListener('pdf-generated', event => {
  const url = URL.createObjectURL(new Blob([event.detail], { type: 'application/pdf' }));
  window.open(url);
});

document.body.append(designer);               // parent needs a real height
```

React hosts can use `<Designer>` directly; see
[Embedding the designer](#embedding-the-designer).

## Node / server-side PDF

```ts
import { createNodeEngine } from 'layoutpdf/pdf/node';

const engine = await createNodeEngine({
  fontPath: '/srv/fonts/NotoSansCJKjp-Regular.otf',
  boldFontPath: '/srv/fonts/NotoSansCJKjp-Bold.otf',
});
```

`createDefaultEngine()` is browser-oriented and rejects in Node with a message
pointing here.

## Headless template editing

`TemplateEditor` covers page and element `add`, `update`, `remove`, `move`, and
`duplicate` operations without React or a DOM:

```ts
import { TemplateEditor } from 'layoutpdf/core';

const editor = new TemplateEditor(template, { plugins });
const text = editor.addElement('text', { x: 20, y: 30 });
editor.updateElement(text.id, { path: 'box.width', value: 120 });
const [copy] = editor.duplicateElement(text.id);
editor.removeElement(copy.id);
const nextTemplate = editor.toFile();
```

It regenerates table/grid identities on copy and repairs group, pagination, and
summary references on delete/move. See [`docs/api.md`](./docs/api.md) for the
full method list and error codes. The serialized format is documented by
[`docs/schema/template.schema.json`](./docs/schema/template.schema.json)
(`npm run docs:schema` regenerates it).

## Package entries

| Entry | Contents |
|---|---|
| `layoutpdf` | Default engine + batteries-included plugins + font manager |
| `layoutpdf/core` | Template, input, plugin registry, renderer registry, layout, PDF types |
| `layoutpdf/pdf` | PDF renderer, font manager, worker client |
| `layoutpdf/pdf/node` | Node/headless engine, file-based fonts, wasm subsetting |
| `layoutpdf/pdf/worker` | PDF export worker entry |
| `layoutpdf/plugins` | Default full plugin set |
| `layoutpdf/plugins/basic` | Text, shape, image, barcode, QR, form controls |
| `layoutpdf/plugins/business` | Table, grid, summary block, calculated field |
| `layoutpdf/preview-react` | Standalone React preview components |
| `layoutpdf/preview-dom` | Framework-independent DOM preview |
| `layoutpdf/presets` | Invoice preset, reusable blocks |
| `layoutpdf/i18n` | Locale settings, formatters, messages |
| `layoutpdf/designer` | Optional React + Web Component designer |
| `layoutpdf/schema/template.schema.json` | JSON Schema for the template format |

Lean consumers can use `plugins/basic` and skip the business plugin code.

React is an optional peer dependency. It is only required by
`layoutpdf/designer` and `layoutpdf/preview-react`.

## Locale and formatting

Template metadata provides the base locale. The engine can override it per host
application:

```ts
const engine = await createDefaultEngine({
  format: {
    locale: 'zh-CN',
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
  },
});
```

When `locale` changes, currency/calendar/time-zone defaults follow that locale;
any explicitly provided field wins.

## Standalone preview

```tsx
import { createDefaultEngine } from 'layoutpdf';
import { PreviewDocument } from 'layoutpdf/preview-react';

const document = engine
  .createDocument(template, { customerName: 'Example customer' })
  .preview();

export function QuotePreview() {
  return (
    <PreviewDocument
      document={document}
      zoom={1}
      pluginRenderers={engine.domRenderers}
    />
  );
}
```

## Framework-independent preview

`layoutpdf/preview-dom` renders the same `RenderDocument` without
React or any CSS framework:

```ts
import { mountDomPreview, renderDomPreview } from 'layoutpdf/preview-dom';

// One-shot element:
host.append(renderDomPreview(document, { zoom: 1.5 }));

// Or a live handle:
const preview = mountDomPreview(host, document, {
  mode: 'form',
  onInputChange: (key, value) => updateInput(key, value),
});
preview.update(nextDocument);
preview.destroy();
```

Plugin DOM renderers must return a DOM `Node` or a string in this adapter.
React elements are only supported by `preview-react`.

## Custom plugins and renderers

Plugins declare their data, property panel metadata, render nodes, and optional PDF renderer:

```ts
import { z } from 'zod';
import { definePlugin } from 'layoutpdf/core';

export const stampPlugin = definePlugin({
  metadata: { type: 'stamp', label: 'Stamp', category: 'business' },
  propsSchema: z.object({ text: z.string() }),
  valueSchema: z.string(),

  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'stamp',
      name: 'Stamp',
      box: { ...position, width: 40, height: 40 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: 'APPROVED',
      props: { text: 'APPROVED' },
    };
  },

  properties: [
    { path: 'props.text', label: 'Text', editor: 'text' },
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
      payload: (element.props as { text: string }),
      textRuns: [{ text: value }],
    }];
  },

  renderers: {
    pdf(node, context) {
      // Paint with pdf-lib.
    },
  },
});
```

Register it at engine creation:

```ts
const engine = await createDefaultEngine({
  plugins: [...defaultPlugins, stampPlugin],
});
```

See [`docs/plugin-guide.md`](./docs/plugin-guide.md) for custom renderers, font subsetting rules, and the worker limitation.

## Embedding the designer

The designer is an optional entry; core-only consumers do not load its UI or React runtime.

```ts
import { createDefaultEngine } from 'layoutpdf';
import 'layoutpdf/designer';

const engine = await createDefaultEngine();
const designer = document.createElement('layoutpdf-designer');
designer.engine = engine;
designer.template = engine.parseTemplateJson(templateJson);
designer.addEventListener('template-change', event => saveTemplate(event.detail));
designer.addEventListener('preview', event => showPreview(event.detail));
designer.addEventListener('pdf-generated', event => savePdf(event.detail));
document.querySelector('#designer-host').append(designer);
```

The designer uses the supplied engine registry. Application storage and business logic remain consumer-owned.

### Designer theme and preferences

```tsx
import { Designer } from 'layoutpdf/designer';

<Designer
  engine={engine}
  template={template}
  theme={{
    '--layoutpdf-color-primary': '#2563eb',
    '--layoutpdf-color-primary-hover': '#1d4ed8',
    '--layoutpdf-color-workspace': '#f8fafc',
  }}
  storage={myStorage}          // { getItem, setItem }
  settingsKey="my-app:designer"
/>
```

`theme` overrides any `--layoutpdf-*` token from `designer-tokens.css`. Editor
preferences (grid, snap, panel sizes) are persisted through `storage`; when it
is omitted, `window.localStorage` is used if available.

### Persist templates and reusable blocks

```tsx
import { createLocalDesignerStorage } from 'layoutpdf/designer';

<Designer
  engine={engine}
  template={template}
  storageAdapter={createLocalDesignerStorage('my-app')}
/>
```

`storageAdapter` is optional and supports `listTemplates`, `loadTemplate`,
`saveTemplate`, `deleteTemplate`, `listReusableBlocks`, `saveReusableBlock`, and
`deleteReusableBlock`. `createMemoryDesignerStorage()` and
`createStorageDesignerStorage(storage, prefix)` are provided for tests and custom
key/value backends. When `reusableBlocks` is passed as a prop, it wins over the
adapter list.

### Custom property editors

```tsx
import type { DesignerPropertyEditors } from 'layoutpdf/designer';

const propertyEditors: DesignerPropertyEditors = {
  text: {
    ownedPaths: ['value'],
    component: ({ element, patch, disabled }) => (
      <textarea
        disabled={disabled}
        value={String(element.value ?? '')}
        onChange={event => patch('value', event.currentTarget.value)}
      />
    ),
  },
};

<Designer engine={engine} template={template} propertyEditors={propertyEditors} />
```

The editor receives `element`, `disabled`, `templateFile`, `patch(path, value)`,
and `patchMany(patches)`. Paths listed in `ownedPaths` are hidden from the
generated fields. A plain component is also accepted when no paths are owned.

### Designer keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Delete` / `Backspace` | Delete the selected elements |
| `⌘/Ctrl+Z` | Undo |
| `⌘/Ctrl+Shift+Z`, `Ctrl+Y` | Redo |
| `⌘/Ctrl+C` / `⌘/Ctrl+V` | Copy / paste elements |
| `⌘/Ctrl+D` | Duplicate |
| `⌘/Ctrl+A` | Select every element on the active page |
| `⌘/Ctrl+G` / `⌘/Ctrl+Shift+G` | Group / ungroup |

Shortcuts are only active in designer mode and are ignored while a property
field or other editable control has focus, so typing `z` or `Backspace` in a
field never edits elements.

### Command API

```tsx
import { useRef } from 'react';
import type { DesignerCommandApi } from 'layoutpdf/designer';

const designer = useRef<DesignerCommandApi>(null);
<Designer ref={designer} engine={engine} template={template} />;

const pdf = await designer.current?.generatePdf({ subsetter: true });
const json = designer.current?.exportJson({ space: 2 });
await designer.current?.saveTemplate();
```

Commands: `getTemplate`, `loadTemplate`, `exportJson`, `preview`,
`generatePdf`, and `saveTemplate`.

### Locale, errors, and the Web Component

`locale` switches the designer UI (`zh-CN`, `ja-JP`, `en-US`) and stays in sync
with `setCurrentAppLocale`. `DesignerErrorBoundary` wraps the tree; pass
`errorFallback(error, reset)` to replace its default UI.

The Web Component mirrors the React props as properties (`propertyEditors`,
`storageAdapter`, `locale`, `theme`, `storage`, `settingsKey`, ...), exposes the
command API through `commands` as well as `saveTemplate()`, `generatePdf()`,
`exportJson()`, `preview()`, `getTemplate()`, and `loadTemplate()`, and emits
`template-change`, `preview`, `template-json-export`, `pdf-generated`, and
`designer-error` events.

## Node and headless PDF

The `pdf/node` entry renders without `fetch`, `location`, `document`, or
`Worker`. `createDefaultEngine()` from the package root is browser-only: it
loads the bundled fonts relative to the page URL, so in Node use
`createNodeEngine()` or pass your own `fontManager`.

```ts
import { createNodeEngine } from 'layoutpdf/pdf/node';

// Point at your own font. Recommended for production because font binaries
// are not shipped in the npm tarball.
const engine = await createNodeEngine({
  fontPath: '/srv/fonts/MySans-Regular.otf',
  boldFontPath: '/srv/fonts/MySans-Bold.otf',
  familyName: 'MySans',
});

// In a checkout that has run `npm run fonts:fetch`, the bundled development
// fonts under `public/fonts` are found automatically.
const devEngine = await createNodeEngine();

const bytes = await engine
  .createDocument(template, input)
  .generatePdf({ subsetter: true });
```

`subsetter: true` is opt-in. Without it the whole OTF is embedded, which is
about 14 MB for the default Noto CJK pair. `createNodeEngine()` points the
HarfBuzz wasm at the copy shipped in `dist/fonts/`, so subsetting needs no extra
setup in Node; if the wasm cannot be loaded the export logs a warning and falls
back to full-font embedding. To control it:

```ts
import {
  configureNodeFontSubsetting,
  createNodeFontManager,
} from 'layoutpdf/pdf/node';

await configureNodeFontSubsetting({ wasmPath: '/srv/assets/hb-subset.wasm' });

const fontManager = await createNodeFontManager([
  { name: 'Brand Regular', path: '/srv/fonts/Brand-Regular.otf', fallback: true },
  { name: 'Brand Bold', path: '/srv/fonts/Brand-Bold.otf', weight: 'bold' },
]);
```

## PDF export options

```ts
const bytes = await document.generatePdf({
  subsetter: true,
  pageRange: [2, 4],        // 1-based, inclusive
  strict: true,             // warning issues become fatal
  signal: abortController.signal,
  onProgress: event => {
    // { phase: 'prepare' | 'render' | 'save', page?, pageCount, completedPages }
    console.log(event.phase, event.completedPages, '/', event.pageCount);
  },
});
```

`signal` and `onProgress` are main-thread only. Worker mode supports
`pageRange` and `strict`.

## Worker PDF export

`layoutpdf/pdf/worker` is a ready-made module worker. With Vite:

```ts
import PdfWorker from 'layoutpdf/pdf/worker?worker';
import { createDefaultEngine } from 'layoutpdf';

const engine = await createDefaultEngine({
  pdfExecutionTarget: 'worker',
  pdfWorkerFactory: () => new PdfWorker(),
});
```

Other bundlers can use `createPdfWorker(url)` with their own worker URL. Custom
`kind: 'plugin'` nodes are not supported in worker mode unless the same
renderers are bundled into the worker.

A complete Vite setup is in `examples/worker` (`npm run dev:worker-example`).
The example uses `?worker` so the bundler emits a real worker chunk instead of
inlining it as a data URL.

## Fonts

Font binaries are **not** included in the npm tarball. Keeping the ~32 MB Noto
CJK pair out of the package lets hosts choose their own font, serve it from a
CDN, or install it as a deployment asset. Only the HarfBuzz subsetter wasm and
license notices are emitted under `dist/fonts/`.

For development and the bundled examples:

```sh
npm run fonts:fetch
```

For an app build, copy your OTF/TTF files to the app's public `fonts/`
directory or pass a matching base URL to `createDefaultFontManager()`:

```ts
const engine = await createDefaultEngine({
  fontManager: await createDefaultFontManager('/assets/fonts/'),
});
```

For Node, pass `fontPath` / `fonts` / `fontManager` to `createNodeEngine()`.

Subsetting in the browser also needs the HarfBuzz wasm next to the fonts:
copy `node_modules/layoutpdf/dist/fonts/hb-subset.wasm` to the same
directory and pass `{ subsetter: true }` to `generatePdf()`. It is fetched from
`/fonts/hb-subset.wasm` by default; call `setSubsetWasmLoader()` to serve it
from somewhere else.

Hosts that load fonts themselves can use `createFontManager()` or `createPdfFontFromBytes()`.

The Noto CJK JP files used by the examples cover Latin, Japanese, Simplified
Chinese, and Traditional Chinese glyphs used by the default plugins. If a
template uses a character outside its coverage, choose a policy:

```ts
const fontManager = createFontManager(fonts, {
  missingGlyphPolicy: 'warn', // 'throw' | 'warn' | 'ignore'
  onMissingGlyphs: (fontName, missing) => reportFontIssue(fontName, missing),
});
```

`throw` is the default and blocks PDF export with a descriptive error. `warn`
logs the missing characters and continues, which is useful while authoring a
template. `ignore` disables the check for hosts that guarantee coverage
elsewhere.

## Development

```sh
npm run typecheck
npm test
npm run test:update-golden
npm run docs:schema
npm run fonts:fetch
npm run build
npm run smoke          # installs the tarball and renders a PDF
npm run check:tarball  # asserts what npm pack ships
npm run check:package  # publint + arethetypeswrong
npm run check:dist     # smoke + tarball + install + package checks
npm run dev:example
npm run dev:core-example
npm run dev:node-example
npm run dev:worker-example
```

`npm run verify` repeats the typecheck, tests, build, and all three
distribution checks, so run it before tagging a release.

The package targets browsers, embedded WebViews, and Node. Node/headless PDF is
available through `layoutpdf/pdf/node`.

### Browser support

The build targets ES2023. The newest runtime APIs in the bundle are
`structuredClone`, `Array.prototype.at`, `Object.hasOwn`, and
`Array.prototype.findLast`, so the floor is:

| Runtime | Minimum |
| --- | --- |
| Chrome / Edge | 107 |
| Firefox | 104 |
| Safari / iOS Safari | 16 |
| Android System WebView | 107 |

Older engines need to transpile the package themselves; there is no ES5 build.
