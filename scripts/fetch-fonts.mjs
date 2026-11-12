import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(new URL('../public/fonts', import.meta.url));
const baseUrl = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/';

const expectedHashes = {
  // Noto CJK publishes stable files; keep the Bold hash documented by the repo.
  'NotoSansCJKjp-Bold.otf': 'e53dcb0dcb2922e45d01aae1ebd2f382bb81d4229b18b6b883bd170678af1f76',
};

const files = ['NotoSansCJKjp-Regular.otf', 'NotoSansCJKjp-Bold.otf'];

await mkdir(outputDirectory, { recursive: true });

for (const file of files) {
  const url = `${baseUrl}${file}`;
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${file}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000_000) {
    throw new Error(`Downloaded ${file} is unexpectedly small (${bytes.byteLength} bytes).`);
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const expected = expectedHashes[file];
  if (expected && hash !== expected) {
    throw new Error(`Checksum mismatch for ${file}: expected ${expected}, got ${hash}`);
  }
  const target = fileURLToPath(new URL(`../public/fonts/${file}`, import.meta.url));
  await writeFile(target, bytes);
  console.log(`wrote ${target} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, sha256 ${hash})`);
}
