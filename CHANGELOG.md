# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). See [`docs/release.md`](./docs/release.md)
for the pre-1.0 version policy.

## [Unreleased]

### Added

- The default font can be chosen explicitly instead of depending on object
  order: `createFontManager(fonts, { defaultFont })`, or `defaultFont` on
  `createDefaultEngine` / `createNodeEngine`. An unknown name fails with the
  list of available faces.
- Text elements expose a font picker in the designer (`props.fontName`). The
  options come from `FontManager.listFontFamilies()`, which the built-in
  manager implements; options are families, so the element's weight toggle
  still selects the matching face. Managers without it fall back to a
  free-text font name, and clearing the field returns the element to the
  engine default.
- Table columns and footers expose decimal places in the property panel, and a
  shared numeric format editor can pick the negative style: `¥-1,000`,
  `-¥1,000`, `(¥1,000)`, or `▲¥1,000`. Currency and calculation elements expose
  the same negative-style option.
- Grid cells and columns accept an optional `numericFormat`, so formula results
  can be formatted per cell or per column.
- Table pagination accepts `ignoreElementIds`, so an explicitly placed floor
  element that should not constrain page breaks can be excluded. The option is
  additive and defaults to an empty list; existing templates load unchanged.
- Form-mode table previews expose add-row and delete-row controls. Rows missing
  an id, or sharing one, are repaired before an edit is reported.
- A `TABLE_CELL_OVERFLOW` warning is reported when a numeric cell or footer
  value is ellipsized. It is fatal only in strict mode.
- `FontManager.getFontMetrics` exposes vertical font metrics so PDF text uses
  the same ascent/descent and half-leading baseline as the DOM preview.
- Formula functions include `MOD(dividend, divisor)`, which takes the divisor's
  sign like a spreadsheet (`MOD(-7, 3)` is `2`). The `%` operator keeps the
  JavaScript remainder, so `-7 % 3` is `-1`.
- `TemplateEditor.removeElements` accepts `onDanglingOutputReference`, so a host
  can report formulas that still point at a deleted table output during the
  edit instead of waiting for render.
- Deleting elements in the designer warns when a surviving formula still
  references a table output that was removed. The deletion is not blocked, and
  undo restores a working reference.
- `migrateTemplate(json)` upgrades a serialized template to the current format.
  It runs a pure per-version migration chain, stamps each version, validates the
  result, and rejects a newer file with `TEMPLATE_VERSION_UNSUPPORTED` instead of
  silently dropping data. `CURRENT_TEMPLATE_VERSION` and `TEMPLATE_FORMAT` are
  exported for hosts that branch on the version.
- Loading or saving a template now resolves the short-lived group-based table
  pagination (`followGroupId`) into `finalElementIds`. `parseTemplateJson`,
  `stringifyTemplateJson`, and `migrateTemplate` normalize before validation, so
  a draft saved by that prototype keeps the placement of its final-page
  elements instead of silently losing it.
- Plugins can declare `apiVersion`. Bundled plugins declare `1`, and
  `createPluginRegistry` rejects an incompatible plugin with
  `PLUGIN_API_VERSION_UNSUPPORTED`. The field stays optional so existing
  third-party plugins keep compiling; `SUPPORTED_PLUGIN_API_VERSION` exposes the
  current contract version.
- `RenderDocument.version` identifies the node-shape contract and is emitted as
  `RENDER_DOCUMENT_VERSION` (`1`). `resolveRenderTree`, `layoutRenderTree`, and
  pagination preserve it, so workers and hosts can detect a mismatched IR.
- `npm run bench` runs a repeatable Node benchmark suite for a 500-row table
  (layout/pagination, PDF with and without CJK subsetting), a 50-page PDF, and
  a 300-element designer frame. It reports median/p95/min and records the
  initial baseline in `bench/BASELINE.md` before any optimization.

### Fixed

