import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { Window } from 'happy-dom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';
import { selectionToMarkdown } from '../src/browser.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('headings', () => {
  it('h1', () => {
    expect(toMarkdown('<h1>Title</h1>')).toBe('# Title\n');
  });

  it('h2', () => {
    expect(toMarkdown('<h2>Title</h2>')).toBe('## Title\n');
  });

  it('h6', () => {
    expect(toMarkdown('<h6>Title</h6>')).toBe('###### Title\n');
  });

  it('empty heading is skipped', () => {
    expect(toMarkdown('<h3></h3>')).toBe('\n');
  });

  it('multiple headings', () => {
    expect(toMarkdown('<h1>First</h1><h2>Second</h2>')).toBe('# First\n\n## Second\n');
  });

  it('strips anchor with class=heading-link', () => {
    expect(toMarkdown('<h2><a class="heading-link">¶</a> Title</h2>')).toBe('## Title\n');
  });

  it('headingOffset shifts levels', () => {
    expect(toMarkdown('<h2>A</h2><h3>B</h3>', { headingOffset: -1 })).toBe('# A\n\n## B\n');
  });

  it('headingOffset clamps to h1 minimum', () => {
    expect(toMarkdown('<h1>Title</h1>', { headingOffset: -5 })).toBe('# Title\n');
  });

  it('headingOffset clamps to h6 maximum', () => {
    expect(toMarkdown('<h1>Title</h1>', { headingOffset: 10 })).toBe('###### Title\n');
  });
});

// A capture is a piece of a page and its headings start wherever the page's do:
// a chat interface writes a whole answer under `<h3>`, and a fixed shift made a
// file whose first heading was `####` with nothing above it anywhere.
describe('topHeadingLevel', () => {
  it('puts the shallowest heading at the level asked for', () => {
    expect(toMarkdown('<h3>A</h3><h4>B</h4>', { topHeadingLevel: 2 })).toBe('## A\n\n### B\n');
  });

  // Upwards only: an `<h1>` is the rank the page gave its title, and pushing it
  // to `##` to keep `#` free spends the reader's structure on the note's own.
  it('leaves a document that already starts at h1 alone', () => {
    expect(toMarkdown('<h1>A</h1><h2>B</h2>', { topHeadingLevel: 2 })).toBe('# A\n\n## B\n');
  });

  it('lifts a lone deep heading', () => {
    expect(toMarkdown('<h6>Deep</h6>', { topHeadingLevel: 2 })).toBe('## Deep\n');
  });

  it('a document with no heading is unaffected', () => {
    expect(toMarkdown('<p>text</p>', { topHeadingLevel: 2 })).toBe('text\n');
  });

  it('a heading nobody saw does not set the base', () => {
    const html = '<h1 style="display:none">hidden</h1><h3>Shown</h3>';
    expect(toMarkdown(html, { topHeadingLevel: 2 })).toBe('## Shown\n');
  });

  it('an explicit offset wins — the caller stating the answer, not asking', () => {
    expect(toMarkdown('<h3>A</h3>', { topHeadingLevel: 2, headingOffset: 0 })).toBe('### A\n');
  });
});

// `topHeadingLevel` is documented as an option of the conversion, not of one
// entry point, and there are two. linkedom cannot build a `Range` the selection
// path reads, so this one is driven through happy-dom like `selection-range`.
describe('aria heading criteria: topHeadingLevel on the selection path', () => {
  function selectionOf(range: Range): Selection {
    return {
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => range.toString() || 'x',
    } as unknown as Selection;
  }

  function fromSelection(html: string, options: Record<string, unknown>): string {
    const window = new Window();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML = `<div id="root">${html}</div>`;
    const range = doc.createRange();
    range.selectNodeContents(doc.getElementById('root')!);
    return selectionToMarkdown(selectionOf(range), options);
  }

  it('shifts a selection the same way the whole-document path does', () => {
    // It was accepted and spent on nothing: the option arrived, no offset was
    // ever resolved from it, and the caller got `####` with no error to read.
    expect(fromSelection('<h4>Deep</h4><p>Body</p>', { topHeadingLevel: 2 }))
      .toBe('## Deep\n\nBody\n');
  });

  it('leaves a selection that already starts at h1 alone, upwards only', () => {
    expect(fromSelection('<h1>A</h1><h3>B</h3>', { topHeadingLevel: 2 }))
      .toBe('# A\n\n### B\n');
  });

  it('an explicit offset still wins over the level', () => {
    expect(fromSelection('<h4>Deep</h4>', { topHeadingLevel: 2, headingOffset: 0 }))
      .toBe('#### Deep\n');
  });
});

