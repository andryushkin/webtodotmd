// Which newlines the reader saw as lines.
//
// The two failures here point in opposite directions, and only one of them is
// visible in the source. A caption written as three lines inside one `<span>`
// arrives as a single welded line, which the reader notices as a wall of text; an
// ordinary indented paragraph arrives with a hard break and a leading space on
// every wrapped line, which the reader notices as a backslash in the middle of a
// sentence. The same character causes both, and the computed `white-space` of the
// element around it is the whole of what tells them apart — so the seam this file
// replaces is the browser, and every case below states its page as a cascade.
import { describe, it, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { enrichRange, toMarkdown } from '../../../core/src/browser';
import { snapshotScope, type ComputedStyleOf } from '../style-snapshot';
import {
  HARD_BREAK_ATTR,
  breakPreservedNewlines,
  collapseHardBreaksToParagraphs,
  elementsPreservingNewlines,
  markPreservedNewlines,
  preservesNewlines,
  rangePreservesNewlines,
} from '../hard-breaks';

// The part of the UA stylesheet that touches this property.
const UA: Record<string, string> = { pre: 'pre', textarea: 'pre' };

/**
 * `white-space` as a cascade: the element's own `style`, then a class, then the
 * UA sheet, then what it inherits. Inheritance is the point — a page states the
 * property on the box and every `<span>` inside it computes the same value, which
 * is what lets the mark be asked of the text node's own parent and no higher.
 */
function styleEngine(rules: Record<string, string> = {}): ComputedStyleOf {
  const cache = new WeakMap<Element, string>();
  const resolve = (el: Element): string => {
    const hit = cache.get(el);
    if (hit !== undefined) return hit;
    const own = /white-space:\s*([\w-]+)/.exec(el.getAttribute('style') ?? '')?.[1];
    const byClass = Array.from(el.classList)
      .map((name) => rules[name])
      .find((value) => value !== undefined);
    const value =
      own ??
      byClass ??
      UA[el.tagName.toLowerCase()] ??
      (el.parentElement ? resolve(el.parentElement) : 'normal');
    cache.set(el, value);
    return value;
  };
  return (el) => (property) => (property === 'white-space' ? resolve(el) : undefined);
}

function page(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

/** The capture, from the live nodes to the file, as `content-script.ts` runs it. */
function capture(doc: Document, range: Range, rules: Record<string, string> = {}): string {
  const scope = snapshotScope(range) ?? doc.body;
  const computed = styleEngine(rules);
  // Read first, then write: the same order `captureStyles()` keeps, and the
  // reason the two calls are two.
  const preserving = elementsPreservingNewlines([scope], computed);
  const unmark = markPreservedNewlines(preserving);
  try {
    const rootPreserves = rangePreservesNewlines(range);
    const fragment = enrichRange(range);
    breakPreservedNewlines(fragment, rootPreserves);
    return collapseHardBreaksToParagraphs(toMarkdown(fragment, { mode: 'selection' })).trim();
  } finally {
    unmark();
  }
}

/** A selection of everything inside an element, the way a triple click makes one. */
function contentsOf(doc: Document, selector: string): Range {
  const range = doc.createRange();
  range.selectNodeContents(doc.querySelector(selector)!);
  return range;
}

/** A selection that begins and ends inside one text node, the way a drag makes one. */
function insideTextOf(doc: Document, selector: string): Range {
  const range = doc.createRange();
  const text = doc.querySelector(selector)!.firstChild!;
  range.setStart(text, 0);
  range.setEnd(text, (text.textContent ?? '').length);
  return range;
}

// The fixture's own intro paragraph, indented the way every hand-written page is,
// and the case it introduces (E4) states the rule: source newlines collapse to
// visible spaces.
const INTRO = `<article><p>
    A manual fixture for Text to .md. Serve this file over HTTP, reload the
    unpacked extension, and select only the white subject area of one case.
    Compare the page, Preview, and Source/downloaded Markdown.
  </p></article>`;

const WRAPPED =
  'A manual fixture for Text to .md. Serve this file over HTTP, reload the ' +
  'unpacked extension, and select only the white subject area of one case. ' +
  'Compare the page, Preview, and Source/downloaded Markdown.';

// A caption as Instagram writes one: three lines, one text node, no markup at
// all, and a stylesheet that draws the newlines.
const CAPTION = '<div class="caption"><span>first line\nsecond line\nthird line</span></div>';
const CAPTION_LINES = 'first line\\\nsecond line\\\nthird line';

describe('hard breaks: markup the page indented', () => {
  it('an ordinary paragraph is one wrapped line', () => {
    const doc = page(INTRO);
    expect(capture(doc, contentsOf(doc, 'article'))).toBe(WRAPPED);
  });

  it('the same paragraph selected from inside it, where the clone keeps no parent', () => {
    const doc = page(INTRO);
    const range = insideTextOf(doc, 'p');
    // The shape the repair turns on: `cloneContents()` hands back a bare text
    // node, so the verdict cannot come from the fragment at all.
    expect(enrichRange(range).firstChild?.nodeType).toBe(3);
    expect(capture(doc, range)).toBe(WRAPPED);
  });

  it('a paragraph inside a div', () => {
    const doc = page(`<div><div>${INTRO}</div></div>`);
    expect(capture(doc, contentsOf(doc, 'article'))).toBe(WRAPPED);
  });

  it('a table cell', () => {
    const doc = page(`<table><tbody><tr><td>
      one line of prose
      wrapped by the author
    </td></tr></tbody></table>`);
    const md = capture(doc, contentsOf(doc, 'td'));
    expect(md).not.toContain('\\');
    expect(md).toContain('one line of prose wrapped by the author');
  });

  it('a nowrap element collapses its newlines too', () => {
    const doc = page('<p class="nowrap">one\ntwo</p>');
    expect(capture(doc, contentsOf(doc, 'body'), { nowrap: 'nowrap' })).toBe('one two');
  });
});

describe('hard breaks: white-space the page preserves', () => {
  it('pre-line keeps the caption', () => {
    const doc = page(CAPTION);
    expect(capture(doc, contentsOf(doc, '.caption'), { caption: 'pre-line' }))
      .toBe(CAPTION_LINES);
  });

  it('pre-wrap keeps it', () => {
    const doc = page(CAPTION);
    expect(capture(doc, contentsOf(doc, '.caption'), { caption: 'pre-wrap' }))
      .toBe(CAPTION_LINES);
  });

  it('break-spaces keeps it', () => {
    const doc = page(CAPTION);
    expect(capture(doc, contentsOf(doc, '.caption'), { caption: 'break-spaces' }))
      .toBe(CAPTION_LINES);
  });

  it('a page that states it in the style attribute, with the box in the clone', () => {
    // The shape the old guard inverted: it read `white-space: pre` in an
    // ancestor's `style` as a reason to leave the newlines alone, which is the
    // one value that means they were drawn.
    const doc = page(
      '<div style="white-space: pre-wrap"><span>first line\nsecond line\nthird line</span></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe(CAPTION_LINES);
  });

  it('the value is inherited, so the span the text sits in answers for itself', () => {
    const doc = page(CAPTION);
    const computed = styleEngine({ caption: 'pre-line' });
    const marked = elementsPreservingNewlines([doc.querySelector('.caption')!], computed);
    expect(marked.map((el) => el.tagName.toLowerCase())).toEqual(['span']);
  });

  it('a component is walked, since its copy carries attributes and nothing else', () => {
    const doc = page('<div class="wrap"><test-shadow></test-shadow></div>');
    const host = doc.querySelector('test-shadow')!;
    const root = host.attachShadow({ mode: 'open' }) as unknown as ShadowRoot;
    root.innerHTML = '<span class="lines">first line\nsecond line</span>';
    const marked = elementsPreservingNewlines(
      [doc.querySelector('.wrap')!],
      styleEngine({ lines: 'pre-line' }),
    );
    // `mirrorShadowRoots()` copies the tree by `innerHTML`, so a mark not
    // written here could never be written at all.
    expect(marked.map((el) => el.className)).toEqual(['lines']);
  });

  it('a caption selected from inside its own text node', () => {
    const doc = page(CAPTION);
    expect(capture(doc, insideTextOf(doc, 'span'), { caption: 'pre-line' }))
      .toBe(CAPTION_LINES);
  });

  it('two author newlines in a row are a paragraph break', () => {
    const doc = page('<div class="caption"><span>a caption\n\nand its hashtags</span></div>');
    expect(capture(doc, contentsOf(doc, '.caption'), { caption: 'pre-line' }))
      .toBe('a caption\n\nand its hashtags');
  });

  it('the space after a preserved newline is one space, never four', () => {
    const doc = page('<div class="caption"><span>first line\n    second line</span></div>');
    // Markdown cannot hold the indentation the reader saw under `pre-wrap`, and
    // four leading spaces would be a code block; the core's own whitespace
    // collapse leaves a single space, which renders as nothing.
    expect(capture(doc, contentsOf(doc, '.caption'), { caption: 'pre-wrap' }))
      .toBe('first line\\\n second line');
  });

  it('the CSS Text 4 longhand answers where the shorthand cannot', () => {
    const collapseOnly: ComputedStyleOf = () => (property) =>
      property === 'white-space-collapse' ? 'preserve-breaks' : undefined;
    const doc = page(CAPTION);
    const marked = elementsPreservingNewlines([doc.querySelector('.caption')!], collapseOnly);
    // The span, and not the div above it: only an element holding a newline in a
    // text node of its own is asked about at all.
    expect(marked.map((el) => el.tagName.toLowerCase())).toEqual(['span']);
    expect(preservesNewlines(collapseOnly({} as Element))).toBe(true);
  });
});

// X writes a tweet as a run of spans under one `white-space: pre-wrap` box, and
// puts the paragraph break at the *end* of a span — the next paragraph starts in
// the span beside it. Trimming a newline against a node's edge, which is right
// when the edge is a block's, cost a 9,000-word thread every one of its
// paragraphs: it arrived as one.
describe('hard breaks: a newline at the edge of a node, not of a line', () => {
  it('a break ending a span is kept when a span follows it', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><span>first\n\n</span>' +
        '<span>second</span></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first\n\nsecond');
  });

  it('and when the text beside it is in the same span', () => {
    const doc = page('<div style="white-space: pre-wrap"><span>first\n\nsecond</span></div>');
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first\n\nsecond');
  });

  // The case the trimming exists for: nothing is drawn on that side, so the
  // newline is the markup's own indentation between the tag and its text.
  it('a break against the edge of a block still goes', () => {
    const doc = page('<div style="white-space: pre-wrap">\n  first line\n</div>');
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first line');
  });

  it('a block beside it does not count as text on the line', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><div>first\n</div><div>second</div></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first\n\nsecond');
  });
});

