import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { sanitize } from '../src/core/sanitizer.js';
import { toMarkdown } from '../src/server.js';

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

// A rendered formula is two things at once: something drawn for the eye — a
// `<span>` grid, an SVG, an image — and an invisible twin carrying the meaning,
// which is where every LaTeX the converter reads lives. The twin is *made*
// invisible on purpose, in exactly the shape a skip link uses, so
// `visuallyHiddenFrom()` deleted it before any math rule could run and the
// capture kept the picture and threw the formula away.
//
// Each shape below is what its renderer actually emits, in both spellings the
// core can be handed it in — the page's own `style` attribute, which is all a
// library caller ever has, and the computed style `style-snapshot.ts` records
// beside it. Which one arrives is not the same per renderer, and the notes say so.
describe('math carrier: what the sanitizer leaves of an invisible twin', () => {
  // The `.sr-only` idiom, and what `.mwe-math-mathml-a11y` computes to on a live
  // Wikipedia page: `clip:rect(1px,1px,1px,1px);overflow:hidden;position:
  // absolute;width:1px;height:1px;opacity:0`. Written out twice because the two
  // spellings carry different halves of it — a page's attribute states the
  // opacity, and `clippedDeclarations()` never records one.
  const SR_ONLY = 'clip:rect(1px,1px,1px,1px);position:absolute;width:1px;height:1px;opacity:0';
  const PINHOLE =
    'clip:rect(1px, 1px, 1px, 1px);position:absolute;width:1px;height:1px;overflow:hidden';

  const sanitized = (html: string, math = true): Document => {
    const doc = makeDoc(html);
    sanitize(doc.body as Element, 'full', math);
    return doc;
  };

  const latexOf = (doc: Document): string | undefined =>
    (doc.body as Element).querySelector('annotation')?.textContent ?? undefined;

  // `buildMathML` in vendor/katex.mjs: the MathML with its TeX annotation goes in
  // a `<span class="katex-mathml">`, the glyphs in a sibling `.katex-html`. KaTeX
  // clips from its own stylesheet, and `style-snapshot.ts` stops its walk at the
  // `.katex` above — so on a live page neither attribute reaches this element,
  // and it is a page that inlines the CSS, or a library caller handed one, that
  // meets the defect.
  const katex = (attrs: string) =>
    '<p>x <span class="katex">' +
    `<span class="katex-mathml"${attrs}><math><semantics><mrow><mi>E</mi></mrow>` +
    '<annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span>' +
    '<span class="katex-html" aria-hidden="true">E=mc²</span></span> y</p>';

  // Live markup from Mass–energy equivalence. The a11y span holds the `<math>`
  // alone and the drawing is its sibling; `style="display: none"` is in the
  // served HTML and the stylesheet overrules it with `display:inline !important`,
  // so what really hides it is the clip — which only a computed style can state.
  // Both halves have to be survived: the attribute is all a library caller reads,
  // and the snapshot answers over it without ever mentioning `display`.
  const wikipedia = (attrs: string) =>
    '<p>x <span class="mwe-math-element mwe-math-element-inline">' +
    '<a href="/w/index.php?title=Special:MathWikibase&amp;qid=Q35875" style="color:inherit;">' +
    `<span class="mwe-math-mathml-inline mwe-math-mathml-a11y"${attrs}>` +
    '<math alttext="{\\displaystyle E=mc^{2}}"><semantics><mrow><mi>E</mi></mrow>' +
    '<annotation encoding="application/x-tex">{\\displaystyle E=mc^{2}}</annotation>' +
    '</semantics></math></span>' +
    '<img src="https://wikimedia.org/api/rest_v1/media/math/render/svg/9f73" ' +
    'class="mwe-math-fallback-image-inline" aria-hidden="true" ' +
    'alt="{\\displaystyle E=mc^{2}}"></a></span> y</p>';

  // MathJax v3 appends `<mjx-assistive-mml>` to the container, marks the drawing
  // `aria-hidden` and serializes the MathML with its TeX annotation. Its own
  // stylesheet clips to `rect(1px,1px,1px,1px)` with `width:auto` — no zero side
  // and no pinhole, so the live shape never tripped this. A snapshot of a
  // narrower box, or a page writing the plain idiom, does.
  const mathjax3 = (attrs: string) =>
    '<p>x <mjx-container class="MathJax" jax="CHTML" style="position: relative;">' +
    '<mjx-math aria-hidden="true">E=mc2</mjx-math>' +
    `<mjx-assistive-mml unselectable="on" display="inline"${attrs}>` +
    '<math><semantics><mrow><mi>E</mi></mrow>' +
    '<annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math>' +
    '</mjx-assistive-mml></mjx-container> y</p>';

  const shapes: Array<[string, string, string]> = [
    ['KaTeX, style attribute', katex(` style="${SR_ONLY}"`), 'E=mc^2'],
    ['KaTeX, snapshot attribute', katex(` data-s2md-style="${SR_ONLY}"`), 'E=mc^2'],
    [
      'Wikipedia as served, style attribute',
      wikipedia(' style="display: none;"'),
      '{\\displaystyle E=mc^{2}}',
    ],
    [
      'Wikipedia captured, snapshot over the attribute',
      wikipedia(` style="display: none;" data-s2md-style="${PINHOLE}"`),
      '{\\displaystyle E=mc^{2}}',
    ],
    ['MathJax v3, style attribute', mathjax3(` style="${SR_ONLY}"`), 'E=mc^2'],
    ['MathJax v3, snapshot attribute', mathjax3(` data-s2md-style="${PINHOLE}"`), 'E=mc^2'],
  ];

  it.each(shapes)('keeps the carrier: %s', (_name, html, latex) => {
    expect(latexOf(sanitized(html))).toBe(latex);
  });

  // The exemption belongs to the maths option, not to the sanitizer: with `math`
  // off no rule would read the carrier, and keeping it would only put the
  // MathML's own glyphs into the file as prose nobody was shown.
  it.each(shapes)('with math off it goes as it always did: %s', (_name, html) => {
    expect(latexOf(sanitized(html, false))).toBeUndefined();
  });

  it('a formula the page hid whole still goes', () => {
    const doc = sanitized(`<div style="display:none">${katex('')}</div><p>after</p>`);
    expect(latexOf(doc)).toBeUndefined();
    expect(bodyText(doc)).toBe('after');
  });

  // The twin is the witness, and it is what makes this a statement about the
  // carrier rather than about the formula. A box holding the carrier *and* the
  // drawing is a whole formula: hiding it hid what the reader would have seen, so
  // it goes. The same box holding the carrier alone is the wrapper a renderer put
  // round it, and its invisibility is the design.
  it('a hidden box holding the drawing as well as the carrier still goes', () => {
    const doc = sanitized(
      `<p>x <span class="katex" style="${SR_ONLY}">` +
        '<span class="katex-mathml"><math><semantics>' +
        '<annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span>' +
        '<span class="katex-html" aria-hidden="true">E=mc²</span></span> y</p>',
    );
    expect(latexOf(doc)).toBeUndefined();
    expect(bodyText(doc)).toBe('x  y');
  });

  it('an ordinary .sr-only paragraph beside a formula still goes', () => {
    const doc = sanitized(`<p style="${SR_ONLY}">Skip to main content</p>${katex('')}`);
    expect(bodyText(doc)).not.toContain('Skip to main content');
    expect(latexOf(doc)).toBe('E=mc^2');
  });

  // A carrier is what a rule can read a formula *out of*, not whatever is spelled
  // in MathML. MathJax v2's assistive MathML carries no TeX — `toMathML` writes
  // an `<annotation>` only under `menuSettings.semantics`, which is off by
  // default — and the LaTeX sits in the `<script type="math/tex">` beside the
  // frame, which converts already. Keeping that twin put a second copy of the
  // same formula in the file: `$E = m c^{2}$$E=mc^2$` where one was shown.
  it('MathML no rule can read a formula out of is not a carrier', () => {
    const doc = sanitized(
      `<p>x <span class="MathJax"><span class="MJX_Assistive_MathML" style="${PINHOLE}">` +
        '<math><semantics><mrow><mi>E</mi></mrow></semantics></math></span></span>' +
        '<script type="math/tex">E=mc^2</script> y</p>',
    );
    expect((doc.body as Element).querySelector('math')).toBeNull();
    expect((doc.body as Element).querySelector('script')?.textContent).toBe('E=mc^2');
  });
});

