import { isContentless } from './contentful.js';
import { hidingVerdict, type Hiding } from '../utils/inline-style.js';
const REMOVE_TAGS = new Set(['style', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg']);
const REMOVE_STRUCTURAL = new Set(['nav', 'footer', 'aside', 'header']);
const UNWRAP_IF_EMPTY = new Set(['div', 'span', 'section', 'article']);
const PRESERVE_WS = new Set(['pre', 'code', 'textarea', 'kbd', 'samp']);

// Every root shape the library is handed: a Document from `server.ts`, a
// Document from the extension's parser, the container the selection path fills,
// and the DocumentFragment `enrichRange` builds.
type SanitizeRoot = Element | Document | DocumentFragment;

export function sanitize(
  root: SanitizeRoot,
  mode: 'full' | 'selection' = 'full',
  math = false,
): void {
  hoistNoscriptImageSrc(root);
  removeByTagSet(root, REMOVE_TAGS);
  removeScripts(root, math);
  if (mode === 'full') removeByTagSet(root, REMOVE_STRUCTURAL);
  foldCollapsedDetails(root);
  removeHidden(root, math);
  removeEmptyWrappers(root);
  collapseWhitespace(root);
  // Adjacent text nodes are one line to the reader but separate nodes to the
  // escaper, which decides per node and so cannot see a construct spanning two.
  // A parser hands `&lt;/td&gt;` over as "<", "/td", ">" — three nodes, each
  // harmless alone, `</td>` once joined. Merging them last, after every removal
  // has created its own new neighbours, is what lets a lookahead work at all.
  root.normalize();
}

/**
 * A `<details>` the page did not open shows its `<summary>` and nothing else.
 *
 * This is the one hiding no style declares. The browser draws the body away
 * behind `::details-content`, so every element inside computes `display: block`
 * and `visibility: visible` — a snapshot taken off live nodes agrees with the
 * markup, and both are describing a box nobody can read. Only the missing
 * `open` attribute says so, which is why the core answers it rather than
 * `src/content/`: the same markup means the same thing to a library caller with
 * no browser anywhere.
 *
 * Found on MDN, where the sidebar folds every CSS group into one: an article of
 * 2,655 words came back carrying 500 more the reader never saw, most of them a
 * bare list of property names.
 */
function foldCollapsedDetails(root: SanitizeRoot): void {
  const collapsed: Element[] = [];
  walkElements(root, (el) => {
    if (el.tagName.toLowerCase() === 'details' && !el.hasAttribute('open')) collapsed.push(el);
  });
  for (const el of collapsed) {
    // The first `<summary>` is the one the browser draws; a second is body text
    // like any other, and goes with the rest.
    let summary: Element | null = null;
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
      if (child.tagName.toLowerCase() === 'summary') { summary = child; break; }
    }
    for (let child = el.firstChild; child; ) {
      const next = child.nextSibling;
      if (child !== summary) el.removeChild(child);
      child = next;
    }
  }
}

function removeScripts(root: SanitizeRoot, preserveMath: boolean): void {
  const toRemove: Element[] = [];
  walkElements(root, (el) => {
    if (el.tagName.toLowerCase() !== 'script') return;
    if (preserveMath && (el.getAttribute('type') ?? '').startsWith('math/tex')) return;
    toRemove.push(el);
  });
  for (const el of toRemove) el.parentNode?.removeChild(el);
}

// Перед удалением <noscript>: если рядом с placeholder-img есть <noscript> с реальным src,
// копируем этот src в data-noscript-src на img, чтобы extractImageUrl мог его использовать.
// A walk down the tree is not guaranteed to enter <noscript>, so this asks
// querySelectorAll instead of `walkElements`.
function hoistNoscriptImageSrc(root: SanitizeRoot): void {
  const noscripts = Array.from(
    (root as Element).querySelectorAll ? (root as Element).querySelectorAll('noscript') : [],
  );
  for (const el of noscripts) {
    const prev = el.previousElementSibling;
    if (!prev || prev.tagName.toLowerCase() !== 'img') continue;
    // DOM может парсить noscript как элементы (linkedom) или как raw-text (браузер)
    const innerImg = el.querySelector('img');
    if (innerImg) {
      const src = innerImg.getAttribute('src');
      if (src) prev.setAttribute('data-noscript-src', src);
    } else {
      const match = el.textContent?.match(/src=["']([^"']+)["']/);
      if (match) prev.setAttribute('data-noscript-src', match[1]!);
    }
  }
}

function removeByTagSet(root: SanitizeRoot, tags: Set<string>): void {
  // Собираем все элементы заранее, чтобы не мутировать во время итерации
  const toRemove: Element[] = [];
  walkElements(root, (el) => {
    if (tags.has(el.tagName.toLowerCase())) {
      toRemove.push(el);
    }
  });
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }
}