// The same shape with a picture where the second span was. A replaced element
// holds no text, so the side it stands on read as empty and the break the reader
// saw between the caption and the photograph was trimmed away — the caption came
// back welded to whatever followed it.
describe('hard breaks: a replaced element is drawn beside the line too', () => {
  it('a break ending a span is kept when an image follows it', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><span>caption line\n</span>' +
        '<img src="photo.jpg" alt="photo"></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('caption line\\\n![photo](photo.jpg)');
  });

  it('and when the image comes first', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><img src="photo.jpg" alt="photo">' +
        '<span>\ncaption line</span></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('![photo](photo.jpg)\\\ncaption line');
  });

  it('a picture inside a wrapper that holds no text of its own', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><span>caption line\n</span>' +
        '<a href="https://example.com/p"><img src="photo.jpg" alt="photo"></a></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body')))
      .toBe('caption line\\\n[![photo](photo.jpg)](https://example.com/p)');
  });

  it('a player counts as well', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><span>caption line\n</span>' +
        '<video src="clip.mp4"></video></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('caption line\\\n[clip.mp4](clip.mp4)');
  });

  // A control the core writes nothing for still ends the line for the reader,
  // and counting it costs no backslash: a hard break with nothing left after it
  // is already dropped, so the file is the same either way.
  it('a form control the file has no place for leaves no stray backslash', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><span>caption line\n</span><input value="v"></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('caption line');
  });

  it('an empty wrapper is still nothing drawn', () => {
    const doc = page(
      '<div style="white-space: pre-wrap"><span>first line\n</span><span></span></div>',
    );
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first line');
  });
});

