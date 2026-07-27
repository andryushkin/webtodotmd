// What a stylesheet says, and what the snapshot is allowed to write down for it.
//
// The two failures this file is built around point in opposite directions and
// only one of them is visible in the output. Text a class hid — `.sr-only`, an
// off-screen skip link — arrives in the file as ordinary prose, which a reader
// notices. A mark written where the page showed none arrives as asterisks inside
// a heading, which a reader also notices. Between them sits the expensive
// mistake: text a person *did* see, deleted because a threshold was set where a
// layout could land.
//
// There is no browser here, so `getComputedStyle` is replaced by a small cascade
// of its own — inheritance, a UA sheet, class rules, the inline attribute. That
// is enough to state every case in the terms a page states them in, and the
// snapshot module cannot tell the difference: it asks for a property and is told
// a value, which is the entire seam.
import { describe, it, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { toMarkdown } from '../../../core/src/browser';
import { SNAPSHOT_ATTR } from '../../../core/src/utils/inline-style';
import { computedStyleIn, snapshotScope, snapshotStyles, type ComputedStyleOf } from '../style-snapshot';

type Declarations = Record<string, string>;

// The properties a child takes from its parent when nothing else speaks.
const INHERITED = ['font-weight', 'font-style', 'visibility', 'text-indent', 'text-align'];

// Everything a computed style always has a value for.
const INITIAL: Declarations = {
  display: 'inline',
  visibility: 'visible',
  opacity: '1',
  'font-weight': '400',
  'font-style': 'normal',
  'text-decoration-line': 'none',
  'text-align': 'start',
  'text-indent': '0px',
  position: 'static',
  left: 'auto',
  top: 'auto',
  width: 'auto',
  height: 'auto',
  overflow: 'visible',
  clip: 'auto',
  'clip-path': 'none',
  'animation-name': 'none',
  'transition-duration': '0s',
  'transition-property': 'all',
  // Every element answers these, whether or not it lays anything out — and a
  // grid answers the second with its *used* tracks once it has been laid out,
  // which is how many columns wide it ended up.
  'flex-direction': 'row',
  'grid-template-columns': 'none',
};

// The part of the UA stylesheet that touches anything read here.
const BLOCK = { display: 'block' };
const UA: Record<string, Declarations> = {
  html: BLOCK, body: BLOCK, div: BLOCK, p: BLOCK, section: BLOCK, article: BLOCK,
  header: BLOCK, footer: BLOCK, nav: BLOCK, main: BLOCK, aside: BLOCK, figure: BLOCK,
  figcaption: BLOCK, blockquote: { ...BLOCK }, ul: BLOCK, ol: BLOCK, dl: BLOCK,
  dt: BLOCK, dd: BLOCK, pre: BLOCK, hr: BLOCK, form: BLOCK,
  li: { display: 'list-item' },
  table: { display: 'table' },
  thead: { display: 'table-header-group' },
  tbody: { display: 'table-row-group' },
  tr: { display: 'table-row' },
  td: { display: 'table-cell' },
  // Centred, as every UA stylesheet centres a header cell — the value the
  // snapshot has to recognise as the tag's rather than the page's.
  th: { display: 'table-cell', 'font-weight': '700', 'text-align': 'center' },
  caption: { ...BLOCK, 'text-align': 'center' },
  h1: { ...BLOCK, 'font-weight': '700' }, h2: { ...BLOCK, 'font-weight': '700' },
  h3: { ...BLOCK, 'font-weight': '700' }, h4: { ...BLOCK, 'font-weight': '700' },
  h5: { ...BLOCK, 'font-weight': '700' }, h6: { ...BLOCK, 'font-weight': '700' },
  b: { 'font-weight': '700' }, strong: { 'font-weight': '700' },
  i: { 'font-style': 'italic' }, em: { 'font-style': 'italic' },
  cite: { 'font-style': 'italic' }, address: { ...BLOCK, 'font-style': 'italic' },
  del: { 'text-decoration-line': 'line-through' },
  s: { 'text-decoration-line': 'line-through' },
  strike: { 'text-decoration-line': 'line-through' },
  a: { 'text-decoration-line': 'underline' },
  u: { 'text-decoration-line': 'underline' },
};

function inlineDeclarations(el: Element): Declarations {
  const out: Declarations = {};
  for (const part of (el.getAttribute('style') ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) out[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
  }
  return out;
}

/**
 * A cascade small enough to read and large enough to state a real page in.
 * `rules` is keyed by class name, which is how every framework in the brief
 * writes the styles this stage exists to see.
 *
 * `!important` is here for one reason: it is the only way a stylesheet can beat
 * what the page wrote in the element's own `style` attribute, and that gap —
 * where the attribute says one thing and the reader saw another — is what the
 * snapshot has to be able to state.
 */
function styleEngine(rules: Record<string, Declarations> = {}): ComputedStyleOf {
  const cache = new WeakMap<Element, Declarations>();
  const resolve = (el: Element): Declarations => {
    const hit = cache.get(el);
    if (hit) return hit;
    const parent = el.parentElement;
    const own: Declarations = { ...INITIAL };
    const important: Declarations = {};
    if (parent) {
      const above = resolve(parent);
      for (const property of INHERITED) own[property] = above[property]!;
    }
    Object.assign(own, UA[el.tagName.toLowerCase()] ?? {});
    for (const name of Array.from(el.classList)) {
      for (const [property, value] of Object.entries(rules[name] ?? {})) {
        const forced = /\s*!important$/.test(value);
        if (forced) important[property] = value.replace(/\s*!important$/, '');
        own[property] = forced ? important[property]! : value;
      }
    }
    Object.assign(own, inlineDeclarations(el));
    Object.assign(own, important);
    cache.set(el, own);
    return own;
  };
  return (el) => {
    const declarations = resolve(el);
    return (property) => declarations[property];
  };
}

function page(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

/** The snapshot as the test wants to read it: tag → what was written on it. */
function marks(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of Array.from(doc.querySelectorAll(`[${SNAPSHOT_ATTR}]`))) {
    const key = el.getAttribute('data-name') ?? el.tagName.toLowerCase();
    out[key] = el.getAttribute(SNAPSHOT_ATTR)!;
  }
  return out;
}

function snapshot(html: string, rules: Record<string, Declarations> = {}) {
  const doc = page(html);
  const restore = snapshotStyles([doc.body], styleEngine(rules));
  return { doc, restore, written: marks(doc) };
}

/** What the whole page converts to, with the stylesheet read and without it. */
function convert(html: string, rules: Record<string, Declarations> = {}) {
  const before = toMarkdown(page(html).body).trim();
  const doc = page(html);
  const restore = snapshotStyles([doc.body], styleEngine(rules));
  const after = toMarkdown(doc.body).trim();
  restore();
  return { before, after };
}

// The stylesheet every case below is written against: Tailwind's names, because
// they are the ones a captured page actually carries.
const TAILWIND: Record<string, Declarations> = {
  'font-bold': { 'font-weight': '700' },
  'font-semibold': { 'font-weight': '600' },
  'font-medium': { 'font-weight': '500' },
  'font-normal': { 'font-weight': '400' },
  italic: { 'font-style': 'italic' },
  'not-italic': { 'font-style': 'normal' },
  'line-through': { 'text-decoration-line': 'line-through' },
  'no-underline': { 'text-decoration-line': 'none' },
  block: { display: 'block' },
  inline: { display: 'inline' },
  flex: { display: 'flex' },
  hidden: { display: 'none' },
  invisible: { visibility: 'hidden' },
  'opacity-0': { opacity: '0' },
  'sr-only': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0px, 0px, 0px, 0px)',
  },
  'visually-hidden': { 'clip-path': 'inset(50%)', position: 'absolute' },
  'offscreen': { position: 'absolute', left: '-9999px' },
  'ir': { 'text-indent': '-9999px' },
  'text-right': { 'text-align': 'right' },
  'text-center': { 'text-align': 'center' },
  'text-left': { 'text-align': 'left' },
};

