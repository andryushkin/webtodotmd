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
  removeHidden(root);
  removeEmptyWrappers(root);
  collapseWhitespace(root);
  // Adjacent text nodes are one line to the reader but separate nodes to the
  // escaper, which decides per node and so cannot see a construct spanning two.
  // A parser hands `&lt;/td&gt;` over as "<", "/td", ">" — three nodes, each
  // harmless alone, `</td>` once joined. Merging them last, after every removal
  // has created its own new neighbours, is what lets a lookahead work at all.
  root.normalize();
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
function removeHidden(root: SanitizeRoot): void {
  const toRemove: Node[] = [];
  walkElements(root, (el) => {
    const hiding = hidingOf(el);
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

// Every way a page writes "this is here but nobody sees it". `hidingVerdict`
// parses the attribute rather than matching it, which is what tells
// `visibility: collapse` from a `-ms-visibility: collapsed` nobody implements,
// and `opacity: 0` from `opacity: 0.9`. The verdict itself is never spelled a
// second time here: these two attributes are the part that is not a style.
function hidingOf(el: Element): Hiding {
  if (el.hasAttribute('hidden')) return 'removed';
  if (el.getAttribute('aria-hidden') === 'true') return 'removed';
  return hidingVerdict(el);
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
      el.parentNode?.removeChild(el);
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