// An interface built out of divs writes its headings with ARIA, and a reader
// meets a heading whatever the tag said. Google's AI answers put every section
// title this way, and the file came back with all of them as paragraphs.
describe('role="heading"', () => {
  it('becomes a heading at the level it states', () => {
    expect(toMarkdown('<div role="heading" aria-level="3">Title</div>')).toBe('### Title\n');
  });

  it('a level it does not state reads as 2, which is what a browser reports', () => {
    expect(toMarkdown('<div role="heading">Title</div>')).toBe('## Title\n');
  });

  it('a level nobody can read falls back to the same default', () => {
    expect(toMarkdown('<div role="heading" aria-level="x">Title</div>')).toBe('## Title\n');
    // Not a level: ARIA's floor is 1, so this states nothing rather than a rank.
    expect(toMarkdown('<div role="heading" aria-level="0">Title</div>')).toBe('## Title\n');
  });

  it('counts for the normalisation, like a heading tag does', () => {
    const html = '<div role="heading" aria-level="3">A</div><div role="heading" aria-level="4">B</div>';
    expect(toMarkdown(html, { topHeadingLevel: 2 })).toBe('## A\n\n### B\n');
  });

  it('empty is skipped, like a heading tag is', () => {
    expect(toMarkdown('<div role="heading" aria-level="3"></div>')).toBe('\n');
  });
});

// ARIA puts no ceiling on `aria-level`, so a 9 is a level the page really stated
// and a browser really reports. Read as the "unstated" default it wrote the child
// above its own parent, and one such line pulled every heading on the page.
describe('aria heading criteria: a level deeper than Markdown writes', () => {
  it('lands on the deepest level there is, as a shifted tag does', () => {
    expect(toMarkdown('<div role="heading" aria-level="6">L6</div>')).toBe('###### L6\n');
    expect(toMarkdown('<div role="heading" aria-level="7">L7</div>')).toBe('###### L7\n');
    expect(toMarkdown('<div role="heading" aria-level="99">L99</div>')).toBe('###### L99\n');
  });

  it('never rises above the heading it sits under', () => {
    const html = '<div role="heading" aria-level="3">Parent</div>'
      + '<div role="heading" aria-level="7">Child</div>';
    expect(toMarkdown(html)).toBe('### Parent\n\n###### Child\n');
  });

  it('does not drag the whole page up with it', () => {
    // `levelOf` shared the rule's fallback, so one such line read as a 2 and
    // became the shallowest heading of the document: every real heading beside
    // it was then normalized against a level nothing on the page was written at.
    const deep = '<h4>Real</h4><div role="heading" aria-level="9">Deep</div>';
    expect(toMarkdown(deep, { topHeadingLevel: 2 })).toBe('## Real\n\n#### Deep\n');
    expect(toMarkdown('<h4>Real</h4>', { topHeadingLevel: 2 })).toBe('## Real\n');
  });
});

