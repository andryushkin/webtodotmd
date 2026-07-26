# HTML → .md

[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

TypeScript/JavaScript library for converting HTML to Markdown. Zero dependencies. Works in any browser, Chrome Extension, or bundler (Vite, esbuild, webpack).

Developed in the [webtodotmd](https://github.com/andryushkin/webtodotmd)
repository, which is also its first consumer: the extension imports it straight
from source, so the library and the product never drift apart.

## Integration

Build `dist/browser.mjs` (see [Build from Source](#build-from-source)) and copy
it into your project. That's it — no build step on your side, no dependencies.

```js
import { toMarkdown } from './browser.mjs'

const md = toMarkdown('<h1>Hello</h1><p>World <strong>!</strong></p>')
// # Hello
//
// World **!**
```

TypeScript types are emitted next to it as `dist/browser.d.ts`.

## API

### `toMarkdown(input, options?)`

Converts an HTML string or DOM `Node` to Markdown.

```typescript
function toMarkdown(input: string | Node, options?: Options): string
```

```js
// From string
toMarkdown('<p>Hello <strong>world</strong></p>')
// → "Hello **world**\n"

// From a DOM node
const article = document.querySelector('article')
toMarkdown(article, { baseUrl: window.location.href })
```

### `selectionToMarkdown(selection, options?)`

Converts the user's current text selection to Markdown.

```typescript
function selectionToMarkdown(selection: Selection, options?: Options): string
```

```js
const selection = window.getSelection()
if (selection) {
  const md = selectionToMarkdown(selection, {
    baseUrl: window.location.href,
  })
  await navigator.clipboard.writeText(md)
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Resolve relative URLs in links and images |
| `math` | `boolean` | `false` | Convert KaTeX / MathJax / Wikipedia math |
| `footnotes` | `boolean` | `false` | Convert footnotes |
| `complexTableFallback` | `'html' \| 'text' \| 'skip'` | `'html'` | Tables with merged cells: keep as HTML, extract text, or skip |
| `headingOffset` | `number` | `0` | Shift heading levels (`1` turns h1→h2, h2→h3…) |
| `rules` | `Rule[]` | `[]` | Custom rules — override any element's conversion |

## Supported Elements

| HTML | Markdown |
|------|----------|
| `<h1>`–`<h6>` | `#`–`######` |
| `<p>` | Paragraph |
| `<br>` | Hard line break |
| `<hr>` | `---` |
| `<strong>`, `<b>` | `**bold**` |
| `<em>`, `<i>` | `*italic*` |
| `<del>`, `<s>` | `~~strikethrough~~` |
| `<code>` | `` `inline code` `` |
| `<pre><code>` | Fenced code block with language |
| `<a>` | `[text](url)` |
| `<img>` | `![alt](src)` |
| `<ul>` | `- item` |
| `<ol>` | `1. item` |
| `<li>` + checkbox | `[x]` / `[ ]` task list |
| `<blockquote>` | `> quote` |
| `<table>` | GFM pipe table |
| `<script>`, `<style>`, `<nav>`, `<footer>` | Removed |

## Custom Rules

Override any element's conversion or add support for new ones:

```js
const md = toMarkdown(html, {
  rules: [
    {
      name: 'mark',
      filter: 'mark',
      replacement: (_el, content) => `==${content}==`,
    },
    {
      name: 'callout',
      filter: (el) => el.tagName === 'DIV' && el.hasAttribute('data-callout'),
      replacement: (_el, content) => `> **Note:** ${content}`,
    },
  ],
})
```

Rules run in priority order: custom → math/footnotes → built-in → fallback.

## Chrome Extension

See [docs/CHROME_EXTENSION.md](./docs/CHROME_EXTENSION.md) for a complete integration guide.

## Build from Source

```bash
bun install                    # from the repository root, once
bun run --filter core build    # outputs core/dist/browser.mjs and .d.ts
bun test core                  # this package's suite; bare `bun test` adds the extension's
```

`bun run build` at the repository root builds the *extension*, not this library —
the commands above are `--filter`ed on purpose.

## License

MIT