describe('what the snapshot writes down', () => {
  it('a class that adds weight', () => {
    const { written } = snapshot('<p>a <span class="font-bold">b</span></p>', TAILWIND);
    expect(written).toEqual({ span: 'font-weight:700' });
  });

  it('semibold counts, medium does not', () => {
    expect(snapshot('<p><span class="font-semibold">b</span></p>', TAILWIND).written)
      .toEqual({ span: 'font-weight:600' });
    expect(snapshot('<p><span class="font-medium">b</span></p>', TAILWIND).written).toEqual({});
  });

  // The rule stage one turned on, restated against a stylesheet: what is worth
  // recording is a change of face, never a large number.
  it('a run inside a heading inherits the heading and says nothing', () => {
    expect(snapshot('<h2>a <span>b</span></h2>', TAILWIND).written).toEqual({});
    expect(snapshot('<h2>a <span class="font-bold">b</span></h2>', TAILWIND).written).toEqual({});
  });

  it('a heading and a table header say nothing about their own weight', () => {
    const html = '<h2>t</h2><table><tr><th>H</th></tr><tr><td>v</td></tr></table>';
    expect(snapshot(html, TAILWIND).written).toEqual({});
  });

  it('a strong says nothing, and a strong told to be light says so', () => {
    expect(snapshot('<p><strong>x</strong></p>', TAILWIND).written).toEqual({});
    expect(snapshot('<p><strong class="font-normal">x</strong></p>', TAILWIND).written)
      .toEqual({ strong: 'font-weight:400' });
  });

  // A theme that resets headings to body weight is ordinary, and the run inside
  // one that is bold again is then genuinely bolder than its heading.
  it('a heading reset to body weight lets a bold run inside it be bold', () => {
    const rules = { ...TAILWIND, heading: { 'font-weight': '400' } };
    const { written } = snapshot('<h2 class="heading">a <span class="font-bold">b</span></h2>', rules);
    expect(written).toEqual({ h2: 'font-weight:400', span: 'font-weight:700' });
  });

  it('italic from a class, and an em told not to slant', () => {
    expect(snapshot('<p><span class="italic">x</span></p>', TAILWIND).written)
      .toEqual({ span: 'font-style:italic' });
    expect(snapshot('<p><em class="not-italic">x</em></p>', TAILWIND).written)
      .toEqual({ em: 'font-style:normal' });
  });

  // A line through a box is painted over everything inside it while the computed
  // value of every child still reads `none`. Measuring strikethrough against the
  // ancestry would put a denial on every one of them.
  it('a struck box does not make its children deny the line', () => {
    expect(snapshot('<p><del>a <span>b</span></del></p>', TAILWIND).written).toEqual({});
    expect(snapshot('<p><span class="line-through">x</span></p>', TAILWIND).written)
      .toEqual({ span: 'text-decoration-line:line-through' });
  });

  it('an underline is not a strikethrough', () => {
    expect(snapshot('<p><a href="#">x</a> <u>y</u></p>', TAILWIND).written).toEqual({});
  });

  it('display is recorded only where it changes the line', () => {
    expect(snapshot('<p><span class="block">x</span></p>', TAILWIND).written)
      .toEqual({ span: 'display:block' });
    expect(snapshot('<p><span class="flex">x</span></p>', TAILWIND).written)
      .toEqual({ span: 'display:block' });
    expect(snapshot('<div class="inline">x</div>', TAILWIND).written)
      .toEqual({ div: 'display:inline' });
    // A cell, a list item and a flex container are already what their tag says.
    expect(snapshot('<div class="flex"><ul><li>x</li></ul></div>', TAILWIND).written).toEqual({});
  });

  // A highlighted code block is one `<span>` per token and not one of them can
  // carry a mark, so the walk stops at the fence — but the fence itself is still
  // judged, because a hidden code sample is hidden like anything else.
  it('does not walk into code, and still sees a hidden block', () => {
    const rules = { ...TAILWIND, tok: { 'font-weight': '700' } };
    expect(snapshot('<pre><code><span class="tok">let</span> x</code></pre>', rules).written)
      .toEqual({});
    expect(snapshot('<pre class="hidden"><code>x</code></pre>', rules).written)
      .toEqual({ pre: 'display:none' });
  });

  it('marks combine on one element', () => {
    const { written } = snapshot(
      '<p><span class="font-bold italic line-through">x</span></p>',
      TAILWIND,
    );
    expect(written.span).toBe('font-weight:700;font-style:italic;text-decoration-line:line-through');
  });
});

