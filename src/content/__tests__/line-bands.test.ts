// How many lines the reader saw, counted rather than derived.
//
// The defect this file is built around is a sentence that came back as three
// paragraphs: a mention on X sits in a box of its own, that box is an item of a
// flex row, and the row is the only reason the words share a line. Two separate
// things broke it — the `<a>` derives `display:block` from the single-item flex
// column around it, and the wrapper is a `<div>`, a block by tag — and neither is
// visible from the markup. What is visible from live nodes is the answer itself:
// a `Range` over the container hands back one rectangle per fragment the layout
// drew, and the whole of that content came back on one band.
//
// There is no layout engine here, so the rectangles are stated: `data-rects`
// holds `top,bottom[,width]` per fragment, in the order the page drew them. That
// is the entire seam — the snapshot asks where an element's content was drawn and
// is told, exactly as it asks for a computed property and is told.
//
// The style engine below blockifies, unlike the one in `style-snapshot.test.ts`,
// because blockification is half of what is being measured: without it the `<a>`
// alone in a column never computes the `block` the defect turns on.
import { describe, it, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { toMarkdown } from '../../../core/src/browser';
import { ONE_LINE_MARK, ROW_ATTR } from '../../../core/src/utils/inline-style';
import {
  NOTHING_MEASURED,
  contentRectsIn,
  snapshotStyles,
  type ComputedStyleOf,
  type ContentRectsOf,
  type DrawnRect,
} from '../style-snapshot';

type Declarations = Record<string, string>;

const INHERITED = ['font-weight', 'font-style', 'visibility', 'text-indent', 'text-align'];

const INITIAL: Declarations = {
  display: 'inline', visibility: 'visible', opacity: '1',
  'font-weight': '400', 'font-style': 'normal', 'text-decoration-line': 'none',
  'text-align': 'start', 'text-indent': '0px', position: 'static',
  left: 'auto', top: 'auto', width: 'auto', height: 'auto', overflow: 'visible',
  clip: 'auto', 'clip-path': 'none', 'animation-name': 'none',
  'transition-duration': '0s', 'transition-property': 'all',
  'flex-direction': 'row', 'grid-template-columns': 'none',
};

const BLOCK = { display: 'block' };
const UA: Record<string, Declarations> = {
  html: BLOCK, body: BLOCK, div: BLOCK, p: BLOCK, section: BLOCK, article: BLOCK,
  main: BLOCK, header: BLOCK, footer: BLOCK, nav: BLOCK, ul: BLOCK, ol: BLOCK,
  blockquote: BLOCK, figure: BLOCK, pre: BLOCK,
  li: { display: 'list-item' },
  h1: { ...BLOCK, 'font-weight': '700' }, h2: { ...BLOCK, 'font-weight': '700' },
  a: { 'text-decoration-line': 'underline' },
  b: { 'font-weight': '700' }, strong: { 'font-weight': '700' },
};

// The containers CSS blockifies, in the spellings a page writes.
const BLOCKIFIES = /(?:^|[\s-])(?:flex|grid)$/;

// What blockification does, which is not "everything becomes a block": CSS
// Display 3 maps each inline-level box onto its block-level equivalent and leaves
// the rest alone. A flex column inside a flex row is still a flex column — the
// whole shape of the defect rests on that, since the column is what stacks the
// item it holds and the item is what the snapshot then marks.
const BLOCKIFIED = new Map([
  ['inline', 'block'],
  ['inline-block', 'block'],
  ['inline-flex', 'flex'],
  ['inline-grid', 'grid'],
  ['inline-table', 'table'],
]);

function inlineDeclarations(el: Element): Declarations {
  const out: Declarations = {};
  for (const part of (el.getAttribute('style') ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) out[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
  }
  return out;
}

function styleEngine(): ComputedStyleOf {
  const cache = new WeakMap<Element, Declarations>();
  const resolve = (el: Element): Declarations => {
    const hit = cache.get(el);
    if (hit) return hit;
    const own: Declarations = { ...INITIAL };
    const parent = el.parentElement;
    if (parent) {
      const above = resolve(parent);
      for (const property of INHERITED) own[property] = above[property]!;
    }
    Object.assign(own, UA[el.tagName.toLowerCase()] ?? {});
    Object.assign(own, inlineDeclarations(el));
    // CSS Display 3's automatic box type transformation, and the reason the
    // defect exists: every in-flow item of a flex or grid container computes
    // `block`, whatever the page wrote or left unwritten. It runs after the
    // page's own declarations because that is where the cascade puts it.
    if (parent && BLOCKIFIES.test(resolve(parent).display ?? '')) {
      own.display = BLOCKIFIED.get(own.display!) ?? own.display!;
    }
    cache.set(el, own);
    return own;
  };
  return (el) => {
    const declarations = resolve(el);
    return (property) => declarations[property];
  };
}

/** What the page drew inside this element, as the test states it. */
const statedRects: ContentRectsOf = (el) => {
  const spec = el.getAttribute('data-rects');
  if (spec === null) return [];
  const out: DrawnRect[] = [];
  for (const part of spec.split(';')) {
    if (part === '') continue;
    const [top, bottom, width] = part.split(',').map(Number);
    out.push({ top: top!, bottom: bottom!, width: width ?? 10 });
  }
  return out;
};

function page(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

/** The file this page becomes, with the rectangles read and without them. */
function convert(html: string, rects: ContentRectsOf = statedRects): string {
  const doc = page(html);
  const restore = snapshotStyles([doc.body], styleEngine(), false, rects);
  const md = toMarkdown(doc.body).trim();
  restore();
  return md;
}

/** The same page with no layout engine behind it — every other caller. */
function unmeasured(html: string): string {
  return convert(html, NOTHING_MEASURED);
}

/** Every row mark the walk wrote, outermost first. */
function rowMarks(html: string): string[] {
  const doc = page(html);
  const restore = snapshotStyles([doc.body], styleEngine(), false, statedRects);
  const marks = Array.from(doc.querySelectorAll(`[${ROW_ATTR}]`)).map(
    (el) => el.getAttribute(ROW_ATTR)!,
  );
  restore();
  return marks;
}

// The shape of the defect, as the issue states it. One line, three fragments.
const MENTION =
  '<div style="display:flex;flex-direction:row" data-rects="0,16;0,16;0,16">' +
  '<span>Wow even</span>' +
  '<div style="display:flex;flex-direction:column" data-rects="0,16">' +
  '<a href="https://x.com/karpathy">@karpathy</a></div>' +
  '<span>admits he is 80% agentic coding now.</span></div>';

describe('content drawn on one band (theory C)', () => {
  describe('what counts as one band', () => {
    it('reads two sizes on one baseline as one line', () => {
      // A 30px title and a 12px date, baseline-aligned: two tops, two heights,
      // and the whole of the shorter one in common. An equal `top` would call
      // this two lines and part a byline into paragraphs.
      expect(
        rowMarks('<div style="display:flex" data-rects="0,30;16,28"><div>Title</div><div>Jul 27</div></div>'),
      ).toEqual([ONE_LINE_MARK]);
    });

    it('reads two lines of the same text as two', () => {
      expect(
        rowMarks('<div style="display:flex" data-rects="0,16;20,36"><div>a</div><div>b</div></div>'),
      ).toEqual(['1']);
    });

    it('does not let a tall picture fuse the lines beside it', () => {
      // The rectangle of a 100px image overlaps every one of the five line boxes
      // next to it. Chained pairwise, that is one band and a paragraph welded
      // onto a picture; against the running intersection the second line is
      // asked about the first, and the answer is the five lines the reader read.
      expect(
        rowMarks(
          '<div style="display:flex" data-rects="0,100,80;0,16;20,36;40,56;60,76;80,96">' +
            '<img src="https://e.com/a.png" alt="chart"><div>one two three four five</div></div>',
        ),
      ).toEqual(['1']);
    });

    it('drops what the page painted nothing in', () => {
      // A box laid out at no height and one at no width. Counted, either parts a
      // sentence — which is what an empty grid track and a collapsed spacer are.
      expect(
        rowMarks(
          '<div style="display:flex" data-rects="0,16;24,24;20,36,0;0,16">' +
            '<div>a</div><div></div><div></div><div>b</div></div>',
        ),
      ).toEqual([ONE_LINE_MARK]);
    });

    it('says nothing where nothing was measured', () => {
      // A container with rectangles stated nowhere is the ordinary case for every
      // caller without a browser, and the derived answer is what it keeps.
      expect(rowMarks('<div style="display:flex"><div>a</div><div>b</div></div>')).toEqual(['1']);
      expect(rowMarks('<div style="display:flex;flex-direction:column"><span>a</span></div>')).toEqual([]);
    });

    it('does not ask a row holding nothing a line could take', () => {
      // A strip of links, a toolbar of buttons, a row of pictures: already a row,
      // and no item of it would ever be written as a block, so the stronger mark
      // would buy nothing and the rectangles are not collected at all. Over four
      // pages this refused between a quarter and four fifths of the containers
      // that pass the size budget.
      const nav = '<div style="display:flex" data-rects="0,16;0,16"><a href="/a">c#</a><a href="/b">python</a></div>';
      expect(rowMarks(nav)).toEqual(['1']);
      const withWrapper =
        '<div style="display:flex" data-rects="0,16;0,16"><div><a href="/a">c#</a></div><a href="/b">python</a></div>';
      expect(rowMarks(withWrapper)).toEqual([ONE_LINE_MARK]);
    });

    it('does not measure a container too large to be one line', () => {
      // The budget, and why there is one: unbounded, a page shell laid out with
      // flex would have every line box on the page collected for it, once per
      // flex box on the way down. Stated as one band and refused all the same.
      const many = Array.from({ length: 200 }, (_, i) => `<span>${i}</span>`).join('');
      const column = `<div style="display:flex;flex-direction:column" data-rects="0,16">${many}</div>`;
      expect(rowMarks(column)).toEqual([]);
      const small = '<div style="display:flex;flex-direction:column" data-rects="0,16"><span>0</span></div>';
      expect(rowMarks(small)).toEqual([ONE_LINE_MARK]);
    });
  });

  describe('the mention in the sentence', () => {
    it('keeps the sentence whole', () => {
      expect(convert(MENTION)).toBe(
        'Wow even [@karpathy](https://x.com/karpathy) admits he is 80% agentic coding now.',
      );
    });

    it('marks the column the mention sits in as one line too', () => {
      expect(rowMarks(MENTION)).toEqual([ONE_LINE_MARK, ONE_LINE_MARK]);
    });

    it('stops writing the block the column derived onto the mention', () => {
      // The first of the two things that broke the sentence, and the one no rule
      // about `flex-direction` can reach: a column with a single item stacks
      // nothing, so the `block` the `<a>` computes is the algorithm's word about
      // a line that was settled higher up. Measured, the column answers for it
      // the way a row already did; unmeasured, the mark is what it was.
      const marked = (rects: ContentRectsOf): string | null => {
        const doc = page(MENTION);
        const restore = snapshotStyles([doc.body], styleEngine(), false, rects);
        const own = doc.querySelector('a')!.getAttribute('data-s2md-style');
        restore();
        return own;
      };
      expect(marked(NOTHING_MEASURED)).toBe('display:block');
      expect(marked(statedRects)).toBe(null);
    });

    it('is what it was where nothing can be measured', () => {
      // The library against linkedom, a server, a caller with no browser: the
      // capture must be no worse than before, and it is exactly what it was.
      expect(unmeasured(MENTION)).toBe(
        'Wow even\n\n[@karpathy](https://x.com/karpathy)\n\nadmits he is 80% agentic coding now.',
      );
    });

    it('is what it was where the measurement faults', () => {
      // happy-dom has no layout, so `Range.getClientRects()` here is either empty
      // or absent — the shape of a browser that cannot answer, which must cost
      // the capture nothing.
      const doc = page(MENTION);
      const restore = snapshotStyles([doc.body], styleEngine(), false, contentRectsIn(doc));
      const md = toMarkdown(doc.body).trim();
      restore();
      expect(md).toBe(unmeasured(MENTION));
    });

    it('takes the byline with it', () => {
      // Three columns of one item each, drawn on one band. Out of scope in the
      // issue, and it needs no rule of its own — it is the same measurement.
      const byline =
        '<div style="display:flex;flex-direction:row" data-rects="0,16;0,16;0,16">' +
        '<div style="display:flex;flex-direction:column" data-rects="0,16"><span>Andrej Karpathy</span></div>' +
        '<div style="display:flex;flex-direction:column" data-rects="0,16"><span>@karpathy</span></div>' +
        '<div style="display:flex;flex-direction:column" data-rects="0,16"><span>Jul 27</span></div></div>';
      expect(convert(byline)).toBe('Andrej Karpathy @karpathy Jul 27');
      expect(unmeasured(byline)).toBe('Andrej Karpathy\n\n@karpathy\n\nJul 27');
    });
  });

  describe('what must not break', () => {
    it('leaves a row of cards as blocks', () => {
      // Two paragraphs each, so two bands: the measurement never fires and the
      // derived row is what it was. Columns are a layout Markdown cannot spell,
      // and welding them into a line is worse than losing them.
      const cards =
        '<div style="display:flex;flex-direction:row" data-rects="0,16;20,36;0,16;20,36">' +
        '<div><p>First card heading</p><p>First card body</p></div>' +
        '<div><p>Second card heading</p><p>Second card body</p></div></div>';
      expect(convert(cards)).toBe(
        'First card heading\n\nFirst card body\n\nSecond card heading\n\nSecond card body',
      );
      expect(convert(cards)).toBe(unmeasured(cards));
    });

    it('leaves a row of one-line cards as blocks', () => {
      // One band, so the mark is written — and the second half of the question is
      // what keeps these apart: each card holds a block of its own, which no
      // measurement of the container can see.
      const cards =
        '<div style="display:flex" data-rects="0,16;0,16">' +
        '<div><p>Alpha</p></div><div><p>Beta</p></div></div>';
      expect(rowMarks(cards)).toEqual([ONE_LINE_MARK]);
      expect(convert(cards)).toBe('Alpha\n\nBeta');
      expect(convert(cards)).toBe(unmeasured(cards));
    });

    it('leaves a navigation row on one line', () => {
      const nav = '<div style="display:flex" data-rects="0,16;0,16"><a href="/a">c#</a><a href="/b">python</a></div>';
      expect(convert(nav)).toBe('[c#](/a) [python](/b)');
      expect(convert(nav)).toBe(unmeasured(nav));
    });

    it('leaves a wrapped navigation row on one line', () => {
      // Three tags, two bands, because the window was narrow. The derived row is
      // still the answer here: the reader met a strip of tags, not a paragraph
      // each, and the wrap is a width the file has no way to carry.
      const wrapped =
        '<div style="display:flex" data-rects="0,16;0,16;20,36">' +
        '<a href="/a">c#</a><a href="/b">python</a><a href="/c">rust</a></div>';
      expect(rowMarks(wrapped)).toEqual(['1']);
      expect(convert(wrapped)).toBe('[c#](/a) [python](/b) [rust](/c)');
      expect(convert(wrapped)).toBe(unmeasured(wrapped));
    });

    it('leaves a flex column stacked', () => {
      const column =
        '<div style="display:flex;flex-direction:column" data-rects="0,16;20,36;40,56">' +
        '<span>one</span><span>two</span><span>three</span></div>';
      expect(rowMarks(column)).toEqual([]);
      expect(convert(column)).toBe('one\n\ntwo\n\nthree');
      expect(convert(column)).toBe(unmeasured(column));
    });

    it('leaves a list laid along one line a list', () => {
      // An `<li>` carries a bullet its own rule spells and a line has nowhere to
      // put it, so the measurement is not spent here however few bands it counts.
      const tags = '<ul style="display:flex" data-rects="0,16;0,16"><li>java</li><li>c++</li></ul>';
      expect(rowMarks(tags)).toEqual(['1']);
      expect(convert(tags)).toBe(unmeasured(tags));
      expect(convert(tags)).toContain('java');
      expect(convert(tags)).toContain('c++');
    });

    it('leaves a heading a heading', () => {
      // The level is what a heading is and no measurement can spell it. A skin
      // that puts an [edit] link beside a title is exactly this shape — and with
      // a wrapper around the link, so the container is measured and the mark
      // written, the heading still declines to spend it.
      const heading =
        '<div style="display:flex" data-rects="0,30;16,28"><h2>Section</h2><div><a href="/e">edit</a></div></div>';
      expect(rowMarks(heading)).toEqual([ONE_LINE_MARK]);
      expect(convert(heading)).toContain('## Section');
    });

    it('leaves a heading written with a role a heading', () => {
      // An interface built out of divs writes its headings `role="heading"`, and
      // the `##` is what the reader was shown. Handing the content back would
      // take the level with it, exactly as it would from an `<h2>`.
      const aria =
        '<div style="display:flex" data-rects="0,30;16,28">' +
        '<div role="heading" aria-level="2">Section</div><div><a href="/e">edit</a></div></div>';
      expect(rowMarks(aria)).toEqual([ONE_LINE_MARK]);
      expect(convert(aria)).toContain('## Section');
    });

    it('does not empty a formula wrapper into the line', () => {
      // `.katex` is an ordinary `<div>` whose rule reads the formula off the
      // element and never converts what is inside it. Its content is empty by
      // design, so taking that content into the line would delete the formula —
      // the one direction of this change that could cost text rather than blanks.
      const html =
        '<div style="display:flex" data-rects="0,16;0,16">' +
        '<div class="katex"><annotation encoding="application/x-tex">x^2</annotation></div>' +
        '<div>beside</div></div>';
      const doc = page(html);
      const restore = snapshotStyles([doc.body], styleEngine(), false, statedRects);
      const md = toMarkdown(doc.body, { math: true }).trim();
      restore();
      expect(md).toContain('$x^2$');
    });

    it('leaves a run of text beside a picture a block', () => {
      const wide =
        '<div style="display:flex" data-rects="0,100,80;0,16;20,36;40,56;60,76;80,96">' +
        '<img src="https://e.com/a.png" alt="chart"><div>one two three four five</div></div>';
      expect(convert(wide)).toBe(unmeasured(wide));
      expect(convert(wide)).toContain('\n\none two three four five');
    });

    it('takes a caption beside a picture into its line', () => {
      // The same shape drawn on one band, which is what a figure with a label
      // beside it is — and there one line is what the reader met.
      const caption =
        '<div style="display:flex" data-rects="0,100,80;40,56">' +
        '<img src="https://e.com/a.png" alt="chart"><div>Fig. 1</div></div>';
      expect(convert(caption)).toBe('![chart](https://e.com/a.png) Fig. 1');
    });

    it('leaves a paragraph the page wrote a paragraph', () => {
      // The one place the set refuses evidence it has. Two `<p>` drawn side by
      // side are one band and the reader did meet them on one line, but `<p>` is
      // the only tag that means paragraph and nothing else — a band is a weaker
      // claim than the author's own word, and welding two of them is the error
      // that cannot be seen in the finished file. With no other candidate among
      // the children the container is not even measured, so the derived mark is
      // what it keeps.
      const paragraphs =
        '<div style="display:flex" data-rects="0,16;0,16"><p>Andrej Karpathy</p><p>@karpathy</p></div>';
      expect(rowMarks(paragraphs)).toEqual(['1']);
      expect(convert(paragraphs)).toBe('Andrej Karpathy\n\n@karpathy');
      expect(convert(paragraphs)).toBe(unmeasured(paragraphs));
    });
  });

  describe('the page is put back', () => {
    it('restores an attribute the page owned', () => {
      const doc = page('<div style="display:flex" data-s2md-row="mine" data-rects="0,16;0,16"><div>a</div><div>b</div></div>');
      const restore = snapshotStyles([doc.body], styleEngine(), false, statedRects);
      expect(doc.querySelector('div')!.getAttribute(ROW_ATTR)).toBe(ONE_LINE_MARK);
      restore();
      expect(doc.querySelector('div')!.getAttribute(ROW_ATTR)).toBe('mine');
    });
  });
});
