# Release and versioning

## Version policy

The package follows Semantic Versioning.

- `0.x` releases may include breaking changes in minor versions. Patch releases
  are reserved for fixes and documentation updates.
- `1.0.0` freezes the public entry points and exported types described in
  [`api.md`](./api.md). Breaking changes after `1.0.0` require a major bump.
- Deprecations get one minor release of notice via `@deprecated` JSDoc and the
  changelog before the symbol is removed in the next major.
- Template files carry `format: "layoutpdf-template"` and `version: 3`.
  A schema change that cannot read existing v3 files requires a new template
  version and a migration path.

## Public API surface

Only these are supported:

- The entry points listed in `package.json#exports`.
- Every symbol, type, and option exported from those entries, as documented in
  [`api.md`](./api.md).
- The `format: "layoutpdf-template"` JSON contract, including the JSON Schema at
  [`schema/template.schema.json`](./schema/template.schema.json).

Everything else is internal: hashed chunks in `dist/`, `src/` paths, and types
that are not re-exported. Importing an internal chunk is not supported and can
break between patch releases.

## Automated gates

| Gate | Command | What it protects |
| --- | --- | --- |
| Types | `npm run typecheck` | Source and public type correctness |
| Behaviour | `npm test` | 374 unit, golden, and integration tests |
| Bundle | `npm run build` | Every entry point compiles |
| Consumer install | `npm run smoke` | Tarball imports in Node, renders a real PDF, registers the designer with and without a DOM |
| Real install | `npm run check:install` | Installs the packed tarball into an empty project: core entries load with no React, UI entries load with React, designer survives SSR, and a subsetted PDF proves the shipped wasm resolves |
| Tarball contract | `npm run check:tarball` | Exports resolve to shipped files, no font binaries, no `src`/tests/examples, size budgets |
| Package metadata | `npm run check:package` | `publint` and `arethetypeswrong` (`esm-only` profile) |

`npm run check:dist` runs the last four. `prepublishOnly` runs all of them, so
`npm publish` cannot ship a broken tarball.

## Release checklist

1. `npm ci`
2. `npm run fonts:fetch` (development/test fonts are not committed)
3. `npm run check`
4. `npm run build`
5. `npm run check:dist`
6. Build the examples:
   `npx vite build --config examples/quickstart/vite.config.ts`,
   `npx vite build --config examples/worker/vite.config.ts`,
   `npx vite build --config examples/designer/vite.config.ts`
7. Update [`CHANGELOG.md`](../CHANGELOG.md) and the version in `package.json`.
8. `npm run docs:schema` and commit the regenerated schema if it changed.
9. `npm pack --dry-run` and confirm the tarball does not contain font binaries.
10. `npm publish`

## Tag-driven publishing

`.github/workflows/release.yml` publishes on any `v*` tag:

```sh
npm version patch        # or minor / major
git push --follow-tags
```

The workflow verifies that the tag matches `package.json`, installs fonts, then
runs `npm publish --provenance`, which triggers `prepublishOnly`. Provenance
requires the `id-token: write` permission already set in the workflow and an
`NPM_TOKEN` repository secret.