// A row of links is one line on screen, and it used to arrive as one paragraph
// per link. CSS *blockifies* the children of a flex or grid container — an `<a>`
// in a `<nav style="display:flex">` computes `display:block` with nothing in the
// page having said so — and the snapshot wrote that down as if the page had.
//
// The cascade below is where that is stated, and it has to be stated: every item
// class here carries the `display:block` Chrome really computes for it, measured
// on each container with a headless browser one element at a time. A test that
// left the items reading `inline` would prove something about happy-dom, which
// blockifies nothing, and nothing at all about the defect.
describe('flex blockification: a row of items is not a paragraph each', () => {
  const CHROME: Record<string, Declarations> = {
    ...TAILWIND,
    row: { display: 'flex' },
    'row-reverse': { display: 'flex', 'flex-direction': 'row-reverse' },
    column: { display: 'flex', 'flex-direction': 'column' },
    'inline-row': { display: 'inline-flex' },
    // Three columns, as the used value comes back from a grid that has been laid
    // out: `repeat(3, 1fr)` in the stylesheet, three lengths in the computed
    // style.
    'grid-row': { display: 'grid', 'grid-template-columns': '246px 246px 246px' },
    // And the single column a grid falls back to when nothing states one, which
    // stacks its items exactly as a flex column does.
    'grid-column': { display: 'grid', 'grid-template-columns': '740px' },
    passthrough: { display: 'contents' },
    // What the container derived, not what the page wrote — and there is no
    // telling the two apart from here, which is the whole difficulty.
    item: { display: 'block' },
  };

  it('a link in a flex row says nothing about its box', () => {
    const html =
      '<nav class="row"><a href="#blocks" class="item">Blocks</a>' +
      '<a href="#inline" class="item">Inline</a></nav>';
    expect(snapshot(html, CHROME).written).toEqual({});
  });

  it('a link in a grid row, and in an inline-flex one', () => {
    expect(snapshot('<div class="grid-row"><a class="item">x</a></div>', CHROME).written)
      .toEqual({});
    expect(snapshot('<span class="inline-row"><a class="item">x</a></span>', CHROME).written)
      .toEqual({});
    expect(snapshot('<div class="row-reverse"><a class="item">x</a></div>', CHROME).written)
      .toEqual({});
  });

  // The reproduction, end to end: the toolbar shape a page's furniture is made
  // of — a chip row, a tag list, a nav — and the file it used to produce.
  it('the row comes back as the line it was', () => {
    const html =
      '<div class="row"><a href="/a" class="item">Blocks</a> ' +
      '<a href="/b" class="item">Inline</a> <a href="/c" class="item">CSS</a></div>';
    const { after } = convert(html, CHROME);
    expect(after).toBe('[Blocks](/a) [Inline](/b) [CSS](/c)');
  });

  // The other direction, and the shape that argues for keeping the mark: a
  // column stacks its items, so there the blockification and the screen agree
  // and the mark is the only thing that keeps the lines apart.
  it('a flex column keeps the line each item was on', () => {
    const html =
      '<div class="column"><span class="item" data-name="one">Decision</span>' +
      '<span class="item" data-name="two">Ship on Friday</span></div>';
    expect(snapshot(html, CHROME).written)
      .toEqual({ one: 'display:block', two: 'display:block' });
    expect(convert(html, CHROME).after).toBe('Decision\n\nShip on Friday');
  });

  it('a grid one column wide stacks, and says so', () => {
    expect(snapshot('<div class="grid-column"><span class="item">x</span></div>', CHROME).written)
      .toEqual({ span: 'display:block' });
    // A grid whose tracks say nothing — `none`, which is what a grid that has
    // not been laid out answers — counts as the one column it falls back to,
    // which is the answer that leaves the mark where it already was.
    expect(snapshot('<div class="grid-untracked"><span class="item">x</span></div>', {
      ...CHROME, 'grid-untracked': { display: 'grid' },
    }).written).toEqual({ span: 'display:block' });
  });

  // A `display:contents` box generates no box at all, so the items of the row
  // are its children rather than it — Chrome blockifies them from two levels up.
  it('a wrapper that generates no box hands the row on', () => {
    const html = '<div class="row"><span class="passthrough"><a class="item">x</a></span></div>';
    expect(snapshot(html, CHROME).written).toEqual({});
  });

  // A selection that starts on one chip is a capture whose root is a row item,
  // and the parent it has to ask about is outside the fragment the core will
  // read. This is the only place the answer can be had.
  it('a capture rooted on one item of a row asks the row', () => {
    const doc = page('<div class="row"><a class="item">x</a></div>');
    const link = doc.querySelector('a')!;
    const restore = snapshotStyles([link], styleEngine(CHROME));
    expect(link.hasAttribute(SNAPSHOT_ATTR)).toBe(false);
    restore();
  });

  it('a flex container is still a line of its own, wherever it sits', () => {
    // In ordinary flow the container states its own box, as it always did.
    expect(snapshot('<p><span class="row">x</span></p>', CHROME).written)
      .toEqual({ span: 'display:block' });
    // Inside a row it is an item like any other, and the row is what the reader
    // saw: `inline-flex` on an item computes `flex`, which is the same box.
    const nested = '<div class="row"><span class="row" data-name="inner">x</span></div>';
    expect(snapshot(nested, CHROME).written).toEqual({});
  });

  // Nothing else about the branch moves: a `<span>` told to be a block in
  // ordinary flow, and a `<p>` declining the block its tag gives it.
  it('an ordinary block and an ordinary inline still say what they are', () => {
    expect(snapshot('<p><span class="block">x</span></p>', CHROME).written)
      .toEqual({ span: 'display:block' });
    expect(snapshot('<div><p class="inline">x</p></div>', CHROME).written)
      .toEqual({ p: 'display:inline' });
  });

  // A block tag in a row was never marked and is not newly broken: its own tag
  // is what puts it on a line, and no snapshot of a computed style can take that
  // back without inventing an `inline` nothing computed.
  it('a block element in a row is neither marked nor changed', () => {
    const html = '<div class="row"><div class="item">one</div><div class="item">two</div></div>';
    const { before, after } = convert(html, CHROME);
    expect(snapshot(html, CHROME).written).toEqual({});
    expect(after).toBe(before);
    expect(after).toBe('one\n\ntwo');
  });

  // The page's own attribute is not touched by any of this: the core reads it
  // wherever the snapshot is silent, so a break the page really states survives
  // — which is also the whole of what dropping the derived one costs.
  it("a break the page writes itself is still the page's", () => {
    const html = '<div class="row"><a style="display:block">one</a><a class="item">two</a></div>';
    expect(snapshot(html, CHROME).written).toEqual({});
    expect(convert(html, CHROME).after).toBe('one\n\ntwo');
  });

  // Only the box is dropped. Everything else a row item says about itself is
  // said exactly as before — the branch is one line of the walk, not the walk.
  it('the rest of what a row item states is untouched', () => {
    const html =
      '<div class="row"><span class="item font-bold" data-name="chip">Sale</span>' +
      '<span class="item sr-only" data-name="hidden">Skip</span></div>';
    const { written } = snapshot(html, CHROME);
    expect(written.chip).toBe('font-weight:700');
    expect(written.hidden).toContain('clip:');
    expect(convert(html, CHROME).after).toBe('**Sale**');
  });
});

