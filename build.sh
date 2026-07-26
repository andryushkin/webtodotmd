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

# Copy public/ contents (icons, _locales)
cp -r public/* dist/

# Ship the project and third-party license texts with the extension package.
mkdir -p dist/licenses
cp LICENSE THIRD_PARTY_NOTICES.md dist/
cp vendor/licenses/* dist/licenses/

echo "Build OK → dist/"