// A blank inside a `<span>` is the space between two words, and it went to the
// same place an empty wrapper did. Every syntax highlighter writes indentation
// that way — `<span class="w">  </span>` is Pygments' spelling — so the removal
// reached every highlighted code block on the web: an mkdocs YAML sample came
// back flush left with `anchor_linenums:true`, and a Python one as
// `importtensorflowastf`. Off a code block it welded plain words together.
describe('a wrapper holding blanks is not an empty wrapper', () => {
  const sanitized = (html: string): Document => {
    const doc = makeDoc(html);
    sanitize(doc.body as Element, 'full');
    return doc;
  };

  it('keeps the indentation a highlighter put in a span', () => {
    const doc = sanitized(
      '<pre><code><span>a</span><span>:</span>\n<span>  </span><span>-</span><span> </span><span>b</span></code></pre>',
    );
    expect(bodyText(doc)).toBe('a:\n  - b');
  });

  it('keeps the blank a span holds between two words', () => {
    const doc = sanitized('<p>one<span>  </span>two</p>');
    expect(bodyText(doc)).toBe('one two');
  });

  it('unwraps rather than keeps: the span itself is gone', () => {
    const doc = sanitized('<p>one<span> </span>two</p>');
    expect(bodyHTML(doc)).not.toContain('<span');
  });

  it('still removes a wrapper holding nothing at all', () => {
    const doc = sanitized('<p>x<span></span>y</p>');
    expect(bodyText(doc)).toBe('xy');
  });

  it('a block wrapper of blanks stays a boundary, not a space', () => {
    const doc = sanitized('<div><p>a</p><div> </div><p>b</p></div>');
    expect(bodyHTML(doc)).not.toContain('<div> </div>');
    expect(bodyText(doc)).toBe('ab');
  });
});