describe('text nobody could see', () => {
  it.each([
    ['sr-only', 'clip'],
    ['visually-hidden', 'clip-path'],
    ['offscreen', 'left'],
    ['ir', 'text-indent'],
  ])('%s is recorded', (className, property) => {
    const { written } = snapshot(`<p><span class="${className}">x</span></p>`, TAILWIND);
    expect(written.span).toContain(`${property}:`);
  });

  it('display:none is one mark, not one per element under it', () => {
    const { written } = snapshot(
      '<div class="hidden"><p><span class="font-bold">x</span></p></div>',
      TAILWIND,
    );
    expect(written).toEqual({ div: 'display:none' });
  });

  // The expensive mistake, guarded from both sides: a section waiting to be
  // animated in is not a section that was withheld.
  it('opacity:0 is hidden, unless something is about to fade it in', () => {
    expect(snapshot('<p class="opacity-0">x</p>', TAILWIND).written).toEqual({ p: 'opacity:0' });
    const revealing = {
      ...TAILWIND,
      reveal: { opacity: '0', 'transition-duration': '0.4s', 'transition-property': 'opacity' },
      animating: { opacity: '0', 'animation-name': 'fade-in' },
    };
    expect(snapshot('<p class="reveal">x</p>', revealing).written).toEqual({});
    expect(snapshot('<p class="animating">x</p>', revealing).written).toEqual({});
  });

  // `visibility` is the one of these a child can undo, and the sanitizer deletes
  // an element with its whole subtree — so a box above a visible descendant is
  // kept rather than left to remove text the reader was looking at, and says at
  // both ends what it is: invisible itself, visible where the descendant took
  // the property back.
  it('visibility:hidden over a visible descendant is stated, not retracted', () => {
    const rules = { ...TAILWIND, shown: { visibility: 'visible' } };
    expect(snapshot('<div class="invisible"><p>x</p></div>', rules).written)
      .toEqual({ div: 'visibility:hidden' });
    const revealed = snapshot('<div class="invisible"><p class="shown">x</p></div>', rules);
    expect(revealed.written).toEqual({ div: 'visibility:hidden', p: 'visibility:visible' });
  });

  // The box's own claim now covers only the text it holds directly, so the
  // branch that really is hidden goes on speaking for itself — and that mark is
  // all there is wherever a selection cut the box above out of the fragment.
  it('a hidden sibling of a revealed one marks itself', () => {
    const rules = { ...TAILWIND, shown: { visibility: 'visible' } };
    const doc = page('<div class="invisible"><p class="shown" data-name="seen">a</p><p data-name="unseen">b</p></div>');
    snapshotStyles([doc.body], styleEngine(rules));
    expect(marks(doc))
      .toEqual({ div: 'visibility:hidden', seen: 'visibility:visible', unseen: 'visibility:hidden' });
    expect(toMarkdown(doc.body).trim()).toBe('a');
  });

  // And the same page written the other way round. The decision cannot be made
  // on the way down — when the hidden sibling is read, nothing yet says the
  // ancestor's claim will be taken back — so it is made on the way out, where
  // the answer is known. Read in document order it used to keep both.
  it('the hidden sibling marks itself whichever way round they are', () => {
    const rules = { ...TAILWIND, shown: { visibility: 'visible' } };
    const doc = page('<div class="invisible"><p data-name="unseen">b</p><p class="shown" data-name="seen">a</p></div>');
    snapshotStyles([doc.body], styleEngine(rules));
    expect(marks(doc))
      .toEqual({ div: 'visibility:hidden', seen: 'visibility:visible', unseen: 'visibility:hidden' });
    expect(toMarkdown(doc.body).trim()).toBe('a');
  });

  it('a hidden branch several levels down still marks its own top', () => {
    const rules = { ...TAILWIND, shown: { visibility: 'visible' } };
    const doc = page(
      '<div class="invisible">' +
        '<section data-name="branch"><p>b</p><span>c</span></section>' +
        '<p class="shown" data-name="seen">a</p>' +
        '</div>',
    );
    snapshotStyles([doc.body], styleEngine(rules));
    expect(marks(doc))
      .toEqual({ div: 'visibility:hidden', branch: 'visibility:hidden', seen: 'visibility:visible' });
    expect(toMarkdown(doc.body).trim()).toBe('a');
  });

  // The attribute the page wrote itself is the one the core falls back on, and
  // the snapshot's silence cannot take it back: saying nothing here deleted the
  // `<div>` with the paragraph the page had just revealed inside it. What is
  // said is no longer a retraction but both ends of the same claim, and the
  // paragraph now survives on the child's mark rather than on the box's.
  it('a box the page hid in its own attribute is stated at both ends', () => {
    const rules = { ...TAILWIND, shown: { visibility: 'visible' } };
    const doc = page('<div style="visibility:hidden"><p class="shown">Read me</p></div>');
    const restore = snapshotStyles([doc.body], styleEngine(rules));
    expect(marks(doc)).toEqual({ div: 'visibility:hidden', p: 'visibility:visible' });
    expect(toMarkdown(doc.body).trim()).toBe('Read me');
    restore();
  });

  // The same hole from the other side: a stylesheet rule that beats the
  // attribute. The snapshot is the later word only where it speaks, so where the
  // cascade overruled the page's own `display:none` it has to speak.
  it('a hiding attribute the stylesheet overruled is answered', () => {
    const rules = { ...TAILWIND, forced: { display: 'block !important' } };
    const doc = page('<div style="display:none" class="forced">Read me</div>');
    const restore = snapshotStyles([doc.body], styleEngine(rules));
    expect(marks(doc).div).toContain('display:block');
    expect(toMarkdown(doc.body).trim()).toBe('Read me');
    restore();
  });

  // A reveal-on-scroll library writes the `opacity` on the element and leaves
  // the transition in its stylesheet, so neither half alone is the whole case.
  it('an opacity:0 the stylesheet is about to fade in keeps its text', () => {
    const rules = {
      ...TAILWIND,
      fade: { 'transition-duration': '0.4s', 'transition-property': 'opacity' },
    };
    const doc = page('<p style="opacity:0" class="fade">Read me</p>');
    const restore = snapshotStyles([doc.body], styleEngine(rules));
    expect(toMarkdown(doc.body).trim()).toBe('Read me');
    restore();
  });

  // The declarations exist to carry the verdict, and one too long to spell is
  // dropped on the way — so the set that travels is asked the question again,
  // and the shape is named when no set can answer it.
  it('a clipped element whose declarations cannot be carried still reads as hidden', () => {
    const rules = {
      ...TAILWIND,
      // Real in shape, and past the length a single declaration may take.
      wide: { 'clip-path': `inset(50% ${'0'.repeat(110)}px 50% 50%)`, position: 'absolute' },
    };
    const { written } = snapshot('<p><span class="wide">x</span></p>', rules);
    expect(written.span).toBe('clip:rect(0px, 0px, 0px, 0px)');
    const { after } = convert('<p><span class="wide">unseen</span>Read me</p>', rules);
    expect(after).toBe('Read me');
  });

  // The hiding joins what the element says about its face instead of standing in
  // for it, and the descendant that takes the property back says that alone.
  it('a hiding mark leaves the rest of the element standing', () => {
    const rules = { ...TAILWIND, shown: { visibility: 'visible' } };
    const { written } = snapshot(
      '<span class="invisible font-bold" data-name="box">' +
        '<span class="shown" data-name="leaf">x</span></span>',
      rules,
    );
    expect(written)
      .toEqual({ box: 'font-weight:700;visibility:hidden', leaf: 'visibility:visible' });
  });

  it('the text goes with the mark', () => {
    const { before, after } = convert('<p><span class="sr-only">Skip to content</span>Read me</p>', TAILWIND);
    expect(before).toBe('Skip to contentRead me');
    expect(after).toBe('Read me');
  });
});

