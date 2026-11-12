import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const assets = [
  ['public/fonts/hb-subset.wasm', 'dist/fonts/hb-subset.wasm'],
  ['public/fonts/HARFBUZZJS-LICENSE.txt', 'dist/fonts/HARFBUZZJS-LICENSE.txt'],
  ['public/fonts/OFL.txt', 'dist/fonts/OFL.txt'],
  ['public/fonts/README.md', 'dist/fonts/README.md'],
];

for (const [from, to] of assets) {
  const source = resolve(root, from);
  const target = resolve(root, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`copied ${from} -> ${to}`);
}
