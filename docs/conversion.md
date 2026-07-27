# What converts into what

The complete map from HTML to Markdown, verified by running each case through
the core rather than read off the rules. Where a construct converts to nothing,
the reason is given — a silent loss is a defect, a stated one is a decision.

Two rules govern the whole table.

**The reader is the judge.** A construct converts to what the person saw, not to
what the markup said. A `<b>` that a stylesheet un-bolds is not bold; a `<span>`
a stylesheet makes heavy is.

**The output is Markdown, not HTML.** The product converts HTML *into* Markdown,
so a live tag in the result is unfinished work. The only tags a file may hold are
escaped ones the page itself displayed — `\<div\>` on a page about HTML, which
the reader saw as characters and goes on seeing as characters.

## Blocks

| HTML | Markdown |
| --- | --- |
| `<h1>`…`<h6>` | `#`…`######`, shifted by `headingOffset` — **0 in the library, 1 in the extension** |
| `<p>` | paragraph, blank line either side |
| `<blockquote>` | `> ` |
| `<ul><li>` | `- ` |
| `<ol><li>` | `1. ` |
| nested list | indented by the width of the parent's marker — two spaces under `-`, three under `1.` |
| `<ol start="5">` | numbering continues from `5.` |
| `<li>` with a checkbox | `- [x]` / `- [ ]` |
| `<pre>` | ` ``` ` fence |
| `<pre><code data-lang="js">` | ` ```js ` fence |
| `<hr>` | `---` |
| `<br>` | `\` + newline (hard break) |
| `<figure>` + `<figcaption>` | image, then caption — **defect: they run together, `![A](x)Caption`** |
| `<dl>` | terms and definitions as paragraphs |
| `<details>` + `<summary>` | **defect: `TitleBody`, no break between them** |
| `<address>` | contents inline — **defect: two adjacent ones concatenate, `OneTwo`** |

## Tables

| HTML | Markdown |
| --- | --- |
| simple table | pipe table |
| `<caption>` | paragraph before the table |
| alignment (`<th>`, or unanimous `<td>`) | `:--`, `:-:`, `--:` |
| merged cells, nested table, cell holding `<pre>` | flattened into an ordinary pipe table |

`complexTableFallback` can be set to `html`, `text` or `skip`; the default is
`flatten`. The `html` value writes the converter's *own* limited table markup — it
never passes the page's tags or attributes through; those stay text or are
dropped. Inside such a cell emphasis, code and links emit tags too, since an HTML
block is not parsed as Markdown.

That is a caller's explicit choice. The one place HTML appears without being
asked for is the emphasis fallback below, and it is a debt, not a feature.

## Links and media

| HTML | Markdown |
| --- | --- |
| `<a href>` | `[text](href)` — scheme checked |
| `<a>` without `href` | text alone |
| `<img>` | `![alt](src)` |
| `<img>` without `alt` | `![](src)` |
| `<img title>` | `![alt](src 'title')` |
| `<img>` with no usable URL | the alt text alone, escaped |
| `<picture>`, `srcset`, lazy-load attributes | the `<img>` inside, resolved to one URL |
| a relative URL | resolved against `baseUrl` |
| `<sup><a href="#fn1">` | `[^1]` and a definitions section — **only with `footnotes: true`, which the extension does not set**; otherwise an ordinary link, `Fact[[1]](#fn1)` |

## Inline

| HTML | Markdown | Note |
| --- | --- | --- |
| `<b>` `<strong>` | `**text**` | |
| `<i>` `<em>` `<cite>` `<dfn>` `<var>` | `_text_` | the last three via the browser's own italic |
| `<del>` `<s>` `<strike>` | `~~text~~` | `strike` via the browser's own line-through |
| `<code>` `<kbd>` `<samp>` | `` `text` `` | contents never escaped |
| `<sub>` `<sup>` | Unicode: `H₂O`, `x²` | see below |
| KaTeX, MathML | `$latex$` / `$$latex$$` | when `math` is on |

Emphasis picks the first marker CommonMark's flanking rules allow: `_`/`**`, then
`*`/`__`, then — for content flanked by punctuation, where no delimiter renders —
an HTML tag. That last case is a known debt against the no-HTML rule.

### Raised and lowered runs

Written with the Unicode characters for them, all or nothing per element:

```
H<sub>2</sub>O      → H₂O
x<sup>n+1</sup>     → xⁿ⁺¹
a<sup>(i)</sup>     → a⁽ⁱ⁾
x<sup>ABC</sup>     → xABC      no capital shifted letters exist
x<sup>Примечание</sup> → xПримечание
```

Markdown has no syntax of its own. Pandoc's `H~2~O` is worse than absent — GFM
reads a single `~` as strikethrough, so it renders struck-through, corrupting the
meaning rather than losing it; `x^2^` stays literal. Unicode needs no parser,
survives copying, and is what the reader saw. Where a character does not exist
the run stays plain: a half-mapped `x₂ab` states a different formula with the
same confidence.

## Styles the page states in CSS

Read from the `style` attribute and from `data-s2md-style`, the computed style
the content script records while it still has live nodes. A mark is written where
a run **contrasts with its context**, never wherever a property has a value — a
heading and a `<th>` are already bold, so `**` inside a `##` is what the naive
rule writes.

| CSS | Markdown |
| --- | --- |
| `font-weight` heavier than context | `**text**` |
| `font-style: italic` | `_text_` |
| `text-decoration-line: line-through` | `~~text~~` |
| `display: block` on an inline tag | its own paragraph |
| `display: inline` on a block tag | stays in the line |
| `text-align` on a column | `:--`, `:-:`, `--:` |
| a style declining its tag's own mark | the mark is dropped |

## Removed before conversion

Content nobody could read is not content:

| CSS | |
| --- | --- |
| `display: none`, `visibility: hidden\|collapse`, `opacity: 0` | removed |
| `clip: rect(0…)`, `clip-path: inset(≥50%)`, four-digit negative offset or `text-indent`, a 1×1 clipping box | removed — this is how `.sr-only` is written |
| `opacity: 0` under a transition or animation | **kept** — a section on its way in |
| `visibility: hidden` under a transition, in the flow | **kept** — a reveal, not an overlay |
| `visibility: hidden` under a transition, `absolute`/`fixed` | removed — a dropdown standing by |
| a hidden box holding something declared visible again | kept, and what is still hidden inside says so |

Removed by markup rather than by style:

| | |
| --- | --- |
| `hidden`, `aria-hidden="true"` | removed |
| `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<template>`, `<svg>` | removed outright |
| `<noscript>` | removed — but an image URL inside it is first handed to the neighbouring `<img>`, which is where lazy-loading pages keep the real one |
| `<nav>`, `<header>`, `<footer>`, `<aside>` | removed with their contents in **full mode** (a whole page); **kept in selection mode**, because a person who selected them meant to |

`script[type="math/tex"]` is the exception to the `<script>` rule: with `math: true`
it holds the formula and is read, not dropped.

## Converts to plain text, deliberately

Markdown has no way to say these, and inventing one would state something the
page did not:

`<ins>` `<u>` (no underline syntax) · `<small>` `<big>` (no size syntax) ·
`<abbr>` (the title is not shown) · `<q>` (its quotes exist only as generated
content, which no DOM walk can reach) · `<time>` `<data>` `<output>` `<bdi>`
`<bdo>` `<ruby>` `<tt>` `<font>`

Not read from CSS either, and for the same reason plus a rate of false positives:
`font-family` (numbers, timestamps and prices are routinely monospaced),
`font-size` (leads, prices, headings), `color` alone (links, brand accents, syntax
highlighting), `text-transform` (the capitals are not in the text).

## Escaping — the contract under all of the above

What the page displayed as characters must reach the file as characters, and what
the converter emits as markup must be the only markup there is.

- **Markdown characters in page text are escaped** — `*`, a non-intraword `_`,
  `` ` ``, tildes that can pair, link brackets. Block openers (`#`, `>`, bullets,
  numbering, a line of dashes) only in the node that starts a line.
- **HTML in page text is escaped too** (`\<`, `\&`), so a page *about* HTML keeps
  showing its tags instead of running them.
- **Constructs must not assemble across a node boundary.** Syntax highlighting
  splits `<` and a tag name into separate spans; each half is harmless and the
  pair is not, so a node whose tail is still an open construct escapes it
  defensively.
- **Nothing is escaped inside `pre`, `code`, `kbd`, `samp` or a math subtree** — a
  backslash there is corruption, not protection. Their contents are preserved
  literally, whitespace included.
- **Whitespace collapses everywhere else**, as it does on screen.

This is held by a round-trip oracle (`tests/fidelity/`), not by review: it
compares the text a reader sees before and after conversion, over generated
documents, and the gate records both the count of known failures and which ones
they are.

## Decided, not yet built

| HTML / CSS | Markdown | Status |
| --- | --- | --- |
| `<mark>`, and an inline run whose background contrasts with what is behind it | `==text==` | decided 2026-07-27; needs escaping for `==` in page text, a `marked` extension so the panel renders it, and a generator hazard |

Escaping is the load-bearing part: a page printing `x==y` or `C==C++` must not
acquire a highlight. See `store/research/visual-emphasis.md` for the measurements
behind the decision.