describe('hard breaks: what the rewrite must not touch', () => {
  it('a code block keeps its own newlines and gains no break', () => {
    const doc = page('<pre><code>const a = 1;\nconst b = 2;\n</code></pre>');
    const md = capture(doc, contentsOf(doc, 'body'));
    expect(md).toBe('```\nconst a = 1;\nconst b = 2;\n```');
  });

  it('a selection made inside a code block', () => {
    const doc = page('<pre><code>const a = 1;\nconst b = 2;\n</code></pre>');
    expect(capture(doc, insideTextOf(doc, 'code'))).toContain('const a = 1;\nconst b = 2;');
  });

  it('a <br> the page wrote is still a hard break', () => {
    const doc = page('<p>first line<br>second line</p>');
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first line\\\nsecond line');
  });

  it('a <br> the page wrote beside an indented newline', () => {
    const doc = page('<p>\n  first line<br>\n  second line\n</p>');
    // The break is the page's and stays; the space after it is the indentation
    // the core collapsed, the same one it leaves here without any rewriting at
    // all. One space renders as nothing, and cannot reach the four that would
    // make the line a code block.
    expect(capture(doc, contentsOf(doc, 'body'))).toBe('first line\\\n second line');
  });

  it('the mark never reaches the core', () => {
    const doc = page(CAPTION);
    const computed = styleEngine({ caption: 'pre-line' });
    const unmark = markPreservedNewlines(
      elementsPreservingNewlines([doc.querySelector('.caption')!], computed),
    );
    try {
      const fragment = enrichRange(contentsOf(doc, '.caption'));
      breakPreservedNewlines(fragment, false);
      expect(fragment.querySelectorAll(`[${HARD_BREAK_ATTR}]`).length).toBe(0);
    } finally {
      unmark();
    }
  });
});