// The box `visibility` can be taken back inside, read end to end rather than off
// the attributes: what the snapshot writes only matters as what the core then
// does with it, and the two halves of this claim are wrong in opposite
// directions on their own. The box marked alone is removed with the text it was
// kept for; the descendant marked alone leaves the box's own text in the file as
// prose nobody was shown, which is what the reader used to get.
describe('kept hidden box snapshot: what the reader could still see', () => {
  const REVEALING = { ...TAILWIND, shown: { visibility: 'visible' } };

  it('a class-hidden box keeps the child it was kept for, and loses its own text', () => {
    const html = '<div class="invisible">HIDDEN_TEXT<span class="shown">seen</span>ALSO_HIDDEN</div>';
    const { before, after } = convert(html, REVEALING);
    expect(before).toBe('HIDDEN_TEXTseenALSO_HIDDEN');
    expect(after).toBe('seen');
  });

  // The same page with the hiding in the page's own attribute and the cascade
  // agreeing with it. The core falls back on that attribute, so the box was
  // already removed whole here — the marks now keep the child and drop the text
  // around it, which is the same answer the class-hidden box gives.
  it('the same box hidden in its own attribute', () => {
    const html =
      '<div style="visibility:hidden">HIDDEN_TEXT<span class="shown">seen</span>ALSO_HIDDEN</div>';
    const { after } = convert(html, REVEALING);
    expect(after).toBe('seen');
  });

  // Whitespace the box holds directly is not text nobody saw: the box keeps its
  // width open, so the blank between two revealed runs was on the screen, and
  // taking it would weld them into one word.
  it('the blank between two revealed runs survives', () => {
    const html = '<div class="invisible"><span class="shown">one</span> <span class="shown">two</span></div>';
    expect(convert(html, REVEALING).after).toBe('one two');
  });

  // The mark the older `visibility:visible` case exists for, from the other
  // side: the attribute hides and the stylesheet overrules it, so nothing here
  // was hidden at all and every word of it stays.
  it('an attribute-hidden box the cascade overrules keeps everything', () => {
    const rules = { ...REVEALING, forced: { visibility: 'visible !important' } };
    const html =
      '<div style="visibility:hidden" class="forced">SEEN <span class="shown">seen</span> ALSO</div>';
    const { doc, restore, written } = snapshot(html, rules);
    expect(written).toEqual({ div: 'visibility:visible' });
    expect(toMarkdown(doc.body).trim()).toBe('SEEN seen ALSO');
    restore();
  });

  it('a box with nothing visible under it still goes whole, on one mark', () => {
    const html = '<div class="invisible">HIDDEN_TEXT<span>also hidden</span></div><p>Read me</p>';
    const { doc, restore, written } = snapshot(html, REVEALING);
    expect(written).toEqual({ div: 'visibility:hidden' });
    expect(toMarkdown(doc.body).trim()).toBe('Read me');
    restore();
  });

  // Two boxes deep, and still two marks: `visibility` inherits, so the inner box
  // is answered by the outer one's and writing it again would be a mark per
  // element on the way down to the leaf.
  it('a leaf revealed two hidden boxes down costs two marks', () => {
    const html =
      '<div class="invisible">OUTER' +
      '<section class="invisible">INNER<span class="shown">seen</span></section>' +
      '</div>';
    const { doc, restore, written } = snapshot(html, REVEALING);
    expect(written).toEqual({ div: 'visibility:hidden', span: 'visibility:visible' });
    expect(toMarkdown(doc.body).trim()).toBe('seen');
    restore();
  });

  // The ancestry answers for an element only where the core reads the ancestry.
  // An element whose own attribute claims `visible` is read from that attribute
  // instead, so silence there would hand the page's claim the last word over the
  // `!important` rule that beat it — and put the text back in the file.
  it('an element claiming visible against the cascade is answered', () => {
    const rules = { ...REVEALING, forced: { visibility: 'hidden !important' } };
    const html =
      '<div class="invisible">' +
      '<p style="visibility:visible" class="forced" data-name="liar">HIDDEN_TEXT' +
      '<span class="shown" data-name="leaf">Read me</span></p></div>';
    const { doc, restore, written } = snapshot(html, rules);
    expect(written)
      .toEqual({ div: 'visibility:hidden', liar: 'visibility:hidden', leaf: 'visibility:visible' });
    expect(toMarkdown(doc.body).trim()).toBe('Read me');
    restore();
  });
});

