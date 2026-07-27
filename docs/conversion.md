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
escaped ones the page itself displayed — `\<div>` on a page about HTML, which the
reader saw as characters and goes on seeing as characters. Only the `<` takes the
backslash: a `>` on its own opens nothing.

## Blocks

| HTML | Markdown |
| --- | --- |
| `<h1>`…`<h6>` | `#`…`######`, shifted by `headingOffset` — **0 in the library, 1 in the extension** — and clamped to 1…6 |
| a heading's own anchor link | dropped, when its class is `anchor`, `heading-link` or `headerlink` — the `¶` a docs generator hangs off every heading |
| `<p>` | paragraph, blank line either side |
| `<div>` | paragraph, blank line either side |
| `<blockquote>` | `> ` |
| `<ul><li>` | `- ` |
| `<ol><li>` | `1. ` |
| nested list | indented by the width of the parent's marker — two spaces under `-`, three under `1.` |
| `<ol start="5">` | numbering continues from `5.`; `0` and a negative start are legal and kept, and a `start` no number can be read out of numbers from 1, as a browser renders it |
| `<li>` with a checkbox | `- [x]` / `- [ ]` |
| `<pre>` | ` ``` ` fence, whitespace and `<br>` lines kept, the fence long enough to outrun any backtick run inside |
| a highlighter's line-number gutter | dropped (`line-numbers-rows`, `linenumber`, `line-number`, `hljs-ln`) |
| `<clipboard-copy value>` inside a `<pre>` | the attribute is the code — that is GitHub's copy button, and it holds the text without the gutter |
| `<pre><code data-lang="js">` | ` ```js ` fence — also from `data-language` and from a highlighter class (`language-js`, `lang-js`, `highlight-source-js`, `brush: js`, `sourceCode js`, `shj-lang-js`, `prettyprint lang-js`); anything that is not a bare language token is dropped rather than written into the info string |
| `<hr>` | `---` |
| `<br>` | `\` + newline (hard break) |
| `<figure>` + `<figcaption>` | image, then caption — **defect: they run together, `![A](x)Caption`** |
| `<dl>` | terms and definitions as paragraphs |
| `<section>` `<article>` `<main>` `<figure>` `<figcaption>` `<details>` `<summary>` `<address>` `<form>` `<fieldset>` `<legend>` | contents inline — **defect: no rule writes a block for them, so two adjacent ones concatenate (`OneTwo`, `TitleBody`)**. A block *inside* still supplies the break, which is why `<details><summary>T</summary><p>B</p>` comes out as two paragraphs and `<summary>T</summary>B` as one word |

## Tables

| HTML | Markdown |
| --- | --- |
| simple table | pipe table |
| `<caption>` | paragraph before the table, and all that is left when the table has no rows |
| the header row | the first `<thead>` row; with no `<thead>` — or an empty one, which CMS exports write — the table's own first row. Every other row is a body row, `<tfoot>` included |
| row order | `<thead>`, then `<tbody>`, then `<tfoot>`, whatever order the source lists them in |
| alignment (`<th>`, or unanimous `<td>`) | `:--`, `:-:`, `--:` |
| a `\|` in a cell | escaped, everywhere, formulas included — GFM splits a row into columns before anything reads maths, so a `\|` inside `$…$` would take the row apart |
| a line break in a cell | `<br>`: a GFM row is one line, and this is the only break a pipe cell can carry |
| merged cells, nested table, cell holding `<pre>` | flattened into an ordinary pipe table — a merge leaves the positions it covered empty, a nested table becomes its rows one per line with `·` between cells, preformatted text one code span per line |

`complexTableFallback` can be set to `html`, `text` or `skip`; the default is
`flatten`. The `html` value writes the converter's *own* limited table markup — it
never passes the page's tags or attributes through; those stay text or are
dropped. Inside such a cell emphasis, code and links emit tags too, since an HTML
block is not parsed as Markdown. The extension offers `flatten` and `html` only
(Settings → *Keep complex tables as HTML*); `text` and `skip` are for library
callers.

That is a caller's explicit choice. Two places emit HTML without being asked:
the `<br>` in a folded cell above, and the emphasis fallback below. Both are
debts, not features.

## Links and media

| HTML | Markdown |
| --- | --- |
| `<a href>` | `[text](href)` — scheme checked against `http(s)`, `ftp(s)`, `mailto`, `tel`, `callto`, `sms`, `cid`, `xmpp`, `matrix`, which is DOMPurify's set and so the panel's; anything else keeps its text and loses its target |
| `<a>` without `href` | text alone |
| `<img>` | `![alt](src)` |
| `<img>` without `alt` | `![](src)` |
| `<img title>` | `![alt](src 'title')` |
| `<img>` with no usable URL | the alt text alone, escaped |
| `<picture>`, `srcset`, lazy-load attributes | the `<img>` inside, resolved to one URL — `data-src` and its spellings first, then the largest `srcset` candidate, then `src` unless it is a placeholder, then the URL rescued from a neighbouring `<noscript>` |
| a relative URL | resolved against `baseUrl` |
| `<sup><a href="#fn1">` | `[^1]` plus a definitions section — **only with `footnotes: true`, which the extension does not set**; otherwise an ordinary link, `Fact[1](#fn1)`. The list the definitions were read from is still converted where it stands, unless it sits in a container the page marks as the notes (`class` containing `footnote`, or `role="doc-endnotes"`), which is dropped |

## Inline

| HTML | Markdown | Note |
| --- | --- | --- |
| `<b>` `<strong>` | `**text**` | |
| `<i>` `<em>` `<cite>` `<dfn>` `<var>` | `_text_` | the last three via the browser's own italic |
| `<del>` `<s>` `<strike>` | `~~text~~` | `strike` via the browser's own line-through |
| `<code>` `<kbd>` `<samp>` | `` `text` `` | contents never escaped, and only the text: a `<strong>` inside writes no `**`. Two spans with nothing between them merge into one, since two backtick runs meeting cannot be told apart |
| `<sub>` `<sup>` | Unicode: `H₂O`, `x²` | see below |
| KaTeX, MathJax, `<math alttext>` | `$latex$` / `$$latex$$` | when `math` is on. The core reads LaTeX the page already carries — an `<annotation encoding="application/x-tex">`, a `<script type="math/tex">`, Wikipedia's `alttext` |
| MathML carrying no LaTeX | `$latex$`, converted by `src/content/raw-mathml-rule.ts` | that rule is the extension's, not the core's. In the library `math: true` **drops such a formula**; with `math` off its text falls through as prose (`<mi>x</mi><mo>+</mo>` → `x+`) |

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
same confidence. A run the escaper had to touch stays plain too — a backslash has
no raised spelling, so `x<sup>*</sup>` is `x\*`.

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
| `clip: rect(0…)`, `clip-path: inset(≥50%)`, four-digit negative offset or `text-indent`, a 1×1 clipping box | removed — this is how `.sr-only` is written. A zero side of the rect counts written bare or in `px`, with or without commas; in another unit it stays unread, since the direction that costs is the one that deletes |
| `opacity: 0` under a transition or animation | **kept** — a section on its way in. The transition has to name `opacity` or `all`; any animation counts |
| `visibility: hidden` under such a transition, in the flow | **kept** — a reveal, not an overlay |
| `visibility: hidden` under such a transition, `absolute`/`fixed` | removed — a dropdown standing by |
| a hidden box holding something declared visible again | kept, and what is still hidden inside says so |

Removed by markup rather than by style:

| | |
| --- | --- |
| `hidden`, `aria-hidden="true"` | removed |
| `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<template>`, `<svg>` | removed outright |
| `<noscript>` | removed — but an image URL inside it is first handed to the neighbouring `<img>`, which is where lazy-loading pages keep the real one |
| `<nav>`, `<header>`, `<footer>`, `<aside>` | removed with their contents in **full mode** (`mode` unset, the library default); kept in **selection mode**, because a person who selected them meant to. The extension asks for selection mode in `CONVERSION_OPTIONS`, so both of its capture paths keep them — including the `<header>` and `<footer>` *inside* a highlighted `<article>`, which is how every news site ships a headline and a byline |

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

## What the extension asks for

The map above is the core's. The extension converts with one fixed set of options
and steps of its own around them:

| | |
| --- | --- |
| `headingOffset: 1` | a page's `<h1>` becomes `##`, leaving `#` for the note's own title |
| `math: true` plus a rule of its own | `src/content/raw-mathml-rule.ts`, for the MathML the core does not read |
| `baseUrl: document.baseURI` | so a relative URL resolves |
| `complexTableFallback` | `html` or `flatten`, from Settings — never `text` or `skip` |
| `footnotes` | never set |
| `mode: 'selection'` | every capture it makes is a selection or a highlight, so page furniture inside it is kept |
| a partial selection is enriched first | `enrichRange()` gives back the table header row, the list's numbering, the code block's language and the block the range was cut out of |
| `\n` inside a text node → `<br>` | how Instagram and anything else that breaks lines inside one `<span>` gets its paragraphs; skipped inside `pre`, `code`, `script`, `style`, `svg`, `math`, `textarea` and under `white-space: pre` |
| two or more hard breaks in a row → a blank line | what the page drew with `<br><br>` is a paragraph break; a fenced block is left alone, where `\` at the end of a line is a shell continuation |

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
  literally, whitespace included. A math subtree has one exception, and it is not
  a backslash: a `<` that would open a tag or a comment becomes `&lt;`, because
  LaTeX between dollar signs is re-emitted into a document that carries raw HTML.
- **Whitespace collapses everywhere else**, as it does on screen. A `&nbsp;`
  survives the collapse and then becomes an ordinary space in the finished file.

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
