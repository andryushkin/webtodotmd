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
- The verdicts themselves live in `core/` and are asked of it, never spelled
  again here: the two sides disagreeing is how a snapshot marks what the core
  keeps.

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