describe('the page is handed back as it was', () => {
  it('every attribute comes off again', () => {
    const html = '<p class="font-bold">a <span class="italic">b</span> <span class="sr-only">c</span></p>';
    const doc = page(html);
    const original = doc.body.innerHTML;
    const restore = snapshotStyles([doc.body], styleEngine(TAILWIND));
    expect(doc.body.innerHTML).not.toBe(original);
    restore();
    expect(doc.body.innerHTML).toBe(original);
  });

  // The page may own the name — the attribute is restored to its value, never
  // simply removed, exactly as the capture's other marks are.
  it("a page's own value survives being written over", () => {
    const doc = page(`<p ${SNAPSHOT_ATTR}="mine" class="font-bold">x</p>`);
    const restore = snapshotStyles([doc.body], styleEngine(TAILWIND));
    expect(doc.querySelector('p')!.getAttribute(SNAPSHOT_ATTR)).toBe('font-weight:700');
    restore();
    expect(doc.querySelector('p')!.getAttribute(SNAPSHOT_ATTR)).toBe('mine');
  });

  // And a page value on an element the walk had nothing to say about is taken
  // off for the length of the capture, so it cannot be read back as ours.
  it("a page's own value is not mistaken for a snapshot", () => {
    const doc = page(`<p ${SNAPSHOT_ATTR}="font-weight:900">x</p>`);
    const restore = snapshotStyles([doc.body], styleEngine(TAILWIND));
    expect(doc.querySelector('p')!.hasAttribute(SNAPSHOT_ATTR)).toBe(false);
    restore();
    expect(doc.querySelector('p')!.getAttribute(SNAPSHOT_ATTR)).toBe('font-weight:900');
  });

  it('overlapping roots are walked once', () => {
    const doc = page('<div id="outer"><p class="font-bold">x</p></div>');
    const outer = doc.querySelector('#outer')!;
    const inner = doc.querySelector('p')!;
    const original = doc.body.innerHTML;
    const restore = snapshotStyles([outer, inner], styleEngine(TAILWIND));
    restore();
    expect(doc.body.innerHTML).toBe(original);
  });
});

