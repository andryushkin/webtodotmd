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
| `<h1>`…`<h6>` | `#`…`######`, shifted by `headingOffset` or by `topHeadingLevel` — **neither in the library, `topHeadingLevel: 2` in the extension** — and clamped to 1…6 |
| `role="heading"` with `aria-level` | the same, at the level stated — an interface built out of divs writes its headings this way, and a missing or unwritable level reads as 2, which is what a browser reports. Counts for `topHeadingLevel` like a heading tag |
| a heading's own anchor link | dropped, when its class is `anchor`, `heading-link` or `headerlink` — the `¶` a docs generator hangs off every heading |
| `<p>` | paragraph, blank line either side |
| `<div>` | paragraph, blank line either side |
| `<blockquote>` | `> ` |
| `<ul><li>` | `- ` |
| `<ol><li>` | `1. ` |
| nested list | indented by the width of the parent's marker — two spaces under `-`, three under `1.`, four under `10.`. A task marker is content, not a marker, so `- [x] ` still indents by two: four more would be an indented code block, and the nested list would arrive as literal text |
| `<ol start="5">` | numbering continues from `5.`; `0` and a negative start are legal and kept, and a `start` no number can be read out of numbers from 1, as a browser renders it |
| `<li>` with a checkbox | `- [x]` / `- [ ]` |
| `<pre>` | ` ``` ` fence, whitespace and `<br>` lines kept, the fence long enough to outrun any backtick run inside |
| a highlighter's line-number gutter | dropped (`line-numbers-rows`, `linenumber`, `line-number`, `hljs-ln`) |
| a `<figcaption>` or `<button>` inside the `<pre>` | not code. The button goes — it is a control, not text the reader read as part of the sample. The caption becomes the info string when it names a language (Perplexity draws `python` there), and otherwise stays as a paragraph above the fence, escaped like any other page text. Read from the `<pre>` for the same reason the whole `<pre>` is read when the `<code>` is not alone in it: the caption sits between them |
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
| merged cells, nested table, cell holding `<pre>` | flattened into an ordinary pipe table — a merge leaves the positions it covered empty, a nested table becomes its rows one per line with `·` between cells, preformatted text one code span per line, its indentation held in non-breaking spaces because a renderer collapses ordinary ones inside an inline `<code>` |

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
| `<img>` without `alt` | `![](src)` — the author left it out, so nothing is claimed about the picture and it stays |
| `<img alt="">` | dropped, when anything else in its parent carries text — an empty `alt` is HTML's own way of saying the image is not content, which is how a favicon in a citation pill, a spacer gif and an icon beside a label are written. Alone in its parent it is kept: it was all that was there |
| `<img title>` | `![alt](src 'title')` |
| `<img>` with no usable URL | the alt text alone, escaped |
| `<picture>`, `srcset`, lazy-load attributes | the `<img>` inside, resolved to one URL — `data-src` and its spellings first, then the largest `srcset` candidate, then `src` unless it is a placeholder, then the URL rescued from a neighbouring `<noscript>` |
| a relative URL | resolved against `baseUrl`. An empty or whitespace-only one is not a relative URL and is not resolved: for a link that would be the page's own address, which is what `href=""` means and what the reader clicked, but for an image it would invent a picture out of the page they were reading |
| `//host/path` | resolved too — it is an address only inside a document that already has a scheme, and a `.md` file has none, so an editor reads it as a path on the reader's own disk. Left alone when the caller brings no base, since inventing `https:` would state a scheme the page never used |
| `<sup><a href="#fn1">` | `[^1]` plus a definitions section — **only with `footnotes: true`, which the extension does not set**; otherwise an ordinary link, `Fact[1](#fn1)`. The list the definitions were read from is still converted where it stands, unless it sits in a container the page marks as the notes (`class` containing `footnote`, or `role="doc-endnotes"`), which is dropped |

## Inline

