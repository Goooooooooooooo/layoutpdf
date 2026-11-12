# Font assets (development / self-hosting)

The npm package does **not** include the Noto CJK font binaries. They are large
(~16 MB each) and most hosts want to choose their own font or serve it from a
CDN. This directory is a local development asset used by tests and the Vite
examples.

## Fetch the development fonts

```sh
npm run fonts:fetch
```

This downloads the Regular and Bold faces of Noto Sans CJK JP into this
directory. You can also place any OTF/TTF file here yourself.

## Browser

Serve the font files from your application and point the browser font manager at
their URL:

```ts
import { createDefaultFontManager } from 'layoutpdf/pdf';

const engine = await createDefaultEngine({
  fontManager: await createDefaultFontManager('/assets/fonts/'),
});
```

Expected filenames are `NotoSansCJKjp-Regular.otf` and
`NotoSansCJKjp-Bold.otf` unless you build the manager yourself with
`createFontManager()` / `createPdfFontFromBytes()`.

## Node

`createNodeEngine()` looks for these files in `cwd/public/fonts`,
`node_modules/layoutpdf/dist/fonts`, and next to the installed module.
For production, passing an explicit path is recommended:

```ts
const engine = await createNodeEngine({
  fontPath: '/srv/fonts/NotoSansCJKjp-Regular.otf',
  boldFontPath: '/srv/fonts/NotoSansCJKjp-Bold.otf',
});
```

## Licenses

`hb-subset.wasm` comes from HarfBuzzJS and is distributed under its MIT/Apache
notices. See `HARFBUZZJS-LICENSE.txt`. Noto fonts are distributed under the SIL
Open Font License; see `OFL.txt`.