describe('how far the capture reaches', () => {
  const scopeOf = (html: string, select: string, inside = false): Element | null => {
    const doc = page(html);
    const target = doc.querySelector(select)!;
    const range = doc.createRange();
    // A selection is a pair of offsets in a text node far more often than it is
    // a whole element, and that is the case with no element of its own.
    if (inside) {
      const text = target.firstChild!;
      range.setStart(text, 0);
      range.setEnd(text, (text.textContent ?? '').length);
    } else {
      range.selectNodeContents(target);
    }
    return snapshotScope(range);
  };

  it('is the range\'s own common ancestor', () => {
    expect(scopeOf('<article><p id="a">one</p><p>two</p></article>', 'article')?.tagName.toLowerCase())
      .toBe('article');
  });

  it('is the element around a range that lives in a text node', () => {
    expect(scopeOf('<article><p id="a">one</p></article>', '#a', true)?.tagName.toLowerCase())
      .toBe('p');
  });

  // A selection inside a table is handed its header row back from above it
  // (`enrichRange`), so the styles the capture may read start at the table.
  it('is the whole table when the range is inside one', () => {
    const html = '<div><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="c">v</td></tr></tbody></table></div>';
    expect(scopeOf(html, '#c', true)?.tagName.toLowerCase()).toBe('table');
    expect(scopeOf(html, '#c')?.tagName.toLowerCase()).toBe('table');
  });

  // Nothing above the document has a style, and `captureStyles` filters the
  // null out — a capture with no styles read, rather than one that threw.
  it('is nothing when the range reaches past every element', () => {
    const doc = page('<p>x</p>');
    const range = doc.createRange();
    range.selectNode(doc.documentElement);
    expect(snapshotScope(range)).toBeNull();
  });

  // The seam to the browser, which every other test here replaces: a property
  // with no value is silence, and a value is lower-cased so that the two sides
  // spell the same declaration the same way.
  it('reads a live style through the core\'s lookup', () => {
    const read = computedStyleIn({
      getComputedStyle: () => ({
        getPropertyValue: (property: string) =>
          property === 'font-weight' ? '700' : property === 'display' ? 'BLOCK' : '',
      }),
    })({} as Element);
    expect(read('font-weight')).toBe('700');
    expect(read('display')).toBe('block');
    expect(read('visibility')).toBeUndefined();
  });
});

