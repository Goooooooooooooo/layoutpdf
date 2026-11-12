# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). See [`docs/release.md`](./docs/release.md)
for the pre-1.0 version policy.

## [Unreleased]

### Added

- `npm run check:tarball` asserts the exact `npm pack` file list: every
  `exports` target exists, `sideEffects` entries exist, no font binaries or
  `src`/tests/examples leak, and packed/unpacked sizes stay within budget.
- `npm run check:package` runs `publint` and `arethetypeswrong`
  (`esm-only` profile). Both run in CI and in `prepublishOnly`.
- `npm run check:install` packs the tarball, installs it into an empty project,
  and loads every public entry: core entries without React, UI entries with it,
  the designer entry on a server, and a subsetted PDF that proves the shipped
  `hb-subset.wasm` is reachable after installation.
- `.github/workflows/release.yml` publishes on `v*` tags with npm provenance
  after verifying that the tag matches `package.json`.
- README documents the installed-package workflow, browser support, and the
  distribution checks.

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

### Changed

- README now starts with the published-package workflow (`npm install
  layoutpdf`, fonts, browser designer, Node PDF) instead of the
  repository development commands.

## [0.1.0] - 2026-11-09

First public integration release.

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

### Changed

- Renamed the package and public identifiers before the first publish:
  package `layoutpdf`, custom element `<layoutpdf-designer>`, template
  format `layoutpdf-template`, class prefix `LayoutPDF*`, and CSS variables `--layoutpdf-*`.
- Font binaries are no longer shipped in the npm tarball. Use
  `npm run fonts:fetch` for development, or provide a font path/base URL in
  production.
- The library build no longer copies the entire `public/` directory; only the
  subsetter wasm and license notices are emitted under `dist/fonts/`.

### Fixed

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