describe('hard breaks: the marks come off the page', () => {
  it('the page is left exactly as it was', () => {
    const doc = page(CAPTION);
    const before = doc.body.innerHTML;
    const unmark = markPreservedNewlines(
      elementsPreservingNewlines([doc.body], styleEngine({ caption: 'pre-line' })),
    );
    expect(doc.body.innerHTML).not.toBe(before);
    unmark();
    expect(doc.body.innerHTML).toBe(before);
  });

  it('an attribute the page owns is restored, not removed', () => {
    const doc = page(`<div class="caption" ${HARD_BREAK_ATTR}="theirs"><span>a\nb</span></div>`);
    const unmark = markPreservedNewlines([doc.querySelector('.caption')!]);
    unmark();
    expect(doc.querySelector('.caption')!.getAttribute(HARD_BREAK_ATTR)).toBe('theirs');
  });

  it('nothing is written where no newline was drawn', () => {
    const doc = page(INTRO);
    expect(elementsPreservingNewlines([doc.body], styleEngine())).toEqual([]);
  });
});

describe('hard breaks: consecutive breaks become a blank line', () => {
  it('two hard breaks in prose', () => {
    expect(collapseHardBreaksToParagraphs('a\\\n\\\nb')).toBe('a\n\nb');
  });

  it('a fenced block is left alone, where a backslash ends a shell line', () => {
    const fenced = '```\ncurl x \\\n  \\\n  y\n```';
    expect(collapseHardBreaksToParagraphs(fenced)).toBe(fenced);
  });
});