describe('which edge the text lines up against', () => {
  it('a column aligned by a class reaches the separator row', () => {
    const html = '<table><tr><th class="text-right">Sum</th></tr><tr><td>42</td></tr></table>';
    const { before, after } = convert(html, TAILWIND);
    expect(before).toContain('| --- |');
    expect(after).toContain('| --: |');
  });

  it.each([['text-right', 'right'], ['text-center', 'center']])(
    '%s is recorded',
    (className, value) => {
      const { written } = snapshot(`<p class="${className}">x</p>`, TAILWIND);
      expect(written).toEqual({ p: `text-align:${value}` });
    },
  );

  // `left` is what an unstyled element already computes, so the class saying it
  // states nothing — but the same class inside a right-aligned box does.
  it('left is a change only where the context is not already left', () => {
    expect(snapshot('<p class="text-left">x</p>', TAILWIND).written).toEqual({});
    const { written } = snapshot(
      '<div class="text-right"><p class="text-left" data-name="cell">x</p></div>',
      TAILWIND,
    );
    expect(written.cell).toBe('text-align:left');
  });

  // The tag's own centring, and a value a cell merely inherits, are both what
  // the page would have shown with no rule at all.
  it('says nothing for a header nobody aligned', () => {
    const html = '<table><tr><th>H</th></tr><tr><td>v</td></tr></table>';
    expect(snapshot(html, TAILWIND).written).toEqual({});
  });

  it('says nothing on a child that only inherits the alignment', () => {
    const { written } = snapshot('<div class="text-right"><p>x</p></div>', TAILWIND);
    expect(written).toEqual({ div: 'text-align:right' });
  });
});

describe('shadow roots', () => {
  // The content script flattens a web component by copying `innerHTML`, which
  // carries attributes and nothing else — so a shadow tree that was never
  // snapshotted arrives with its styling gone for good.
  it('are walked, so a component keeps its formatting', () => {
    const window = new Window();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML = '<my-card></my-card>';
    const host = doc.querySelector('my-card')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>a <span class="font-bold">b</span></p>';

    const restore = snapshotStyles([doc.body], styleEngine(TAILWIND));
    expect(shadow.innerHTML).toContain(`${SNAPSHOT_ATTR}="font-weight:700"`);
    // The flattening the content script does, on the markup it would really see.
    expect(toMarkdown(shadow.innerHTML, { domAdapter: (html) => {
      const w = new Window();
      w.document.body.innerHTML = html;
      return w.document as unknown as Document;
    } }).trim()).toBe('a **b**');
    restore();
    expect(shadow.innerHTML).not.toContain(SNAPSHOT_ATTR);
  });
});

describe('what a captured page keeps that it used to lose', () => {
  it('a Tailwind article', () => {
    const html =
      '<article class="prose">' +
      '<h2 class="heading">Release notes</h2>' +
      '<p>The <span class="font-bold">import</span> step is now ' +
      '<span class="italic">optional</span>, and <span class="line-through">--legacy</span> is gone.</p>' +
      '<p><span class="sr-only">Note: </span>See the <a href="/docs" class="font-semibold">docs</a>.</p>' +
      '</article>';
    const rules = { ...TAILWIND, heading: { 'font-weight': '700' }, prose: {} };
    const { before, after } = convert(html, rules);
    expect(before).toBe(
      '## Release notes\n\nThe import step is now optional, and --legacy is gone.\n\n' +
        'Note: See the [docs](/docs).',
    );
    expect(after).toBe(
      '## Release notes\n\nThe **import** step is now _optional_, and ~~--legacy~~ is gone.\n\n' +
        'See the [**docs**](/docs).',
    );
  });

  // A Notion export states everything through classes on `<span>`s, so before
  // this stage every page of one converted to unbroken plain text.
  it('a Notion-shaped block', () => {
    const rules = {
      'notion-bold': { 'font-weight': '600' },
      'notion-italic': { 'font-style': 'italic' },
      'notion-strike': { 'text-decoration-line': 'line-through' },
      'notion-block': { display: 'block' },
    };
    const html =
      '<div><span class="notion-block"><span class="notion-bold">Decision</span></span>' +
      '<span class="notion-block">Ship <span class="notion-italic">on Friday</span>, ' +
      '<span class="notion-strike">not Monday</span></span></div>';
    const { before, after } = convert(html, rules);
    expect(before).toBe('DecisionShip on Friday, not Monday');
    expect(after).toBe('**Decision**\n\nShip _on Friday_, ~~not Monday~~');
  });
});
