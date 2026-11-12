/**
 * Tarball contract check.
 *
 * `npm pack --dry-run` is the only source of truth for what consumers actually
 * receive, so every assertion here runs against that file list instead of the
 * working tree. Run after `npm run build`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PACKED_BUDGET = 2 * 1024 * 1024;
const UNPACKED_BUDGET = 8 * 1024 * 1024;

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// npm 11 honours `--ignore-scripts` here, npm 10 (Node 22, what CI runs) still
// executes `prepare`, so the build log lands in the same stream as the JSON.
// Take the last parseable JSON array instead of assuming it is the whole stdout.
function parsePackOutput(raw) {
  for (let i = raw.lastIndexOf('['); i !== -1; i = raw.lastIndexOf('[', i - 1)) {
    try {
      const parsed = JSON.parse(raw.slice(i));
      if (Array.isArray(parsed) && parsed[0]?.filename) return parsed;
    } catch {
      // Not the payload; keep scanning towards the front.
    }
  }
  throw new Error('npm pack did not print the expected JSON');
}

const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
const [pack] = parsePackOutput(raw);
const files = new Map(pack.files.map(file => [file.path, file.size]));
const has = path => files.has(path);

// 1. Every export condition must ship the file it points at.
for (const [entry, target] of Object.entries(pkg.exports)) {
  const conditions = typeof target === 'string' ? { default: target } : target;
  for (const [condition, path] of Object.entries(conditions)) {
    if (typeof path !== 'string' || !path.startsWith('./')) continue;
    if (path === './package.json') continue;
    if (!has(path.slice(2))) {
      fail(`export "${entry}" -> ${condition} points at ${path}, which is not in the tarball`);
    }
  }
}

// 2. The side-effect entries must exist, otherwise tree shaking decisions lie.
for (const path of pkg.sideEffects ?? []) {
  if (!has(path.replace(/^\.\//, ''))) {
    fail(`sideEffects entry ${path} is not in the tarball`);
  }
}

// 3. Font binaries stay out of the package by design.
const fontBinaries = [...files.keys()].filter(path => /\.(otf|ttf|woff2?)$/i.test(path));
if (fontBinaries.length > 0) {
  fail(`font binaries must not be published: ${fontBinaries.join(', ')}`);
}

// 4. The Node subsetter wasm is required at runtime.
for (const required of ['dist/fonts/hb-subset.wasm', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
  if (!has(required)) fail(`required file is missing from the tarball: ${required}`);
}

// 5. Nothing development-only leaks.
for (const path of files.keys()) {
  if (path.startsWith('src/')) fail(`source file leaked into the tarball: ${path}`);
  if (path.startsWith('examples/')) fail(`example leaked into the tarball: ${path}`);
  if (/\.(test|spec)\./.test(path)) fail(`test file leaked into the tarball: ${path}`);
  if (path.startsWith('node_modules/')) fail(`node_modules leaked into the tarball: ${path}`);
}

// 6. Size budgets keep accidental additions visible in review.
if (pack.size > PACKED_BUDGET) {
  fail(`packed size ${(pack.size / 1024 / 1024).toFixed(2)} MB exceeds ${PACKED_BUDGET / 1024 / 1024} MB`);
}
if (pack.unpackedSize > UNPACKED_BUDGET) {
  fail(`unpacked size ${(pack.unpackedSize / 1024 / 1024).toFixed(2)} MB exceeds ${UNPACKED_BUDGET / 1024 / 1024} MB`);
}

const biggest = [...files.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([path, size]) => `${path} ${(size / 1024).toFixed(0)} kB`);

notes.push(`${files.size} files`);
notes.push(`packed ${(pack.size / 1024).toFixed(0)} kB of ${(PACKED_BUDGET / 1024).toFixed(0)} kB`);
notes.push(`unpacked ${(pack.unpackedSize / 1024 / 1024).toFixed(2)} MB of ${(UNPACKED_BUDGET / 1024 / 1024).toFixed(0)} MB`);
notes.push(`largest: ${biggest.join(', ')}`);

if (problems.length > 0) {
  console.error('Package check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Package check passed (${notes.join('; ')}).`);
