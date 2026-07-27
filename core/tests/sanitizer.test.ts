import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { sanitize } from '../src/core/sanitizer.js';

function makeDoc(html: string): Document {
  return parseHTML(`<html><body>${html}</body></html>`).document as unknown as Document;
}

function bodyText(doc: Document): string {
  return (doc.body as Element).textContent ?? '';
}

function bodyHTML(doc: Document): string {
  return (doc.body as Element).innerHTML;
}

// A fragment string, parsed as one. `DOMParser` would wrap it in
// `html > head + body`; linkedom leaves the elements as children of the
// Document, which is the root shape `server.ts` and every library caller using
// the same adapter actually hand to `sanitize`.
function makeMultiRootDoc(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

function rootTags(root: Document | DocumentFragment): string[] {
  const tags: string[] = [];
  for (let el = root.firstElementChild; el; el = el.nextElementSibling) {
    tags.push(el.tagName.toLowerCase());
  }
  return tags;
}

// `Document.textContent` is null per the DOM spec, so ask the children.
function rootText(root: Document | DocumentFragment): string {
  let out = '';
  for (let node = root.firstChild; node; node = node.nextSibling) out += node.textContent ?? '';
  return out;
}

beforeAll(() => {
  // setDOMAdapter не нужен — sanitize работает с готовым DOM
});

describe('sanitizer', () => {
  it('removes script tags', () => {
    const doc = makeDoc('<script>alert(1)</script><p>text</p>');
    sanitize(doc.body as Element);
    expect(bodyHTML(doc)).not.toContain('script');
    expect(bodyText(doc)).toContain('text');
  });

  it('removes hidden elements (hidden attribute)', () => {
    const doc = makeDoc('<p hidden>скрытый</p><p>видимый</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('скрытый');
    expect(bodyText(doc)).toContain('видимый');
  });

  it('removes display:none elements', () => {
    const doc = makeDoc('<p style="display:none">hidden</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('hidden');
    expect(bodyText(doc)).toContain('visible');
  });

  it('removes empty div wrappers', () => {
    const doc = makeDoc('<div></div><p>текст</p>');
    sanitize(doc.body as Element);
    expect(bodyHTML(doc)).not.toContain('<div>');
    expect(bodyText(doc)).toContain('текст');
  });

  it('removes nav in full mode', () => {
    const doc = makeDoc('<nav>меню</nav><p>контент</p>');
    sanitize(doc.body as Element, 'full');
    expect(bodyHTML(doc)).not.toContain('nav');
    expect(bodyText(doc)).toContain('контент');
  });

  it('keeps nav in selection mode', () => {
    const doc = makeDoc('<nav>меню</nav><p>контент</p>');
    sanitize(doc.body as Element, 'selection');
    expect(bodyHTML(doc)).toContain('nav');
  });

  it('does NOT collapse whitespace inside pre/code', () => {
    const doc = makeDoc('<pre><code>  spaces  \n  preserved  </code></pre>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toContain('  spaces  ');
  });
});

// `aria-hidden` takes a node out of the accessibility tree and moves no pixel,
// so a converter reading it as "not on screen" deletes text the person was
// looking at. The attribute's own purpose is the worst case: it marks what is
// visible and voiced some other way — a star rating, an arrow in a link, a
// number beside a chart — and all of it went. Every genuine hiding is read from
// the style, and those cases are pinned above and in `describe('hidden box
// text')`, which is why dropping this one costs no coverage.
describe('aria-hidden is not hiding: text the reader saw', () => {
  it('keeps a paragraph whose only claim to being hidden is aria-hidden', () => {
    const doc = makeDoc('<p aria-hidden="true">ARIA_HIDDEN_PAYLOAD</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toContain('ARIA_HIDDEN_PAYLOAD');
    expect(bodyText(doc)).toContain('visible');
  });

  // The pattern the attribute exists for: a decorative run inside a sentence,
  // drawn on the page and voiced to a screen reader by the text around it.
  it('keeps a decorative run inside the sentence it sits in', () => {
    const doc = makeDoc('<p>Rated <span aria-hidden="true">★★★★★</span> by readers.</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toBe('Rated ★★★★★ by readers.');
  });

  it('keeps the arrow a "read more" link hides from the screen reader', () => {
    const doc = makeDoc('<a href="/x">Read more <span aria-hidden="true">→</span></a>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toBe('Read more →');
  });

  // The regression guards. The `hidden` attribute is a different thing entirely
  // — `display:none` in the UA stylesheet, so nothing is on screen — and a style
  // that hides still decides for itself however the page marked the a11y tree.
  it('still removes the hidden attribute', () => {
    const doc = makeDoc('<p hidden>HIDDEN_ATTRIBUTE_PAYLOAD</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('HIDDEN_ATTRIBUTE_PAYLOAD');
    expect(bodyText(doc)).toContain('visible');
  });

  it('still removes aria-hidden with display:none, because the style says so', () => {
    const doc = makeDoc('<p aria-hidden="true" style="display:none">GONE</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('GONE');
    expect(bodyText(doc)).toContain('visible');
  });

  it('still removes aria-hidden inside a clipped .sr-only shape', () => {
    const doc = makeDoc(
      '<p aria-hidden="true" style="position:absolute;clip:rect(0,0,0,0)">GONE</p><p>visible</p>',
    );
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('GONE');
    expect(bodyText(doc)).toContain('visible');
  });

  it('never removed aria-hidden="false" and still does not', () => {
    const doc = makeDoc('<p aria-hidden="false">KEPT</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toBe('KEPT');
  });
});

// A box that is invisible and kept only because something below declared itself
// visible again is the one element removal cannot reach, so its own text is
// dropped where it stands. Every element under it is asked in turn and answers
// for itself; a text node has no style, and had nobody to answer for it at all.
describe('hidden box text: the tree the sanitizer leaves', () => {
  it('drops the text a kept invisible box holds directly', () => {
    const doc = makeDoc(
      '<div style="visibility:hidden">HIDDEN_TEXT' +
      '<span style="visibility:visible">seen</span>ALSO_HIDDEN</div>',
    );
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toBe('seen');
    // The box itself stays: removing it would take the visible span with it.
    expect(bodyHTML(doc)).toContain('visibility:hidden');
  });

  it('leaves the text of a descendant that is visible again', () => {
    const doc = makeDoc(
      '<div style="visibility:hidden">X' +
      '<span style="visibility:visible">seen and <b>bold</b></span>Y</div>',
    );
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toBe('seen and bold');
  });

  it('still removes a box with nothing visible under it, text and all', () => {
    const doc = makeDoc('<div style="visibility:hidden">TEXT<p>HIDDEN</p></div><p>ok</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toBe('ok');
    expect(bodyHTML(doc)).not.toContain('visibility');
  });
});

// Every pass has to see the same tree, whatever shape the root is. A
// `document.createTreeWalker` rooted at a fragment-parsed Document visits only
// the first element child's subtree under linkedom, so everything standing
// after it went unsanitized: a `<nav>` survived `full` mode, a `<script>` kept
// its source, whitespace was never collapsed. `removeHidden` was right all
// along because it walked the sibling chain itself.
describe('sanitizer traversal: roots with more than one element child', () => {
  it('sanitizes every top-level element, not only the first', () => {
    const doc = makeMultiRootDoc(
      '<p>first</p><nav>menu</nav><script>alert(1)</script>' +
        '<template>tpl</template><svg><text>vector</text></svg>' +
        '<style>.x{}</style><p>last</p>',
    );
    sanitize(doc, 'full');
    expect(rootTags(doc)).toEqual(['p', 'p']);
    // What must survive is asserted as loudly as what must go: the passes now
    // reach further, and reaching further is only correct while the prose stays.
    expect(rootText(doc)).toBe('firstlast');
    for (const gone of ['menu', 'alert(1)', 'tpl', 'vector', '.x{}']) {
      expect(rootText(doc)).not.toContain(gone);
    }
  });

  it('keeps a later nav in selection mode and still drops the script beside it', () => {
    const doc = makeMultiRootDoc('<p>first</p><nav>menu</nav><script>alert(1)</script>');
    sanitize(doc, 'selection');
    expect(rootTags(doc)).toEqual(['p', 'nav']);
    expect(rootText(doc)).toBe('firstmenu');
  });

  it('collapses whitespace in a top-level element after the first', () => {
    const doc = makeMultiRootDoc('<p>first</p><p>two   spaces\n\tand a tab</p>');
    sanitize(doc, 'full');
    expect(rootText(doc)).toBe('firsttwo spaces and a tab');
  });

  it('removes a hidden and an empty wrapper standing after the first', () => {
    const doc = makeMultiRootDoc(
      '<p>first</p><div>   </div><p hidden>unseen</p><p>last</p>',
    );
    sanitize(doc, 'full');
    expect(rootTags(doc)).toEqual(['p', 'p']);
    expect(rootText(doc)).toBe('firstlast');
  });

  // The one root shape linkedom's TreeWalker already handled, so this passed
  // before the walk was replaced. It stays because the shape is in the
  // contract — `enrichRange` builds one — and nothing else pins it.
  it('sanitizes a DocumentFragment root', () => {
    const doc = makeDoc('');
    const frag = doc.createDocumentFragment();
    const holder = doc.createElement('div');
    holder.innerHTML =
      '<p>first</p><nav>menu</nav><script>alert(1)</script>' +
      '<template>tpl</template><svg><text>vector</text></svg><p>two   spaces</p>';
    while (holder.firstChild) frag.appendChild(holder.firstChild);
    sanitize(frag, 'full');
    expect(rootTags(frag)).toEqual(['p', 'p']);
    expect(rootText(frag)).toBe('firsttwo spaces');
  });
});