// Removal takes the subtree with the element, so the walk stops at the first
// element it decides against rather than asking the same question of everything
// underneath — the answer there is discarded, and `hidingVerdict` pays for a
// search of the subtree to give it.
//
// The one box that stays while invisible is the one holding something declared
// visible again, and it is the only place a text node needs speaking for. Every
// element under such a box is asked in turn and says it is still hidden, because
// `visibility` inherits; the box's own text has no style to be asked about, so
// nothing spoke for it and it walked straight into the file. `dropOwnText` is
// that question asked on its behalf, at every depth the same box recurs — a
// hidden box inside a hidden box is kept for the same one visible leaf.
function removeHidden(root: SanitizeRoot, math: boolean): void {
  const toRemove: Node[] = [];
  walkElements(root, (el) => {
    const hiding = hidingOf(el, math);
    if (hiding === 'removed') {
      toRemove.push(el);
      return false;
    }
    if (hiding === 'invisible-but-kept') dropOwnText(el, toRemove);
    return true;
  });
  for (const node of toRemove) {
    node.parentNode?.removeChild(node);
  }
}

const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]';
const MATH_CARRIER_SELECTOR = `math[alttext], ${TEX_ANNOTATION}, script[type^="math/tex"]`;

/**
 * An element a maths rule can read a formula out of — the three sources
 * `readMath()` has, put here as a question about the node.
 *
 * "Can read", not "is MathML", and MathJax v2 is what paid for the difference.
 * Its assistive MathML carries no TeX — `toMathML` writes an `<annotation>` only
 * under `menuSettings.semantics`, which is off by default — while the formula's
 * LaTeX sits in the `<script type="math/tex">` beside the frame, which converts
 * already. Keeping that twin put a second copy of the same formula in the file,
 * `$E = m c^{2}$$E=mc^2$` where the reader saw one. The `<script>` needs no
 * sparing of its own: `removeScripts` has done it long before this pass asks.
 */
function isMathCarrier(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'annotation') return el.getAttribute('encoding') === 'application/x-tex';
  if (tag === 'script') return (el.getAttribute('type') ?? '').startsWith('math/tex');
  if (tag !== 'math') return false;
  return el.hasAttribute('alttext') || el.querySelector?.(TEX_ANNOTATION) != null;
}

// Whether everything this element holds is carried by maths — no glyph of its
// own outside a carrier's subtree. That is the whole of what tells a renderer's
// wrapper from a hidden section: `<span class="katex-mathml">`, `<span
// class="mwe-math-mathml-a11y">` and `<mjx-assistive-mml>` each hold one `<math>`
// and nothing else, while a box a page really hid holds prose, or the formula's
// own visible twin, beside it.
function showsOnlyMath(el: Element): boolean {
  let only = true;
  const step = (node: Node): void => {
    for (let child = node.firstChild; child && only; child = child.nextSibling) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        if (/\S/.test(child.nodeValue ?? '')) only = false;
      } else if (child.nodeType === 1 /* ELEMENT_NODE */ && !isMathCarrier(child as Element)) {
        step(child);
      }
    }
  };
  step(el);
  return only;
}

