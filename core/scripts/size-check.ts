import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';

const files = [
  { name: 'dist/browser.mjs', limit: 15 * 1024 },
  { name: 'dist/server.mjs', limit: 20 * 1024 },
  { name: 'dist/server.cjs', limit: 20 * 1024 },
];

let ok = true;
for (const { name, limit } of files) {
  const raw = readFileSync(name);
  const size = gzipSync(raw).length;
  const kb = (size / 1024).toFixed(1);
  const status = size <= limit ? '✓' : '✗ EXCEEDS LIMIT';
  console.log(`${name}: ${size} B (${kb} KB gzip) ${status}`);
  if (size > limit) ok = false;
}

if (ok) {
  console.log('\nAll bundles within size limits.');
} else {
  console.error('\nBundle size check FAILED.');
  process.exit(1);
}
