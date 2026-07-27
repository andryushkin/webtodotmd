# Conversion core — invariants

`htmltodotmd`: HTML → Markdown, developed here and published from here. Isomorphic
by contract — it runs against a live DOM in the extension, against linkedom in its
own tests, and against whatever a library caller brings. Anything that needs a
layout engine belongs in `src/content/`, not here.

Each rule below has cost a bug already; the reason is what makes it stick.

## Output language

- The product converts HTML *into* Markdown, so live HTML in the output is unfinished work, not a
  feature. The only tags a file should hold are escaped ones the page itself displayed — `\<div\>`
  on a page about HTML, which the reader saw as characters and must go on seeing as characters.
  Never a tag emitted to carry an appearance: a background becomes `**`, not a `<mark>`, and
  `==` is not the answer either — it is neither CommonMark nor GFM, so the panel would show the
  characters, and making it markup means escaping every `x==y` a page ever prints.
  One place still breaks this and is a debt: the emphasis fallback for content flanked by
  punctuation, where the alternative was losing the italics and leaving the delimiters on show.
  `<sub>`/`<sup>` used to be a second and are not any more — they shift into Unicode (`H₂O`, `x²`),
  all or nothing per element, since a half-mapped run states a different formula just as firmly.

## Escaping

- Markdown characters in the page's own text are escaped, so the file renders what the reader saw.
  Inline marks (`*`, a non-intraword `_`, `` ` ``, tildes, link brackets, the last two against a
  bounded lookahead) are escaped per text node; `#`, `>`, bullets, numbering and a line of dashes only
  in the node that opens a block — a text node is not a line, and the parser splits text at every
  element boundary. Never escape inside `pre`, `code`, `kbd`, `samp` or a math subtree: a backslash
  there is corruption, and in a math subtree only a tag start (`<` before a letter or slash) is
  neutralized, because that is what can close a fallback cell.
- A `~` is escaped when a partner can reach it, never for standing at an edge. One tilde renders as
  itself, so the question is whether a second can pair with it: another in this node that flanking
  lets close what it opens (`1~5 and 7~9` pays, `~/src and ~/usr` does not — both open, neither
  closes), or one the line writes beside it, which is the `~~` of a `<del>`. `~` before a struck `x`
  made `~~~x~~`, a tilde code fence, and `x` left the page — the only defect the survey has found
  that costs content rather than characters. Both halves of a pair pay or neither does: a backslash
  does not stop marked closing a `<del>` on the escaped one. `~/src`, `~5 min`, a `<td>~</td>` and a
  `## ~/home` pay nothing.
- HTML in page text is escaped too (`\<`, `\&`), just as narrowly. Two halves must not assemble across
  a node boundary: `sanitize()` calls `normalize()` last, and a node whose tail is still an open
  construct escapes it defensively, since it cannot see what the next node adds.

## Emphasis and style

- Emphasis picks the first marker CommonMark's flanking rules let render: `_`/`**`, then `*`/`__`,
  then an HTML tag (`src/utils/flanking.ts`). Content starting or ending in punctuation, pressed
  against a word, has no marker that works — emitting one lost the italics and left the characters.
- A style mark is what is *heavier than its context*, never a large `font-weight`
  (`src/utils/inline-style.ts`): a heading, a `<th>` and a `<strong>` are already bold and are
  routinely handed the weight they have, so `**` inside a `##` is what the naive rule writes. It runs
  both ways — a style declining its tag's mark drops it — and emits through `emphasis()` like every
  other mark.
- `display` is decided in `convert()` and nowhere else, both ways round: `block` on an inline tag
  wraps the rule's output in blank lines, `inline` on a block tag returns the content instead of
  running the rule. A styled block *opens a line*, so `opensBlock()` and every lookahead must ask
  about it too — while only the tag was asked, `<span style="display:block"># heading</span>` put a
  real H1 in the file. Only tags whose whole output is content between blank lines can decline one:
  a `<br>` carries `display:inline` in every computed style there is, and a `<table>` writes a grid.

## Reading a style

- The core reads attributes, never `getComputedStyle`, because it is isomorphic: `style`, and beside
  it `data-s2md-style`, a computed style the content script recorded while it still had live nodes.
  `elementStyle()` joins them — the snapshot is the later word, silence in it is not a denial — and
  one parser and one set of property readers answer both, so neither side can invent a spelling the
  other has to be taught. Every question about a style goes through it: `getAlignment` had a regex of
  its own and a column aligned by a class lost its `---:`. No snapshot is the ordinary case:
  `server.ts` and every library caller convert without one, and behavior must survive its absence.
  Gate on what a style *says*, not that there is one — `color` and `margin` are most of what a page
  writes inline and change no character of the output, so `statesConversion()`/`statesDisplay()` come
  before any parse or ancestor walk.
- Any lookup keyed by a tag name or a CSS value is a `Map`, never an object literal: the page picks
  the key, and `EMPHASIS_TAGS['constructor']` answered with `Object` — truthy, so an unknown
  `<constructor>` element read as an emphasis wrapper and the `<em>` beside it gave up its `*`.

## Hiding

The expensive mistake here is deleting text a person saw, not keeping text they did not. Every
threshold sits where no layout lands by accident.

- `hiddenByStyle()` also drops what is drawn where nobody can look: a zero `clip` rect, `clip-path:
  inset(≥50%)`, a four-digit negative `text-indent` or offset, a 1×1 box that clips. That is how
  `.sr-only` and `.visually-hidden` are written, and the text under them was meant for a screen
  reader alone.
- One thing is exempt from all of it, and only with `math: true`: an element a maths rule can read a
  formula out of — a `<math alttext>`, an `<annotation encoding="application/x-tex">`, a `<script
  type="math/tex">`. A rendered formula is two things at once, something drawn for the eye and an
  invisible twin holding the meaning, and every renderer hides the twin the way `.sr-only` hides a
  skip link. Removing it left a Wikipedia article with 31 pictures and no formulas, and a KaTeX page
  with the formula gone from the sentence altogether. The exemption names the element and not a
  property list, because Wikipedia hides its twin with an inline `display:none` *and* a stylesheet
  pinhole — a clipped-only exemption repairs the snapshot path and leaves every library caller
  broken. What still removes a formula the page really hid is structural: the drawing is the witness,
  so a box holding a carrier *and* something visible is a whole formula and goes, while a box holding
  a carrier and nothing else is a renderer's wrapper and stays.
- Which is why two of those hold back. An `opacity: 0` under a transition or an animation is a
  section on its way in, not one withheld, and reveal-on-scroll libraries put it on half an article;
  `revealsFrom()` reads the shorthand and the longhands, because an attribute writes one and a
  computed style the other. And `visibility` is the one a descendant can take back — removal takes
  the subtree, so a hidden box holding something declared visible again stays, and what is still
  hidden inside it says so for itself. Every child *element* can; the box's own text nodes cannot,
  and went into the file for as long as nothing dropped them on their behalf — which is why
  `hidingVerdict()` has a third answer, `invisible-but-kept`, and the sanitizer takes the glyphs
  such a box holds directly. Its whitespace stays: a blank is the same hidden or shown, and taking
  it welds the visible runs on either side into one word.
- A `visibility:hidden` under a transition is either kind, written identically: a section a reveal
  library has not animated in, or a dropdown standing by. The box tells them apart — an overlay must
  leave the flow or it would hold space open while closed — so `absolute`/`fixed` is removed and
  anything in the flow stays. Judged wrong one way the file loses a menu, the other way the article.

## Maths

- Display is what the *page* states, and each renderer states it in its own spelling: `<math
  display="block">` (MathML's own attribute, and what Wikipedia sets), a `.katex-display` ancestor,
  `<mjx-container display="true">` — MathJax reads MathML's `block` and writes its own `true`, so
  asking one element the other's question answers about nothing — and `type="math/tex; mode=display"`.
  Never the LaTeX: Wikipedia wraps *every* formula in `{\displaystyle …}`, inline ones included (19
  of 31 formulas on one article are display and all 31 carry the wrapper), so reading it as display
  cut a sentence into centred blocks, and the same test read a real display equation as inline
  because it was asked of the wrong attribute.
- That wrapper comes *off*, once, at the one exit every source passes through — the annotation, the
  `math/tex` script and the `alttext` alike. It was stripped on the `alttext` branch alone, which is
  the branch the live site never reaches, so every captured formula carried eleven characters of
  someone else's syntax into whatever the reader pasted it into; the preview hid that, because KaTeX
  renders the wrapper as the formula. `{\textstyle …}` is the same wrapper stating the opposite and
  goes too — 264 of 905 sampled formulas use it — but it must not vote on display, or a
  `<math display="block">` written with it would come back inline. The start anchor is what keeps a
  formula's own `\displaystyle` safe, and a brace-balance check is what keeps `{\displaystyle a}+{\displaystyle b}`
  from being read as one group.
- A carrier is what a rule can read a formula *out of*, never any MathML: an assistive twin with no
  annotation is not one, and reading it as one made MathJax v2 write the formula twice — once from
  the twin the extension's own MathML rule then converted, once from the `<script>` that always
  carried it. Where a renderer puts a picture beside the twin, the duplication is settled on the
  *wrapper* — `.katex`, `<mjx-container>`, `.mwe-math-element` each have a rule that ignores its
  children — because the wrapper is the only element that knows the two are one formula. A rule that
  merely refused the `<img>` would have to be taught every further fallback the renderer adds.

## Tables

- A pipe table states alignment once per column, and the page may say it in either row. The header
  answers first; when it is silent the body does, but only unanimously — a table of numbers carries
  `text-align` on every `<td>` and nothing on the `<th>`, while one differing or silent cell means
  the column was never aligned at all.
- The HTML table fallback sets `outputContext: 'html'` for its cells: an HTML block is not parsed as
  Markdown, so escaping shows backslashes *and* `**bold**` shows asterisks. Emphasis, code and links
  emit tags; an image emits alt text, since allowing `src`/`alt` past the preview's allow-list would
  widen it for a case that already rendered nothing. A link's scheme is checked.

## Package

`core/` is an npm package (`htmltodotmd`) with its own `tsup` build, its own version, and its own
`exports`. It has never been published — there is no npm release and `docs/releasing.md` covers the
extension only, so the version in `package.json` currently numbers nothing. Three `data-s2md-*`
attribute names are baked into its public surface (`SNAPSHOT_ATTR` here, `ORIGIN_ATTR` and
`ORIGIN_ROW_ATTR` in `src/browser.ts`); publishing this as a general library means making those a
parameter first.