// What a `<div>` has to show before its claim of being a heading is written as
// one. A tag is drawn by the browser, so an `<h3>` cannot look like body text;
// a `<div>` is drawn like everything else, and the role alone put four headings
// in the file where the reader met six identical lines.
describe('aria heading criteria: the three factors', () => {
  // What a snapshot writes on an element claiming the role: the size it was
  // drawn at as a multiple of the text around it, whether or not it differs.
  // `1em` is the declaration that says the drawing was read and was ordinary.
  const drawn = (ratio: string, rest = ''): string =>
    `<div role="heading" aria-level="3" data-s2md-style="font-size:${ratio}${rest}">T</div>`;

  describe('F1: it draws a line of its own', () => {
    it('a role inside a sentence is a label, not a heading', () => {
      // `##` here would cut the sentence in two, and the words either side of it
      // would land in different blocks.
      const html = '<div>before <span role="heading" aria-level="3">Label</span> after</div>';
      expect(toMarkdown(html)).toBe('before Label after\n');
    });

    it('the same span drawn as a block is one', () => {
      const html =
        '<div>before <span role="heading" aria-level="3" style="display:block">Label</span></div>';
      expect(toMarkdown(html)).toContain('### Label');
    });

    it('a block tag the page inlines is not one either', () => {
      const html =
        '<div>before <div role="heading" aria-level="3" style="display:inline">Label</div> after</div>';
      expect(toMarkdown(html)).toBe('before Label after\n');
    });
  });

  describe('F2: it holds no block of its own', () => {
    it('a role on the wrapper of a section is not a heading', () => {
      // Written as one, the `##` either drags the whole section onto the heading's
      // line or puts a heading inside a heading.
      const html = '<div role="heading" aria-level="2"><p>First</p><p>Second</p></div>';
      expect(toMarkdown(html)).toBe('First\n\nSecond\n');
    });

    it('a line broken inside the heading still is', () => {
      // A `<br>` draws a second line of the heading, not a block under it, which
      // is what `<h2>a<br>b</h2>` has always meant.
      expect(toMarkdown('<div role="heading" aria-level="2">a<br>b</div>')).toContain('## a');
    });

    it('inline wrappers are not blocks', () => {
      const html = '<div role="heading" aria-level="2"><span><em>Title</em></span></div>';
      expect(toMarkdown(html)).toBe('## _Title_\n');
    });
  });

  describe('F3: it was drawn apart from the text around it', () => {
    it('heavier than its surroundings is a heading', () => {
      expect(toMarkdown(drawn('1em', ';font-weight:700'))).toBe('### T\n');
    });

    it('larger than its surroundings is a heading', () => {
      // Either spelling on its own: a page tells a heading apart by size or by
      // weight, and requiring both would lose half the interfaces there are.
      expect(toMarkdown(drawn('1.5em'))).toBe('### T\n');
    });

    it('drawn like the text around it is a paragraph', () => {
      expect(toMarkdown(drawn('1em'))).toBe('T\n');
    });

    it('and so is one drawn smaller', () => {
      expect(toMarkdown(drawn('0.75em'))).toBe('T\n');
    });

    it('reads the percentage spelling of the same thing', () => {
      expect(toMarkdown(drawn('150%'))).toBe('### T\n');
      expect(toMarkdown(drawn('100%'))).toBe('T\n');
    });

    it('the wrapper carrying the size costs the heading, knowingly', () => {
      // `<div class="h3"><div role="heading">` — the size is on the wrapper, so
      // the element itself is drawn at 1em and reads as ordinary text. The error
      // runs towards a paragraph, which keeps every word.
      const html = `<div data-s2md-style="font-size:1.5em">${drawn('1em')}</div>`;
      expect(toMarkdown(html)).toBe('T\n');
    });
  });

  describe('the silence rule: no snapshot, no question', () => {
    it('a library caller keeps the role exactly as before', () => {
      // `server.ts` and every caller with no content script behind it convert
      // markup nobody wrote a drawing down for, and there an absent declaration
      // means the question was never put.
      expect(toMarkdown('<div role="heading" aria-level="3">T</div>')).toBe('### T\n');
    });

    it('a colour is not a drawing anybody read', () => {
      const html = '<div role="heading" aria-level="3" style="color:red">T</div>';
      expect(toMarkdown(html)).toBe('### T\n');
    });

    it('a demoted role sets no level for the rest of the page', () => {
      // The `<h4>` is then the shallowest heading there is, and rises to `##`.
      // Counted at its stated 2 it would have held the whole page down.
      const plain = '<div role="heading" aria-level="2" data-s2md-style="font-size:1em">P</div>';
      expect(toMarkdown('<h4>Real</h4>' + plain, { topHeadingLevel: 2 })).toContain('## Real');
    });

    it('and a kept one still does', () => {
      const kept =
        '<div role="heading" aria-level="2" data-s2md-style="font-size:1.5em">K</div>';
      expect(toMarkdown('<h4>Real</h4>' + kept, { topHeadingLevel: 2 })).toContain('#### Real');
    });
  });
});