- Undo and redo keep the asset bytes that any reachable history snapshot still
  references, so undoing an image insertion and redoing it no longer leaves the
  element pointing at a deleted asset. History navigation also copies the asset
  map instead of mutating the previous state.
- Text can mix fonts per glyph. `createFontManager` walks a fallback chain,
  splits each line into font runs, and measures, previews, draws, and subsets
  each run with the face that actually covers it. Fonts marked `fallback: true`
  are tried first, and a different weight of the same family is not used as a
  glyph fallback. Measurement, run, and coverage caches are bounded and cleared
  when `replaceFontBytes` swaps a temporary subset.
- Text wrapping breaks at word boundaries instead of inside Latin words, drops
  the space at a line break, and applies Japanese/Chinese kinsoku: closing
  punctuation never starts a line and opening punctuation never ends one.
  Tables and text nodes wrap through the same function, so measurement,
  preview, and PDF use one line set.
- Table pagination derives its floor from the absolute top of the table, so a
  decoration starting above the table no longer truncates the rows.
- A table row that fits either the source-page slot or a continuation slot stays
  on the page where it fits; a later row that fits neither reports
  `TABLE_ROW_TOO_TALL` instead of looping.
- A larger `footer.fontSize` grows only the footer rows it affects, and
  pagination accounts for the same height the renderer uses.
- PDF and DOM table borders agree: zero-width borders are skipped in both, and
  PDF dash arrays scale with the stroke width.
- PDF text baselines now account for font ascent/descent and half-leading, so
  text at `lineHeight` 1.0, 1.5, and 3.0 sits where the DOM preview puts it.
- A numeric or currency input cell that receives non-numeric text is marked as
  a formula error in that cell only. A footer that depends on it stays visible
  as an error cell but is not published as an output or derived field.
- `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `FLOOR`, and `CEIL` normalise binary
  floating-point residue before rounding, and never return `-0`. Formula
  equality and `IF` conditions use the same tolerance, so
  `IF(0.1 + 0.2 = 0.3, …)` is true.
- Table footers and published outputs default to the source column's decimal
  places. Exported values are rounded like the printed value, so a summary
  block and its source footer show the same total.
- Japanese date formatting selects the era from the date's actual boundary
  (Meiji/Taisho/Showa/Heisei/Reiwa), falls back to Gregorian before Meiji, and
  never prints an era year at or below zero. Showa, Taisho, and Meiji are now
  selectable.
- Impossible calendar dates such as `2024-02-31` are rejected instead of being
  silently rolled into March.
- Grid aggregates skip blank cells, arithmetic coerces them to zero, and a
  formula referencing non-numeric text reports `#ERR` instead of silently using
  zero.
- Currency formatting keeps the suffix in the left-edge symbol layout, and
  calculation elements in number format apply their configured prefix and
  suffix.
- Number display rounds before deciding whether a value is zero, so small
  negatives no longer print as `-0`.
- A formula reference name stops at a subtraction operator, so `field.qty-1`
  is the field minus one instead of a reference named `field.qty-1`. Hyphens
  inside a name still work when the next character starts a word, as in
  `field.customer-name`.
- Deleting a grid row or column shrinks a formula range instead of breaking it:
  deleting a row from `=SUM(A1:A3)` gives `=SUM(A1:A2)`, and only a range whose
  every cell is gone becomes `=SUM(#REF!)`.
- Duplicating elements remaps `calc` formulas to the copied table's outputs, so
  a copied calculation reads the copy instead of the original.
- Removing a table reports the formulas that now point at its deleted outputs,
  so the editor can surface the problem before render. The report scans every
  page, not only the page that owned the deleted element.
- Grid cells resolve their column key at the first `:`, so a column key that
  contains a colon still lays out correctly.

### Removed

- `FormatDateOptions.timeZone`. Date values are calendar dates, so a time zone
  never applied. `FormatLocaleSettings.timeZone` remains for app timestamps.

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
