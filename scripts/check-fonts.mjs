/**
 * Fail fast when the development fonts are missing.
 *
 * The Noto CJK pair is ~32 MB, so it is gitignored and fetched on demand. About
 * twenty tests render real CJK PDFs, and without this guard they fail one by
 * one with "ENOENT: public/fonts/...otf" instead of saying what to run.
 */
import { existsSync } from 'node:fs';

const required = [
  'public/fonts/NotoSansCJKjp-Regular.otf',
  'public/fonts/NotoSansCJKjp-Bold.otf',
];

const missing = required.filter(path => !existsSync(path));

if (missing.length > 0) {
  console.error('Development fonts are missing:');
  for (const path of missing) console.error(`  - ${path}`);
  console.error('');
  console.error('They are not committed because they are large. Download them with:');
  console.error('  npm run fonts:fetch');
  process.exit(1);
}