| HTML | Markdown | Note |
| --- | --- | --- |
| `<b>` `<strong>` | `**text**` | |
| `<i>` `<em>` `<cite>` `<dfn>` `<var>` | `_text_` | the last three via the browser's own italic |
| `<del>` `<s>` `<strike>` | `~~text~~` | `strike` via the browser's own line-through |
| `<code>` `<kbd>` `<samp>` | `` `text` `` | contents never escaped, and only the text: a `<strong>` inside writes no `**`. Two spans with nothing between them merge into one, since two backtick runs meeting cannot be told apart |
| `<sub>` `<sup>` | Unicode: `H₂O`, `x²` | see below |
| `<ruby>` + `<rt>` | `漢字(かんじ)` | the reading beside the word rather than welded onto it — `漢字かんじ` is the word read twice and a search for either half then fails. `<rp>` is dropped: it holds the same two characters for a browser that cannot draw ruby, and keeping both gives `((かんじ))` |
| `<q>` | `“quoted”` | the marks a UA stylesheet draws, written as characters. The pair comes from the nearest `lang` — `«…»` under `ru`, `„…“` under `de`, `「…」` under `ja` — out of CLDR's delimiters, which is what CSS's `quotes: auto` resolves against; unknown falls back to `“…”`, and a nested `<q>` takes the second pair. An empty one writes nothing, and a page that styled the marks off (`quotes: none`) gets them anyway: that is a stylesheet, and the core reads attributes |
| KaTeX, MathJax, `<math alttext>` | `$latex$` / `$$latex$$` | when `math` is on. The core reads LaTeX the page already carries — an `<annotation encoding="application/x-tex">`, a `<script type="math/tex">`, Wikipedia's `alttext` |
| display or inline | `$$…$$` only where the page says display: `<math display="block">`, a `.katex-display` ancestor, `<mjx-container display="true">`, `type="math/tex; mode=display"` | Wikipedia's `{\displaystyle …}` wrapper is **not** evidence — it wraps its inline formulas too, and reading it as display turned a sentence carrying three of them into three centred blocks |
| `{\displaystyle …}`, `{\textstyle …}` | taken off, whatever carried the formula | the renderer's wrapper, not the reader's formula: it is on all 905 formulas of four sampled articles, and the file used to hand it on to whatever the reader pasted it into. Only a whole wrapper goes — a formula's own `\displaystyle` further in stays, and two wrapped groups in one string are not read as one |
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
| `display: block` on an inline tag | its own paragraph — when the *page* states it. A `block` a flex or grid **row** derives for its items is the layout algorithm's word, not the page's: the reader saw one line, and twelve navigation links came back as twelve paragraphs. A flex column, and a grid one column wide, do stack, and there it is recorded |
| `display: inline` on a block tag | stays in the line — and where the tag is an `<li>`, the item is still parted from the one beside it by a blank: markup writes nothing between `</li>` and `<li>`, and a page that lays its items along a line shows the gap with a `margin` nothing here can read. Stack Overflow's tags arrived as `javac++performance` |
| `text-align` on a column | `:--`, `:-:`, `--:` |
| a style declining its tag's own mark | the mark is dropped |

## Removed before conversion

Content nobody could read is not content:

| CSS | |
| --- | --- |
| `display: none`, `visibility: hidden\|collapse`, `opacity: 0` | removed — unless it is a maths carrier, see below |
| `clip: rect(0…)`, `clip-path: inset(≥50%)`, four-digit negative offset or `text-indent`, a 1×1 clipping box | removed — this is how `.sr-only` is written. A zero side of the rect counts written bare or in `px`, with or without commas; in another unit it stays unread, since the direction that costs is the one that deletes |
| `opacity: 0` under a transition or animation | **kept** — a section on its way in. The transition has to name `opacity` or `all`; any animation counts |
| `visibility: hidden` under a transition, in the flow | **kept** — a reveal, not an overlay. Here the transition may name `visibility`, `opacity` or `all`: the fade idiom is `transition: opacity .3s, visibility 0s .3s`, which carries the duration on the opacity and gives the visibility a zero one, so each half is evidence for the other |
| `visibility: hidden` under such a transition, `absolute`/`fixed` | removed — a dropdown standing by |
| a maths carrier, with `math: true` | **kept, however it is hidden** — a `<math alttext>`, an `<annotation encoding="application/x-tex">`, a `<script type="math/tex">`. A rendered formula is two things at once: something drawn for the eye and an invisible twin holding the meaning, and the twin is hidden *by design*. Deleting it left a Wikipedia article with 31 pictures and no formulas. The exemption names the element rather than a property, because Wikipedia hides its twin with an inline `display:none` **and** a stylesheet pinhole |
| a box holding a carrier **and** something visible | removed as usual — that is a whole formula, and the drawing beside the twin is the witness that the page meant to show it |
| a hidden box holding something declared visible again | kept, and what is still hidden inside says so — except its own text, which has no style to say it with and is dropped where it stands. Whitespace stays: a blank looks the same hidden or shown, and removing it welds the runs on either side together. Where the hiding comes from a class, the snapshot states it at both ends, so a `visibility` mark no longer means only "remove this" |

Removed by markup rather than by style:

