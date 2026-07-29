#!/usr/bin/env bash
set -e

# Clean
rm -rf dist
mkdir -p dist/src/background dist/src/content dist/src/sidepanel dist/src/settings

# Bundle JS entry points
bun build src/background/service-worker.ts --outfile dist/src/background/service-worker.js --target browser
bun build src/content/content-script.ts    --outfile dist/src/content/content-script.js    --target browser
bun build src/sidepanel/sidepanel.ts       --outfile dist/src/sidepanel/sidepanel.js        --target browser
bun build src/settings/settings.ts         --outfile dist/src/settings/settings.js          --target browser

# Copy static HTML (patch .ts → .js in script src) and CSS
sed 's/sidepanel\.ts/sidepanel.js/' src/sidepanel/sidepanel.html > dist/src/sidepanel/sidepanel.html
cp src/sidepanel/sidepanel.css dist/src/sidepanel/sidepanel.css
sed 's/settings\.ts/settings.js/' src/settings/settings.html > dist/src/settings/settings.html
cp src/settings/settings.css dist/src/settings/settings.css

# Copy and patch manifest (.ts → .js)
sed 's/service-worker\.ts/service-worker.js/;s/content-script\.ts/content-script.js/' manifest.json > dist/manifest.json

# Copy public/ contents (icons, _locales). Finder leaves .DS_Store files behind
# in any directory it has displayed; they are gitignored, so they survive here
# unseen and rode into the store archive once.
cp -r public/* dist/
find dist -name '.DS_Store' -delete

# Ship the project and third-party license texts with the extension package.
mkdir -p dist/licenses
cp LICENSE THIRD_PARTY_NOTICES.md dist/
cp vendor/licenses/* dist/licenses/

# A content script Chrome will actually read. Chrome validates these files with a
# UTF-8 check that rejects noncharacters and lone surrogates, and it rejects the
# whole manifest when one fails — "encoding other than UTF-8", nothing loads. No
# test can see this: the bundle is valid UTF-8 by every other measure, and the
# character arrives from a source file that spelled it as an ASCII escape, which
# the transpiler expands. Only the content script is scanned; the panel has
# carried a U+FFFF out of `vendor/` through every shipped version.
#
# Bun, not a second interpreter: it bundled the four files above, so it is on
# every machine that reaches this line. python3 is not — and because the check
# reads what the build wrote, its `command not found` arrived *after* `dist/` was
# complete, reporting a good build as a broken one. That is also why a real
# failure takes `dist/` with it: this is the last word on whether the directory
# can be loaded, and half of it loading is worse than none of it being there.
if ! bun run - dist/src/content/content-script.js <<'JS'
const path = process.argv[2];
const bytes = require('fs').readFileSync(path);
let text;
try {
  // Decoded strictly, from the bytes, which is the whole of the lone-surrogate
  // half of the question: one is ill-formed UTF-8 and never survives as a
  // character, so reading the file as text would put U+FFFD in its place and
  // ship it, and no scan of the result could tell. The check this replaces asked
  // it of the decoded string, where the answer could only ever be a traceback.
  text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
} catch {
  console.error(`${path}: not valid UTF-8 — Chrome will refuse this content script`);
  process.exit(1);
}
// The noncharacters: U+FDD0..U+FDEF, and the last two of every plane.
const bad = [];
let offset = 0;
for (const ch of text) {
  const code = ch.codePointAt(0);
  if ((code & 0xfffe) === 0xfffe || (code >= 0xfdd0 && code <= 0xfdef)) bad.push([offset, code]);
  offset += ch.length;
}
if (bad.length > 0) {
  console.error(`${path}: Chrome will refuse this content script`);
  for (const [at, code] of bad.slice(0, 5)) {
    const around = JSON.stringify(text.slice(Math.max(0, at - 40), at + 40));
    console.error(`  0x${code.toString(16)} at offset ${at}: ${around}`);
  }
  process.exit(1);
}
JS
then
  rm -rf dist
  exit 1
fi

echo "Build OK → dist/"
