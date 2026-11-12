# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). See [`docs/release.md`](./docs/release.md)
for the pre-1.0 version policy.

## [0.1.2] - 2026-11-12

### Added

- The designer demo has a **填写数据** tab that renders the document with
  `RenderDocumentView mode="form"`: editable text, table cells, and add/delete
  row controls. The PDF button exports whatever was filled in.
- A "Fill in the data" section in the README and a screenshot of the form view.

### Fixed

- Form mode no longer paints the static text under the input that covers it, so
  multiline and formatted values stop showing doubled. The element background
  and border are still rendered.

## [0.1.1] - 2026-11-12

### Added

- Screenshots of the designer and of preview mode in the README.
- `examples/designer` is published to GitHub Pages by
  `.github/workflows/pages.yml` and seeds the invoice preset with sample input,
  so the demo shows a real document instead of two blank elements.

### Fixed

- The invoice preset no longer puts an old placeholder company name in the bank
  transfer line.

## [0.1.0] - 2026-11-12

First public release.

### Added

- Engine, renderer, and PDF entry points with one installable package.
- `TemplateEditor` headless API for page and element `add`, `update`, `remove`,
  `move`, and `duplicate` operations, including table, group, pagination, and
  summary reference repair.
- JSON Schema for the serialized template file at
  [`docs/schema/template.schema.json`](./docs/schema/template.schema.json).
- API reference at [`docs/api.md`](./docs/api.md).
- Golden PDF regression tests and `npm run test:update-golden`.
- Browser, Node, and worker PDF execution targets.
- Framework-independent `preview-dom` entry.
- Custom designer property editors, storage adapters, theme tokens, locale, and
  command API.
- `missingGlyphPolicy` and `onMissingGlyphs` for font coverage diagnostics.
- Node font subsetting through HarfBuzz wasm.
- Designer keyboard shortcuts for delete, undo/redo, copy/paste, duplicate,
  select-all, group, and ungroup, matching the hints in the canvas menu.
- `npm run check:tarball` asserts the exact `npm pack` file list: every
  `exports` target exists, `sideEffects` entries exist, no font binaries or
  `src`/tests/examples leak, and packed/unpacked sizes stay within budget.
- `npm run check:package` runs `publint` and `arethetypeswrong`
  (`esm-only` profile). Both run in CI.
- `npm run check:install` packs the tarball, installs it into an empty project,
  and loads every public entry: core entries without React, UI entries with it,
  the designer entry on a server, and a subsetted PDF that proves the shipped
  `hb-subset.wasm` is reachable after installation.
- `npm run verify` chains typecheck, tests, build, and the distribution checks;
  CI runs the same commands.
- `prepare` builds `dist/` on install, so `npm install github:...` and
  `npm pack` work from a bare checkout.
- `npm test` fails fast with an actionable message when the development fonts
  are missing, instead of reporting twenty ENOENT failures.
- README documents the Git-based install routes, browser support, and the
  distribution checks.

### Changed

- Renamed the package and public identifiers before the first publish:
  package `layoutpdf`, custom element `<layoutpdf-designer>`, template
  format `layoutpdf-template`, class prefix `LayoutPDF*`, and CSS variables `--layoutpdf-*`.
- Font binaries are no longer shipped in the package. Use
  `npm run fonts:fetch` for development, or provide a font path/base URL in
  production.
- The library build no longer copies the entire `public/` directory; only the
  subsetter wasm and license notices are emitted under `dist/fonts/`.
- README now starts with the install workflow (Git dependency or vendored
  tarball, fonts, browser designer, Node PDF) instead of the repository
  development commands.

### Fixed

- Pin `pdfjs-dist` to the exact version whose worker is inlined into the
  designer chunk. A caret range let a consumer resolve a newer build than the
  embedded worker, which pdfjs rejects with an API/Worker version mismatch and
  breaks PDF page-background preview.
- `layoutpdf/designer` no longer throws `HTMLElement is not defined`
  when a server evaluates the module. The custom element falls back to a plain
  base class and `registerLayoutPDFDesigner()` is a no-op without a DOM, so SSR
  frameworks can import the entry safely. `npm run smoke` now checks this in a
  child process without DOM globals.
- New elements are no longer stacked on top of each other at the page origin.
  `findAvailablePosition` spread the caller's full element box into the
  candidate, which overwrote the search coordinates and always fell back to the
  padding origin.
- The designer now ships and injects the canvas chrome stylesheet (rulers,
  selection boxes, resize handles, snap guides, marquee, page positioning).
  It was previously orphaned, so drag/selection chrome rendered unstyled and
  added elements appeared at the wrong position.
- Published types no longer contain directory imports (`import("..")`), so they
  resolve under `moduleResolution: node16`/`nodenext`.
- `sideEffects` now lists the designer and PDF worker entries, so a
  side-effect-only `import 'layoutpdf/designer'` is not tree-shaken.
- `createDefaultEngine()` now throws an actionable error in Node instead of
  `ReferenceError: location is not defined`, pointing at `createNodeEngine()`.
- Summary and table pagination references are repaired consistently across
  designer and headless editing paths.
- Copying elements now immediately enables paste; the clipboard was stored in a
  ref, so `hasClipboard` stayed false until an unrelated re-render.