| | |
| --- | --- |
| `hidden` | removed — it is `display:none` in the UA stylesheet, so nothing was on screen |
| a `<details>` with no `open` | body removed, `<summary>` kept — the browser draws the body away behind `::details-content`, where no style says so and every element inside still computes `display:block`. MDN folds its sidebar this way, and a 2,655-word article carried 500 words nobody had opened |
| `aria-hidden="true"` | **kept.** It takes a node out of the accessibility tree and leaves every pixel where it was: a star rating drawn as `★★★★★`, the `→` in a "read more" link, a number beside a chart. Everything that really hides is read from the style, and this attribute only subtracted text the reader saw |
| `<script>`, `<style>`, `<object>`, `<embed>`, `<template>`, `<svg>` | removed outright |
| `<iframe>`, `<video>`, `<audio>` | **kept as a link to what they play.** An embed is content, and deleting it left the reader a blank place where a player had been — a Notion help page with three videos wrote nothing three times, and every YouTube embed on every blog went the same way. The address comes from `src` or the first `<source>`; the label from `title`, then `aria-label`, then the tail of the address, which is a file name often enough — never a word this converter invented, since the library has no locale to pick one in. The children go: they are the fallback for a browser that cannot play it, and the one the capture came from can |
| `<noscript>` | removed — but an image URL inside it is first handed to the neighbouring `<img>`, which is where lazy-loading pages keep the real one |
| `<nav>`, `<header>`, `<footer>`, `<aside>` | removed with their contents in **full mode** (`mode` unset, the library default); kept in **selection mode**, because a person who selected them meant to. The extension asks for selection mode in `CONVERSION_OPTIONS`, so both of its capture paths keep them — including the `<header>` and `<footer>` *inside* a highlighted `<article>`, which is how every news site ships a headline and a byline |

`script[type="math/tex"]` is the exception to the `<script>` rule: with `math: true`
it holds the formula and is read, not dropped.

## Converts to plain text, deliberately

Markdown has no way to say these, and inventing one would state something the
page did not:

`<ins>` `<u>` (no underline syntax) · `<small>` `<big>` (no size syntax) ·
`<abbr>` (the title is not shown) · `<time>` `<data>` `<output>` `<bdi>`
`<tt>` `<font>`

`<bdo>` is in that list with a caveat worth stating: the reader saw its
characters *reversed*, and the file gets them in the order the DOM holds them.
Writing what was on screen would hand back a string nobody can search or quote.

Not read from CSS either, and for the same reason plus a rate of false positives:
`font-family` (numbers, timestamps and prices are routinely monospaced),
`font-size` (leads, prices, headings), `color` alone (links, brand accents, syntax
highlighting), `text-transform` (the capitals are not in the text).

## What the extension asks for

The map above is the core's. The extension converts with one fixed set of options
and steps of its own around them:

| | |
| --- | --- |
| `topHeadingLevel: 2` | the shallowest heading of the capture becomes `##` and the rest keep their distance from it, leaving `#` for the note's own title. Not a fixed shift: a chat interface writes a whole answer under `<h3>`, and shifting by one made a file whose first heading was `####` with nothing above it. Worked out per capture — across every fragment when there are several, so two ranks a highlighter picked out do not collapse into one |
| `math: true` plus a rule of its own | `src/content/raw-mathml-rule.ts`, for the MathML the core does not read |
| `baseUrl: document.baseURI` | so a relative URL resolves |
| `complexTableFallback` | `html` or `flatten`, from Settings — never `text` or `skip` |
| `footnotes` | never set |
| `mode: 'selection'` | every capture it makes is a selection or a highlight, so page furniture inside it is kept |
| a partial selection is enriched first | `enrichRange()` gives back the table header row, the list's numbering, the code block's language and the block the range was cut out of |
| `\n` inside a text node → `<br>` | only where the computed `white-space` of the element holding it preserves the newline — `pre`, `pre-wrap`, `pre-line`, `break-spaces`. That is how Instagram and anything else that breaks lines inside one `<span>` gets its paragraphs; under `normal` the browser draws a space and so does the file, which is why an indented `<p>` no longer arrives with a hard break per source line. Skipped where the core keeps the whitespace itself (`pre`, `code`, `kbd`, `samp`, `textarea`) or reads the subtree raw (`script`, `style`, `svg`, math) |
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
- **Whitespace collapses everywhere else**, as it does on screen — which means to
  nothing at a line's edge. A run standing after a block, at a container's start
  or in front of the next block is drawn nowhere by a browser and is written
  nowhere here; four of them in a row, which is what comments between blocks
  leave behind, would otherwise open an indented code block. A run between two
  inline runs is a space the reader saw and stays one — one, however many meet
  there, since the indentation between two elements and a leading space inside
  the second are a single blank on screen. A `&nbsp;` survives the collapse and
  then becomes an ordinary space in the finished file.

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