/**
 * Whether this element is a formula's meaning rather than a formula.
 *
 * A rendered formula is two things at once: something drawn for the eye — a
 * `<span>` grid, an SVG, an image — and a carrier holding the LaTeX or the
 * MathML, which is where every rule in `rules/math.ts` reads from. The carrier is
 * *made* invisible on purpose, in exactly the `.sr-only` shape a skip link uses,
 * because a reader who can see the drawing must not meet the source twice; and
 * `hidingVerdict()` cannot tell that shape from the one that hides a menu.
 *
 * The twin is the witness. A box holding a carrier *and* something the reader
 * could see is a whole formula, and a page that hid it hid the formula — that is
 * the KaTeX construct inside a `display:none` section, and it still goes. A box
 * holding a carrier and nothing else is the wrapper a renderer put round it, and
 * its invisibility is the design rather than a decision about the reader.
 *
 * Which is also why no property is named here. The renderers spell it every way
 * there is — Wikipedia writes `display:none` in the attribute and lets the
 * stylesheet clip it to a pinhole instead, KaTeX and MathJax v3 clip from a
 * stylesheet the clone never sees, MathJax v2 writes a 1×1 box — and a list of
 * declarations would repair whichever of them was measured. What the formula's
 * own box says still decides: an ancestor that is hidden is removed with
 * everything under it, and the walk never reaches the carrier to ask.
 */
function carriesMath(el: Element): boolean {
  if (isMathCarrier(el)) return true;
  if (el.querySelector?.(MATH_CARRIER_SELECTOR) == null) return false;
  return showsOnlyMath(el);
}

// Every way a page writes "this is here but nobody sees it". `hidingVerdict`
// parses the attribute rather than matching it, which is what tells
// `visibility: collapse` from a `-ms-visibility: collapsed` nobody implements,
// and `opacity: 0` from `opacity: 0.9`. The verdict itself is never spelled a
// second time here: the `hidden` attribute is the part that is not a style.
//
// `aria-hidden` is not asked, and asking it deleted text people had read. It
// takes a node out of the accessibility tree; the pixels stay exactly where
// they were, which is the whole point of the attribute — a star rating drawn
// as `★★★★★`, the `→` in a "read more" link, the number beside a chart are all
// written that way *because* they are visible and the screen reader is told
// about them some other way. Everything that genuinely hides is already read
// from the style, so the attribute added no case of its own and subtracted
// every decorative run a page put it on.
//
// The one thing it did buy was an icon font — `<i class="material-icons"
// aria-hidden="true">close</i>` draws a ✕ from the ligature text, and keeping
// the element writes the word `close`. But the same element is written the
// same way with and without the attribute, so this was never a filter for it,
// only a coincidence on the pages that bothered; and the price of the
// coincidence was deleting the visible text of everything else the attribute
// is put on.
//
// None of it is asked of a maths carrier while `math` is on — see `carriesMath`
// below for why an invisible carrier is not hidden content, and why the exemption
// names the element rather than the declaration that hid it.
function hidingOf(el: Element, math: boolean): Hiding {
  const verdict: Hiding = el.hasAttribute('hidden') ? 'removed' : hidingVerdict(el);
  if (verdict !== 'removed' || !math) return verdict;
  return carriesMath(el) ? 'shown' : 'removed';
}

// The text held directly by an invisible box — not the text under a descendant,
// which is judged when the walk reaches that descendant, and never the text of a
// child that declared itself visible again.
//
// Only what carries a glyph. A blank looks the same hidden or shown, and the box
// still holds its width open, so the space between two revealed runs was on
// screen; dropping it would weld `one two` into `onetwo`, which is the loss this
// pass exists to avoid rather than a second instance of it. The glyphs go because
// keeping them puts words in the file that were never on the page.
function dropOwnText(el: Element, out: Node[]): void {
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3 /* TEXT_NODE */ && /\S/.test(child.nodeValue ?? '')) out.push(child);
  }
}

