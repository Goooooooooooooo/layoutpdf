# Distribution and versioning

This package is distributed from its Git repository. There is no npm
publication: consumers clone it (or install it straight from Git), build it, and
install the resulting package.

## How consumers get it

| Route | Command | When to use |
| --- | --- | --- |
| Git dependency | `npm install github:Goooooooooooooo/layoutpdf#v0.1.1` | Fastest. The `prepare` script builds the package during install. |
| Packed tarball | clone, `npm ci`, `npm run build`, `npm pack`, then `npm install ./layoutpdf-0.1.0.tgz` | Offline builds, vendoring, or auditing the exact artifact. |
| Local link | `npm install ../layoutpdf` | Active co-development. npm does not build `file:` dependencies, so run `npm run build` in the checkout and again after each pull. |

Always pin a tag or commit (`#v0.1.1`), not `#main`, so an install is
reproducible.

## What a build produces

`npm run build` writes the published layout to `dist/`: one ESM entry per
`package.json#exports` target, the `.d.ts` tree under `dist/types`, and the
HarfBuzz subsetter wasm under `dist/fonts`. Nothing else in the repository is
consumed by an install, so `dist/` stays out of Git and `npm run build` is
required after a clone.

`prepare` runs that build automatically during `npm install`, `npm pack`, and a
Git-dependency install. In a fresh checkout it means `npm ci` already leaves a
usable `dist/`.

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

`npm run verify` chains all of them (`check` + `build` + `check:dist`). CI runs
the same commands, so a tag is only worth cutting from a green `main`.

## Cutting a release

1. `npm ci` (runs `prepare`, so `dist/` exists)
2. `npm run fonts:fetch` (development/test fonts are not committed)
3. `npm run verify`
4. Update [`CHANGELOG.md`](../CHANGELOG.md) and the version in `package.json`.
5. `npm run docs:schema` and commit the regenerated schema if it changed.
6. `npm pack --dry-run` and confirm the tarball has no font binaries.
7. Commit, then tag and push:

```sh
git tag "v$(node -p "require('./package.json').version")"
git push --follow-tags
```

The tag is what consumers pin in `github:Goooooooooooooo/layoutpdf#v0.1.1`.
