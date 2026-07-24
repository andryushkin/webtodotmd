# Third-party notices

Everything the extension ships is bundled at build time; nothing is loaded from
a CDN at runtime.

## htmltodotmd

Copyright © 2026 andryushkin.

The HTML → Markdown conversion core, pulled in as the `vendor/htmltodotmd` git
submodule and compiled into the content script. Licensed under the MIT License:
https://github.com/andryushkin/htmltodotmd/blob/main/LICENSE

## marked

Copyright © 2011–2024 Christopher Jeffrey and contributors.

Version 12.0.2 is vendored as `vendor/marked.esm.js` and renders the Markdown
preview in the side panel. Licensed under the MIT License:
https://github.com/markedjs/marked/blob/master/LICENSE.md

## DOMPurify

Copyright © Cure53 and other contributors.

Version 3.3.3 is vendored as `vendor/purify.esm.mjs` and sanitizes the rendered
preview HTML before it reaches `innerHTML`. Dual-licensed under the Apache
License 2.0 and the Mozilla Public License 2.0:
https://github.com/cure53/DOMPurify/blob/3.3.3/LICENSE

## KaTeX

Copyright © 2013–2020 Khan Academy and other contributors.

Version 0.16.38 is vendored as `vendor/katex.mjs` and renders math in the
preview. Licensed under the MIT License:
https://github.com/KaTeX/KaTeX/blob/v0.16.38/LICENSE

## mathml-to-latex

Copyright © Alexandre Nunes and contributors.

Version 1.5.0 is vendored as `vendor/mathml-to-latex.mjs` (an ESM wrapper around
the UMD bundle) and converts MathML found on pages into LaTeX. Licensed under
the MIT License:
https://github.com/asnunes/mathml-to-latex/blob/main/LICENSE

## @types/chrome

Copyright © Microsoft Corporation and DefinitelyTyped contributors.

Chrome extension API type definitions, copied into `types/chrome/` so the
project builds without `node_modules`. Licensed under the MIT License:
https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE

## HTML entity table

`src/content/html-entities.ts` is generated from the WHATWG named character
reference table (https://html.spec.whatwg.org/entities.json), published by the
WHATWG under the terms of the HTML Standard. The generated file contains only
entity names and their code points.