function removeEmptyWrappers(root: SanitizeRoot): void {
  // Повторяем несколько раз, чтобы убрать вложенные пустые обёртки
  for (let pass = 0; pass < 5; pass++) {
    const toRemove: Element[] = [];
    walkElements(root, (el) => {
      if (UNWRAP_IF_EMPTY.has(el.tagName.toLowerCase()) && isContentless(el)) {
        toRemove.push(el);
      }
    });
    if (toRemove.length === 0) break;
    for (const el of toRemove) {
      // A wrapper holding *blanks* is not an empty one. Every syntax highlighter
      // there is puts the indentation of a code line, and the space between two
      // tokens, in a `<span>` of its own — `<span class="w">  </span>` is how
      // Pygments writes one — and removing those took the blank with them: an
      // indented YAML block came out flush left with `key:value`, and
      // `import tensorflow as tf` came out `importtensorflowastf`. Off a page
      // that is not code the same removal welded `one<span> </span>two` into one
      // word. The blank is content; only the tag around it is empty, so the tag
      // goes and the text stays. Whether it survives as a blank or collapses
      // into the neighbouring one is `collapseWhitespace`'s question, asked next
      // and already answering it for every other text node on the page.
      //
      // A block wrapper is a different thing: `<div> </div>` between two
      // paragraphs is a box the reader saw as a line break, never as a space,
      // and unwrapping it would say the opposite.
      const text = el.textContent ?? '';
      const inline = el.tagName.toLowerCase() === 'span' || isInsidePreserved(el);
      if (text === '' || !inline) {
        el.parentNode?.removeChild(el);
        continue;
      }
      const doc = el.ownerDocument;
      if (!doc) continue;
      el.parentNode?.replaceChild(doc.createTextNode(text), el);
    }
  }
}


function collapseWhitespace(root: SanitizeRoot): void {
  walkTextNodes(root, (textNode) => {
    if (isInsidePreserved(textNode)) return;
    const original = textNode.nodeValue ?? '';
    // НЕ используем \s+ — это сломает \u00A0 (&nbsp;)
    textNode.nodeValue = original.replace(/[\t\n\v\f\r ]+/g, ' ');
  });
}

function isInsidePreserved(node: Node): boolean {
  let current: Node | null = node.parentNode;
  while (current) {
    if (current.nodeType === 1 /* ELEMENT_NODE */) {
      const tag = (current as Element).tagName.toLowerCase();
      if (PRESERVE_WS.has(tag)) return true;
    }
    current = current.parentNode;
  }
  return false;
}

// Every pass above walks through here, so they cannot disagree about which
// nodes exist. `document.createTreeWalker` could not be that walk: under
// linkedom a Document parsed from a *fragment* string keeps several element
// children, and the walker rooted at it visits only the first one's subtree.
// Every top-level element after the first therefore skipped removal, script
// stripping and whitespace collapse — a `<header>` survived a `full`-mode
// sanitize, and a `<script>` after the first element kept its source. The
// browser never showed it because `DOMParser` always builds `html > head +
// body`, so the walk had a single root child; `server.ts` and any library
// caller bringing the same adapter got the under-sanitized tree.
//
// Recursion over `firstElementChild`/`nextElementSibling` is what `removeHidden`
// always did, and it reads the same on a Document with one element child, a
// Document with several, a DocumentFragment and an Element. Returning `false`
// stops the descent, for a pass whose removal takes the subtree with it.
function walkElements(root: SanitizeRoot, visit: (el: Element) => boolean | void): void {
  const step = (el: Element): void => {
    if (visit(el) === false) return;
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) step(child);
  };
  for (let child = root.firstElementChild; child; child = child.nextElementSibling) step(child);
}

// The same walk for text. A text node has no `firstElementChild` chain to arrive
// on, so this descends every child node instead — which is also what a
// SHOW_TEXT TreeWalker does, since the filter selects what it returns, not where
// it goes. Rewriting `nodeValue` is safe during the walk: it moves no node.
function walkTextNodes(root: SanitizeRoot, visit: (node: Text) => void): void {
  const step = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3 /* TEXT_NODE */) visit(child as Text);
      else step(child);
    }
  };
  step(root as Node);
}
