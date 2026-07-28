# Content script — invariants

Runs inside the page. Everything here is constrained by that: no bundler, no
module graph the extension controls, and a Chrome API surface that behaves
differently than it does in the worker or the panel.

Each rule below has cost a bug already; the reason is what makes it stick.

## Isolation

- Never import `src/shared/i18n.ts` here — fetching locale files is unreliable
  in a content script. Translations arrive via `chrome.storage.local`
  (`contentI18n`), written by the service worker.
- Never send service worker → content script data with
  `chrome.runtime.sendMessage`: the panel and the worker both listen and
  compete. Use `chrome.storage.local`.
- Anything that needs a test goes in its own module: `content-script.ts` cannot
  be imported by a test, because of its top-level Chrome API calls.
- Never name the `Node` global — write the node type and document-position
  constants out as numbers, the way `shadow-selection.ts` and `capture.ts` both
  do. These modules are imported by tests running under happy-dom, where the
  global does not exist, and a `ReferenceError` from a constant is swallowed by
  the fault handling around a capture: the failure arrives as an empty file
  rather than as an error. Lending the global back from a test hides the
  condition instead of removing it, and the next harness will not think to.

## Selection

- `cloneContents()` already closes cut tags; the work is restoring what the
  selection left behind. A range crossing *out* of a table has no semantic common
  ancestor, so table headers are restored separately. Clones carry no link to
  originals: mark before cloning, unmark in a `finally`, and detect the header by
  that mark — comparing `textContent` promoted a body row that repeated it. The
  page may own the attribute, so restore its value in the `finally`, not remove.
- Wrap `mirrorShadowRoots()` in try/finally so its cleanup always runs, and take
  the undo it hands back even when a copy faults half way through planting them.
- A selection made *inside* an open shadow root is invisible to `getRangeAt()`:
  the browser moves both endpoints onto the host, so the range arrives collapsed
  in front of it and the capture was empty. `shadow-selection.ts` asks
  `getComposedRanges()` instead, naming every open root — Chrome 137, well above
  the extension's floor, so the document-tree answer stays as the fallback. A
  live `Range` cannot hold two trees, so a selection that crosses out of a
  component lifts its deeper end to the host: over-capturing the component to its
  end costs a sentence, losing the range costs the capture.

- A host's light children are drawn only where a `<slot>` calls for them, so a component with no
  matching slot renders none of them — which is exactly how a no-JavaScript fallback is written.
  GitHub's `<relative-time>` holds `Jul 24, 2026` in the light DOM and shows `3 days ago` from its
  shadow tree, and with the copy planted beside the fallback every date came out as
  `3 days agoJul 24, 2026`. Those children are lifted for the length of the capture and put back in
  a `finally`, backwards, so each finds the sibling it stood in front of already in place. The
  assignment is worked out from the slots and never from `assignedSlot`: only a browser has that
  property, and these paths are also exercised under happy-dom, where it is `undefined` for assigned
  and unassigned children alike. Nothing is lifted where a matching slot exists — an unrendered
  child costs a duplicated line, a rendered one lifted by mistake costs the sentence it held.

## Hard breaks

- A `\n` inside a text node draws a line only where the computed `white-space`
  preserves it (`pre`, `pre-wrap`, `pre-line`, `break-spaces`). A tag list cannot
  answer that, and the `style` attribute cannot either — the old guard read
  `white-space: pre` off an *ancestor of the clone*, which keeps nothing above
  the range's common ancestor, so on an ordinary drag it never saw the styled box
  at all, and its regex was inverted besides: the one value meaning "the reader
  saw these breaks" was read as a reason to skip the rewrite. Under `normal` the
  browser draws a space, and every indented `<p>` was arriving with a hard break
  per source line.
- The verdict is taken in `captureStyles()` beside the snapshot, read-before-write
  like it, and marked with `data-s2md-nl` — the extension's own attribute, never a
  `white-space` declaration in `data-s2md-style`. The core already has a
  whitespace model keyed by tag (`PRESERVE_WS`); a second one on the other side of
  the capture is free to disagree, and then the break is drawn twice. The mark is
  stripped from the fragment before conversion and restored on the page in a
  `finally`.
- A newline at the edge of a *node* is not one at the edge of a line. Trimming a whitespace-only
  part off either end is right when the edge is a block's — that break is the markup's indentation
  between a tag and its text — and wrong when a run of text continues beside it. X writes a tweet as
  spans under one `white-space: pre-wrap` box and puts the paragraph break at the end of a span, so
  the trim cost a 9,000-word thread every paragraph it had: it arrived as one. The question walks the
  siblings and then out through inline wrappers only, stopping at anything that would have ended the
  line anyway. Beside is not only text: a replaced element — a picture, a player, a form control —
  paints a box that `textContent` cannot see, so a caption ending in a newline in front of one lost
  the line the reader saw. Those tags count as drawn whether or not the file has a place for them; a
  break with nothing left after it is dropped anyway, so counting one costs no backslash.
- A clone is not enough on its own: `cloneContents()` strands the common
  ancestor's children at the top of the fragment, where a text node has no parent
  element to carry a mark — which is exactly the ordinary selection. The live
  range is asked as well.

## Style snapshot

- `snapshotStyles()` (`style-snapshot.ts`) is the only `getComputedStyle` in the
  product. It runs before any DOM mutation and writes nothing while it walks —
  setting an attribute invalidates Chrome's style cache, so a walk that wrote as
  it went would pay for a recalculation per element. It records only what the tag
  and the parent do not already imply, which is both what keeps the markup small
  and what lets a run cut out of its bold paragraph stay plain. It walks
  `shadowRoot` too: `mirrorShadowRoots()` copies `innerHTML`, which carries
  attributes and nothing else, so a component not snapshotted first arrives
  unstyled for good. `snapshotScope()` cannot answer for a shadow root — a
  `DocumentFragment` is not an element — so a selection whose common ancestor is
  one hands over the host instead, or the whole component arrives unstyled. Marks
  come off in a `finally`, restoring the page's value.
