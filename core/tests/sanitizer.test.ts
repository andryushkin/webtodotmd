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

  it('removes aria-hidden elements', () => {
    const doc = makeDoc('<p aria-hidden="true">hidden</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('hidden');
    expect(bodyText(doc)).toContain('visible');
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
