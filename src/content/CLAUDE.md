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
- Wrap `expandShadowRoots()` in try/finally so its cleanup always runs.

## Style snapshot

- `snapshotStyles()` (`style-snapshot.ts`) is the only `getComputedStyle` in the
  product. It runs before any DOM mutation and writes nothing while it walks —
  setting an attribute invalidates Chrome's style cache, so a walk that wrote as
  it went would pay for a recalculation per element. It records only what the tag
  and the parent do not already imply, which is both what keeps the markup small
  and what lets a run cut out of its bold paragraph stay plain. It walks
  `shadowRoot` too: `expandShadowRoots()` copies `innerHTML`, which carries
  attributes and nothing else, so a component not snapshotted first arrives
  unstyled for good. Marks come off in a `finally`, restoring the page's value.
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