- What the *parent's layout* implies is not the page's word either. A flex or
  grid container blockifies its items, so an `<a>` in a navigation row computes
  `display: block` though nothing said so — recorded, that turned twelve links
  into twelve paragraphs where the reader saw one line. Only the content script
  can tell: the difference is in the container's computed `display`, which the
  core never sees. A flex *column* and a grid one column wide do stack, and there
  the mark is kept — the column count comes from the used
  `grid-template-columns`, which only live nodes have. `table` does not blockify,
  measured rather than assumed.
- That silence has two exceptions, both about `visibility`. The first is the only
  way the snapshot can *take something back*: where the page's own `style` hides
  an element and the cascade overruled it, the computed value has to be written
  down, because the core falls back on the attribute wherever the snapshot says
  nothing. Same reason a `visibility:hidden` mark is settled on the way *out* of
  the walk — until the subtree has been read, nothing knows whether something
  below is visible, and deciding in document order kept a hidden paragraph
  whenever a visible sibling happened to follow it.
- The second states a hiding the cascade agrees with, and it is a *pair*: a box
  that is invisible with something visible under it says `visibility:hidden`, and
  the descendant that takes the property back says `visibility:visible`. The core
  keeps such a box for the descendant's sake and drops the text the box itself
  holds — but only if it is told, and a class-hidden box tells it nothing on its
  own. Either mark alone is worse than neither: with the first, `revealedBelow()`
  finds nothing and the whole box goes, visible text and all. Both are written
  where the state *changes*, so a revealed subtree costs one mark rather than one
  per element, and a page with no hidden boxes costs nothing.
- One property breaks the "only what is not already implied" rule on purpose, and it is the only
  one: an element carrying `role="heading"` gets its size written down whether or not it differs,
  as a ratio of the text it sits in (`font-size:1.5em`, `font-size:1em`). The core has to read
  silence there as an answer — a `<div>` claiming to be a heading is drawn like body text unless a
  stylesheet says otherwise, and the clone cannot see a stylesheet — and silence is only readable
  where something positive says the drawing was read at all. `1em` is that something. A ratio rather
  than a length because 24px is a heading on one page and body text on another, and because the size
  it would be compared against sits on the parent, which a selection starting at the heading leaves
  outside the fragment. Written nowhere else: nothing on the other side reads a size anywhere else,
  and an attribute per element is what a page-sized budget cannot pay. Both sizes or neither — a
  caller whose computed style answers nothing about `font-size` has not read the drawing, and a `1em`
  written there would claim it had.
- Silence about a derived block leaves the *gap* between the items unsaid, and markup has none:
  `<a>c#</a><a>python</a>` is what a tag list is. The container — not the item — gets
  `data-s2md-row`, once, and the core turns it into the one blank the reader saw. Recording it per
  item would be the paragraph-per-link defect again by another name.
- `flex-direction` is wrong twice — about a row the window was too narrow for, and about a *column
  holding one item*, which stacks nothing: the item and the container are in the same place, and
  where that place is was settled higher up. So the lines are counted. A `Range` over the container's
  contents gives one rectangle per fragment drawn, and one band means `data-s2md-row="line"` rather
  than `"1"` — which is what repairs a mention in a flex row arriving as three paragraphs. Two
  rectangles share a band when they overlap by half the shorter of them (never an equal `top`, which
  two sizes on one baseline do not have), each asked against the *intersection* of the ones before
  it, so a tall picture cannot fuse the five lines of the paragraph beside it. Zero area is dropped
  first, or a box painted nothing in parts a sentence.
- Asked only where the answer can change the file — of a container that does not already read as a
  row, and of one that does only when an item is in `LINE_ITEM_TAGS` — and only under 256 nodes, a
  page shell being a flex box as often as a byline is. That refused two thirds to nine tenths of the
  flex boxes on four real pages; the rest cost 0.4–9.7 ms over the whole `<body>`. No measurement is
  the ordinary case: linkedom, a server and a detached tree answer nothing, and there the capture is
  exactly what it was.
- The verdicts themselves live in `core/` and are asked of it, never spelled
  again here: the two sides disagreeing is how a snapshot marks what the core
  keeps.

## Highlighter

- A mark is written twice: the class, and the same three declarations inline. An application that
  re-renders owns `className` — React writes the attribute out again on every update, and on X the
  outline vanished the moment a tweet re-rendered, while the extension still counted the element as
  highlighted. The inline copy survives that; nothing on those pages writes `style` on the elements
  a person marks.
- It restores rather than removes: the page may own `outline`, `outline-offset` or
  `background-color`, and clearing them would edit what the reader sees once the highlighter is off.
- The marks come off for the length of a capture and go back on in a `finally`. They are the
  extension's own paint, so leaving them on would put them in the style snapshot and in the HTML
  view as if the page had written them — the same rule that drops the bubble from the clone.

## Bubble

- Bubble visibility is `style.display` only. `element.hidden` does nothing —
  the inline `display:inline-flex` overrides the UA `[hidden]` rule.

## Entities and titles

- `html-entities.ts` is generated from the WHATWG table — never hand-edit or
  trim it. The decoder matches longest-first, so a partial table makes
  `&notin;` collapse to `¬in;` via the legacy `&not` name.
- Truncate titles by grapheme (`Intl.Segmenter`), never `slice()`, which splits
  emoji sequences that then reach the front matter and the filename.
- Entity behavior cannot be tested through the DOM — linkedom does not decode
  entities; tests compare against the reference table.
