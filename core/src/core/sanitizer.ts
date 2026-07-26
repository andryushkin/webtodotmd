import { isContentless } from './contentful.js';
import { hiddenByStyle } from '../utils/inline-style.js';
const REMOVE_TAGS = new Set(['style', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg']);
const REMOVE_STRUCTURAL = new Set(['nav', 'footer', 'aside', 'header']);
const UNWRAP_IF_EMPTY = new Set(['div', 'span', 'section', 'article']);
const PRESERVE_WS = new Set(['pre', 'code', 'textarea', 'kbd', 'samp']);

export function sanitize(
  root: Element | Document,
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

function removeScripts(root: Element | Document, preserveMath: boolean): void {
  const toRemove: Element[] = [];
  const walker = createWalker(root);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (el.tagName.toLowerCase() !== 'script') continue;
    if (preserveMath && (el.getAttribute('type') ?? '').startsWith('math/tex')) continue;
    toRemove.push(el);
  }
  for (const el of toRemove) el.parentNode?.removeChild(el);
}

// Перед удалением <noscript>: если рядом с placeholder-img есть <noscript> с реальным src,
// копируем этот src в data-noscript-src на img, чтобы extractImageUrl мог его использовать.
// TreeWalker может не обходить <noscript> (linkedom), поэтому используем querySelectorAll.
function hoistNoscriptImageSrc(root: Element | Document): void {
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

function removeByTagSet(root: Element | Document, tags: Set<string>): void {
  // Собираем все элементы заранее, чтобы не мутировать во время итерации
  const toRemove: Element[] = [];
  const walker = createWalker(root);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (tags.has(el.tagName.toLowerCase())) {
      toRemove.push(el);
    }
  }
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }
}

function removeHidden(root: Element | Document): void {
  const toRemove: Element[] = [];
  const walker = createWalker(root);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (isHidden(el)) {
      toRemove.push(el);
    }
  }
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }
}

// Every way a page writes "this is here but nobody sees it". `hiddenByStyle`
// parses the attribute rather than matching it, which is what tells
// `visibility: collapse` from a `-ms-visibility: collapsed` nobody implements,
// and `opacity: 0` from `opacity: 0.9`.
function isHidden(el: Element): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return hiddenByStyle(el);
}

function removeEmptyWrappers(root: Element | Document): void {
  // Повторяем несколько раз, чтобы убрать вложенные пустые обёртки
  for (let pass = 0; pass < 5; pass++) {
    const toRemove: Element[] = [];
    const walker = createWalker(root);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as Element;
      if (UNWRAP_IF_EMPTY.has(el.tagName.toLowerCase()) && isContentless(el)) {
        toRemove.push(el);
      }
    }
    if (toRemove.length === 0) break;
    for (const el of toRemove) {
      el.parentNode?.removeChild(el);
    }
  }
}


function collapseWhitespace(root: Element | Document): void {
  const walker = document_createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (isInsidePreserved(textNode)) continue;
    const original = textNode.nodeValue ?? '';
    // НЕ используем \s+ — это сломает \u00A0 (&nbsp;)
    textNode.nodeValue = original.replace(/[\t\n\v\f\r ]+/g, ' ');
  }
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

function createWalker(root: Element | Document): TreeWalker {
  return document_createTreeWalker(root, 0x1 /* NodeFilter.SHOW_ELEMENT */);
}

// Вспомогательная функция для совместимости с различными DOM-окружениями
function document_createTreeWalker(root: Element | Document, whatToShow: number): TreeWalker {
  const doc =
    root.nodeType === 9 /* DOCUMENT_NODE */ ? (root as Document) : (root as Element).ownerDocument!;
  return doc.createTreeWalker(root, whatToShow);
}