// The one hiding no style declares: the browser draws a closed `<details>` body
// away behind `::details-content`, so the markup and a computed style taken off
// live nodes both describe a visible box, and only the missing `open` attribute
// says otherwise. MDN folds its whole sidebar that way — a 2,655-word article
// came back carrying 500 words of collapsed property lists.
describe('a closed <details> shows its summary and nothing else', () => {
  const sanitized = (html: string): Document => {
    const doc = makeDoc(html);
    sanitize(doc.body as Element, 'full');
    return doc;
  };

  it('drops the body of a closed one', () => {
    const doc = sanitized('<details><summary>Show more</summary><p>folded away</p></details>');
    expect(bodyText(doc)).toBe('Show more');
  });

  it('keeps the body of an open one', () => {
    const doc = sanitized('<details open><summary>Show more</summary><p>on screen</p></details>');
    expect(bodyText(doc)).toContain('on screen');
  });

  it('drops everything when a closed one has no summary', () => {
    const doc = sanitized('<details><p>folded away</p></details>');
    expect(bodyText(doc).trim()).toBe('');
  });

  it('a nested open one goes with the closed parent that hides it', () => {
    const doc = sanitized(
      '<details><summary>A</summary><details open><summary>B</summary><p>x</p></details></details>',
    );
    expect(bodyText(doc)).toBe('A');
  });
});

// Пустая инлайновая обёртка становится текстовым узлом, и схлопнуть его по шву
// `collapseWhitespace` уже не может: он читает каждый узел отдельно, а
// `normalize()` сливает их позже. `<p>one <span> </span> two</p>` приезжало
// тремя пробелами — на экране один, а в панели исходника три, и правит человек
// именно её.
describe('пустая обёртка на шве', () => {
  const md = (html: string) => toMarkdown(html).trim();

  it('не добавляет второго пробела к соседскому', () => {
    expect(md('<p>one <span> </span> two</p>')).toBe('one  two');
  });

  it('без соседского пробела остаётся сам', () => {
    expect(md('<p>one<span> </span>two</p>')).toBe('one two');
  });

  // Внутри сохранённых пробелов ничего не схлопывается: там пустая обёртка —
  // это отступ, который подсветка синтаксиса завернула в span.
  it('отступ в коде цел', () => {
    expect(md('<pre><code>a:<br><span class="w">  </span>b: 1</code></pre>')).toContain('  b: 1');
  });
});
