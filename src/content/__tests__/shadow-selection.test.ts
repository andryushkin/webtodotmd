// A selection that lives inside a web component, and the two answers a browser
// gives about it.
//
// There is no browser here, so the retargeting is written down instead: the fake
// `Selection` below is handed the endpoints the reader actually chose and answers
// `getRangeAt()` the way Blink does — every endpoint inside a shadow tree moved
// to the position of its host, which puts both ends of a selection made inside
// one component on the same point and hands the capture a collapsed range. That
// is the defect, and it is an assumption about Chrome, not a fact happy-dom can
// establish; the last word on it is a capture run by hand against
// `docs/test_conversion_spec_page.html`, case Q6.
//
// What the tests below can establish is everything downstream of that
// assumption: which range the pipeline is given for each shape of selection,
// that a range and its shadow copy never carry the same content twice, that the
// copies all come back off, and that a browser without `getComposedRanges` is
// left with exactly what it has today.
import { describe, it, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { toMarkdown, enrichRange } from '../../../core/src/browser';
import { snapshotScope, snapshotStyles, type ComputedStyleOf } from '../style-snapshot';
import {
  hasCapturableSelection,
  mirrorShadowRoots,
  openShadowRoots,
  selectionRanges,
  shadowHostOf,
  styleScopeOf,
  type BoundaryPoints,
  type CapturableSelection,
} from '../shadow-selection';

// ---- A page with a component in it ----

const COMPONENT = `
  <style>h3 { color: #5b21b6 }</style>
  <h3>Shadow component heading</h3>
  <p>Text inside an open shadow root with <strong>bold meaning</strong>.</p>
  <ul>
    <li>First shadow item</li>
    <li><a href="https://example.com/shadow">Linked shadow item</a></li>
  </ul>`;

interface Page {
  doc: Document;
  host: Element;
  root: ShadowRoot;
}

function pageWithComponent(html = COMPONENT, mode: 'open' | 'closed' = 'open'): Page {
  const window = new Window();
  const doc = window.document as unknown as Document;
  doc.body.innerHTML =
    '<div class="subject"><p id="before">Before the component.</p>' +
    '<test-shadow></test-shadow>' +
    '<p id="after">After the component.</p></div>';
  const host = doc.querySelector('test-shadow')!;
  const root = host.attachShadow({ mode }) as unknown as ShadowRoot;
  root.innerHTML = html;
  return { doc, host, root };
}

function point(node: Node, offset: number): { node: Node; offset: number } {
  return { node, offset };
}

function indexIn(child: Node): number {
  return Array.prototype.indexOf.call(child.parentNode!.childNodes, child);
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return (node as Partial<ShadowRoot>).host != null;
}

/**
 * The fake browser: it holds where the reader really put the endpoints, and
 * answers the two APIs from that.
 */
function selectionOf(
  doc: Document,
  start: { node: Node; offset: number },
  end: { node: Node; offset: number },
  options: { composed?: boolean } = {},
): CapturableSelection {
  const composed = options.composed !== false;

  // Blink's `getRangeAt()`: an endpoint in a shadow tree becomes the host's own
  // position, and the shadow tree is not mentioned again.
  const retarget = (p: { node: Node; offset: number }): { node: Node; offset: number } => {
    let current = p;
    for (let root = current.node.getRootNode(); isShadowRoot(root); root = current.node.getRootNode()) {
      current = point(root.host.parentNode!, indexIn(root.host));
    }
    return current;
  };

  // The spec's rescoping: an endpoint inside a shadow root the caller did not
  // name is answered with the whole host element instead.
  const rescope = (
    p: { node: Node; offset: number },
    side: 'start' | 'end',
    roots: readonly ShadowRoot[],
  ): { node: Node; offset: number } => {
    let current = p;
    for (;;) {
      const root = current.node.getRootNode();
      if (!isShadowRoot(root) || roots.includes(root)) return current;
      const index = indexIn(root.host);
      current = point(root.host.parentNode!, side === 'start' ? index : index + 1);
    }
  };

  const selection: CapturableSelection = {
    rangeCount: 1,
    isCollapsed: false,
    toString(): string {
      // Whatever the reader highlighted, which the retargeting never takes away.
      const range = doc.createRange();
      if (start.node.getRootNode() !== end.node.getRootNode()) return 'crosses a boundary';
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range.toString();
    },
    getRangeAt(): Range {
      const from = retarget(start);
      const to = retarget(end);
      const range = doc.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      return range;
    },
  };
  if (!composed) return selection;
  return {
    ...selection,
    getComposedRanges({ shadowRoots = [] } = {}): readonly BoundaryPoints[] {
      const from = rescope(start, 'start', shadowRoots);
      const to = rescope(end, 'end', shadowRoots);
      return [
        {
          startContainer: from.node,
          startOffset: from.offset,
          endContainer: to.node,
          endOffset: to.offset,
        },
      ];
    },
  };
}

// A stylesheet that says only what every browser's own says, so the snapshot has
// nothing to add and each tag decides for itself. It cannot be left out and it
// cannot be happy-dom's: silence reads as `font-weight: 400` on a `<strong>`,
// which the snapshot faithfully writes down and the conversion then obeys, and
// happy-dom answers 400 there too. The cascade is `style-snapshot.test.ts`'s
// subject; here it has only to stay out of the way.
const BOLD = 'strong,b,h1,h2,h3,h4,h5,h6,th';
const ITALIC = 'em,i,cite,dfn,var,address';
const UA_CASCADE: ComputedStyleOf = (el) => (property) => {
  // Asked with `closest`, because both properties inherit.
  if (property === 'font-weight') return el.closest?.(BOLD) == null ? '400' : '700';
  if (property === 'font-style') return el.closest?.(ITALIC) == null ? 'normal' : 'italic';
  return undefined;
};

/** What a capture of these ranges would write, copies and styles included. */
function capture(doc: Document, ranges: Range[]): string {
  const scopes = ranges
    .map((range) => styleScopeOf(range, snapshotScope(range)))
    .filter((el): el is Element => el !== null);
  const restoreStyles = snapshotStyles(scopes, UA_CASCADE);
  try {
    const undo = mirrorShadowRoots(openShadowRoots(doc));
    try {
      return ranges.map((range) => toMarkdown(enrichRange(range))).join('\n\n').trim();
    } finally {
      undo();
    }
  } finally {
    restoreStyles();
  }
}

/** The whole of the component, as the reader would drag across it. */
function wholeComponent(page: Page): { start: { node: Node; offset: number }; end: { node: Node; offset: number } } {
  const root = page.root as unknown as Node;
  return {
    start: point(root, 1), // past the <style>
    end: point(root, root.childNodes.length),
  };
}

// ---- The ranges a capture is given ----

describe('shadow selection: which range the pipeline gets', () => {
  it('reaches the real nodes for a selection wholly inside an open shadow root', () => {
    const page = pageWithComponent();
    const { start, end } = wholeComponent(page);
    const selection = selectionOf(page.doc, start, end);

    // The defect, stated: the document-tree answer is a collapsed range.
    expect(selection.getRangeAt(0).collapsed).toBe(true);

    const roots = openShadowRoots(page.doc);
    const ranges = selectionRanges(selection, roots, page.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.collapsed).toBe(false);
    expect(ranges[0]!.commonAncestorContainer).toBe(page.root as unknown as Node);
  });

  it('converts that selection to the Markdown the component draws', () => {
    const page = pageWithComponent();
    const { start, end } = wholeComponent(page);
    const ranges = selectionRanges(
      selectionOf(page.doc, start, end),
      openShadowRoots(page.doc),
      page.doc,
    );

    const md = capture(page.doc, ranges);
    expect(md).toContain('### Shadow component heading');
    expect(md).toContain('**bold meaning**');
    expect(md).toContain('- First shadow item');
    expect(md).toContain('[Linked shadow item](https://example.com/shadow)');
  });

  it('lifts the endpoint out of the component when the selection crosses into it', () => {
    const page = pageWithComponent();
    const before = page.doc.querySelector('#before')!.firstChild!;
    const strong = page.root.querySelector('strong')!.firstChild!;
    const ranges = selectionRanges(
      selectionOf(page.doc, point(before, 0), point(strong, 4)),
      openShadowRoots(page.doc),
      page.doc,
    );

    expect(ranges).toHaveLength(1);
    const range = ranges[0]!;
    expect(range.collapsed).toBe(false);
    // Both ends in the document tree, with the host inside them: a live Range
    // cannot hold two trees, so the component is covered whole instead.
    expect(range.commonAncestorContainer).toBe(page.doc.querySelector('.subject')!);
    expect(range.cloneContents().querySelector('test-shadow')).not.toBe(null);
  });

  it('keeps the light-DOM head and the component tail of a crossing selection', () => {
    const page = pageWithComponent();
    const before = page.doc.querySelector('#before')!.firstChild!;
    const strong = page.root.querySelector('strong')!.firstChild!;
    const ranges = selectionRanges(
      selectionOf(page.doc, point(before, 0), point(strong, 4)),
      openShadowRoots(page.doc),
      page.doc,
    );

    const md = capture(page.doc, ranges);
    expect(md).toContain('Before the component.');
    expect(md).toContain('Shadow component heading');
    expect(md).toContain('bold meaning');
    // Over-captured rather than lost: the selection stopped inside the bold run,
    // and what follows it in the component comes along.
    expect(md).toContain('Linked shadow item');
    expect(md).not.toContain('After the component.');
  });

  it('carries the component once, never twice', () => {
    const page = pageWithComponent();
    const subject = page.doc.querySelector('.subject')!;
    const range = page.doc.createRange();
    range.selectNodeContents(subject);
    const selection = selectionOf(
      page.doc,
      point(subject, 0),
      point(subject, subject.childNodes.length),
    );

    const ranges = selectionRanges(selection, openShadowRoots(page.doc), page.doc);
    const md = capture(page.doc, ranges);
    expect(md.match(/Shadow component heading/g)).toHaveLength(1);
    expect(md.match(/Linked shadow item/g)).toHaveLength(1);
  });

  it('keeps the document-tree answer for a multi-range selection', () => {
    const page = pageWithComponent();
    const before = page.doc.querySelector('#before')!;
    const after = page.doc.querySelector('#after')!;
    const first = page.doc.createRange();
    first.selectNodeContents(before);
    const second = page.doc.createRange();
    second.selectNodeContents(after);

    // `getComposedRanges()` answers with one range and a reader can hold two, so
    // asking it here would silently drop one of them.
    const selection: CapturableSelection = {
      rangeCount: 2,
      isCollapsed: false,
      toString: () => 'Before the component.After the component.',
      getRangeAt: (i: number) => (i === 0 ? first : second),
      getComposedRanges: () => [
        {
          startContainer: before.firstChild!,
          startOffset: 0,
          endContainer: before.firstChild!,
          endOffset: 6,
        },
      ],
    };

    const ranges = selectionRanges(selection, openShadowRoots(page.doc), page.doc);
    expect(ranges).toEqual([first, second]);
  });
});

// ---- The browser that has never heard of the API ----

describe('shadow selection: a browser without getComposedRanges', () => {
  it('captures what the document tree has rather than throwing', () => {
    const page = pageWithComponent();
    const before = page.doc.querySelector('#before')!.firstChild!;
    const selection = selectionOf(page.doc, point(before, 0), point(before, 6), {
      composed: false,
    });

    const ranges = selectionRanges(selection, openShadowRoots(page.doc), page.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.toString()).toBe('Before');
  });

  it('is left with the collapsed range for a selection inside a component, and no fault', () => {
    const page = pageWithComponent();
    const { start, end } = wholeComponent(page);
    const selection = selectionOf(page.doc, start, end, { composed: false });

    const ranges = selectionRanges(selection, openShadowRoots(page.doc), page.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.collapsed).toBe(true);
    expect(capture(page.doc, ranges)).toBe('');
  });

  it('falls back when the API is there but refuses the call', () => {
    const page = pageWithComponent();
    const before = page.doc.querySelector('#before')!.firstChild!;
    const base = selectionOf(page.doc, point(before, 0), point(before, 6));
    const selection: CapturableSelection = {
      ...base,
      getComposedRanges: () => {
        throw new TypeError('an older shape of the API');
      },
    };

    const ranges = selectionRanges(selection, openShadowRoots(page.doc), page.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.toString()).toBe('Before');
  });
});

// ---- A component that keeps its shadow root to itself ----

describe('shadow selection: a closed shadow root', () => {
  it('is not among the roots a capture can name', () => {
    const page = pageWithComponent(COMPONENT, 'closed');
    expect(page.host.shadowRoot).toBe(null);
    expect(openShadowRoots(page.doc)).toEqual([]);
  });

  it('captures the host without a fault, and nothing from inside it', () => {
    const page = pageWithComponent(COMPONENT, 'closed');
    const subject = page.doc.querySelector('.subject')!;
    const selection = selectionOf(
      page.doc,
      point(subject, 0),
      point(subject, subject.childNodes.length),
    );

    const ranges = selectionRanges(selection, openShadowRoots(page.doc), page.doc);
    expect(ranges).toHaveLength(1);
    const md = capture(page.doc, ranges);
    expect(md).toContain('Before the component.');
    expect(md).toContain('After the component.');
    expect(md).not.toContain('Shadow component heading');
  });

  it('plants no copy for it', () => {
    const page = pageWithComponent(COMPONENT, 'closed');
    const undo = mirrorShadowRoots(openShadowRoots(page.doc));
    expect(page.doc.querySelectorAll('s2md-shadow')).toHaveLength(0);
    undo();
  });
});

// ---- What the component's own machinery must not leave behind ----

describe('shadow selection: the component style and script', () => {
  it('leaves neither in the file when the selection is inside the shadow root', () => {
    const page = pageWithComponent(
      '<style>h3 { color: #5b21b6 }</style>' +
        '<script>console.log("setup")</script>' +
        '<h3>Shadow component heading</h3>' +
        '<p>Body text.</p>',
    );
    const root = page.root as unknown as Node;
    const ranges = selectionRanges(
      selectionOf(page.doc, point(root, 0), point(root, root.childNodes.length)),
      openShadowRoots(page.doc),
      page.doc,
    );

    const md = capture(page.doc, ranges);
    expect(md).toContain('Shadow component heading');
    expect(md).toContain('Body text.');
    expect(md).not.toContain('#5b21b6');
    expect(md).not.toContain('color');
    expect(md).not.toContain('console.log');
  });

  it('leaves neither in the copy a light-DOM selection reads', () => {
    const page = pageWithComponent(
      '<style>h3 { color: #5b21b6 }</style>' +
        '<script>console.log("setup")</script>' +
        '<h3>Shadow component heading</h3>',
    );
    const subject = page.doc.querySelector('.subject')!;
    const range = page.doc.createRange();
    range.selectNodeContents(subject);

    const md = capture(page.doc, [range]);
    expect(md).toContain('Shadow component heading');
    expect(md).not.toContain('#5b21b6');
    expect(md).not.toContain('console.log');
  });
});

// ---- The copies, and the page they are taken out of ----

describe('shadow selection: the shadow copies', () => {
  it('lists nested roots deepest first, so an inner copy is serialised into the outer', () => {
    const page = pageWithComponent('<div><inner-shadow></inner-shadow></div>');
    const inner = page.root.querySelector('inner-shadow')!;
    const innerRoot = inner.attachShadow({ mode: 'open' }) as unknown as ShadowRoot;
    innerRoot.innerHTML = '<p>Inside the inner component.</p>';

    expect(openShadowRoots(page.doc)).toEqual([innerRoot, page.root]);

    const undo = mirrorShadowRoots(openShadowRoots(page.doc));
    try {
      const outer = page.host.querySelector('s2md-shadow')!;
      expect(outer.textContent).toContain('Inside the inner component.');
    } finally {
      undo();
    }
  });

  it('takes every copy back off, innermost included', () => {
    const page = pageWithComponent('<div><inner-shadow></inner-shadow></div>');
    const inner = page.root.querySelector('inner-shadow')!;
    (inner.attachShadow({ mode: 'open' }) as unknown as ShadowRoot).innerHTML = '<p>Inner.</p>';

    const before = page.doc.body.innerHTML;
    const undo = mirrorShadowRoots(openShadowRoots(page.doc));
    expect(page.doc.querySelectorAll('s2md-shadow').length).toBeGreaterThan(0);
    undo();
    expect(page.doc.body.innerHTML).toBe(before);
    expect(page.root.querySelectorAll('s2md-shadow')).toHaveLength(0);
  });

  it('hands back an undo for the copies it did plant when one of them faults', () => {
    const page = pageWithComponent();
    const roots = openShadowRoots(page.doc);
    const broken = {
      get host(): Element {
        throw new Error('a component that will not be read');
      },
      innerHTML: '',
    } as unknown as ShadowRoot;

    const undo = mirrorShadowRoots([...roots, broken]);
    expect(page.doc.querySelectorAll('s2md-shadow')).toHaveLength(1);
    undo();
    expect(page.doc.querySelectorAll('s2md-shadow')).toHaveLength(0);
  });
});

// ---- The scope the style snapshot is given ----

describe('shadow selection: the style scope', () => {
  it('answers with the host where the common ancestor is the shadow root itself', () => {
    const page = pageWithComponent();
    const { start, end } = wholeComponent(page);
    const range = selectionRanges(
      selectionOf(page.doc, start, end),
      openShadowRoots(page.doc),
      page.doc,
    )[0]!;

    // What the snapshot could see on its own: a `DocumentFragment` has no
    // parent element, so the whole component would be snapshotted from nowhere.
    expect(snapshotScope(range)).toBe(null);
    expect(styleScopeOf(range, snapshotScope(range))).toBe(page.host);
  });

  it('leaves an ordinary scope alone', () => {
    const page = pageWithComponent();
    const before = page.doc.querySelector('#before')!;
    const range = page.doc.createRange();
    range.selectNodeContents(before);
    expect(styleScopeOf(range, snapshotScope(range))).toBe(before);
  });

  it('marks the real shadow nodes a shadow-tree range converts', () => {
    const page = pageWithComponent(
      '<style>b { font-weight: 400 }</style><p>Plain <b id="mark">not bold</b>.</p>',
    );
    const marked = page.root.querySelector('#mark')!;
    // The cascade the snapshot reads: `<b>` drawn at the normal weight.
    const computed = (el: Element) => (property: string) =>
      el === marked && property === 'font-weight' ? '400' : undefined;

    const scope = styleScopeOf(
      (() => {
        const range = page.doc.createRange();
        range.selectNodeContents(page.root as unknown as Node);
        return range;
      })(),
      null,
    )!;
    const restore = snapshotStyles([scope], computed);
    try {
      expect(marked.getAttribute('data-s2md-style')).toContain('font-weight:400');
    } finally {
      restore();
    }
    expect(marked.getAttribute('data-s2md-style')).toBe(null);
  });
});

// ---- Whether there is anything to capture at all ----

describe('shadow selection: whether there is a selection', () => {
  const stub = (over: Partial<CapturableSelection>): CapturableSelection => ({
    rangeCount: 0,
    isCollapsed: true,
    toString: () => '',
    getRangeAt: () => {
      throw new Error('no range');
    },
    ...over,
  });

  it('is false for a caret', () => {
    expect(hasCapturableSelection(stub({ rangeCount: 1 }))).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(hasCapturableSelection(null)).toBe(false);
  });

  it('is true where the text survives a range the retargeting collapsed', () => {
    expect(
      hasCapturableSelection(stub({ rangeCount: 1, isCollapsed: true, toString: () => 'shadow text' })),
    ).toBe(true);
  });

  it('is true for a range holding no text at all — an image is a capture', () => {
    expect(hasCapturableSelection(stub({ rangeCount: 1, isCollapsed: false }))).toBe(true);
  });

  it('does not build the text where the two cheap fields already answer', () => {
    // Every mouse move of a drag asks this, and `toString()` copies the whole
    // selection each time it is asked.
    let asked = 0;
    const selection = stub({
      rangeCount: 1,
      isCollapsed: false,
      toString: () => {
        asked += 1;
        return 'the whole article';
      },
    });
    expect(hasCapturableSelection(selection)).toBe(true);
    expect(asked).toBe(0);
  });
});

// ---- The way out of a component ----

describe('shadow selection: the host of a node', () => {
  it('is the component for a node inside one', () => {
    const page = pageWithComponent();
    expect(shadowHostOf(page.root.querySelector('h3')!)).toBe(page.host);
  });

  it('is nothing for a node in the page', () => {
    const page = pageWithComponent();
    expect(shadowHostOf(page.doc.querySelector('#before')!)).toBe(null);
  });

  it('climbs one component at a time', () => {
    const page = pageWithComponent('<inner-shadow></inner-shadow>');
    const inner = page.root.querySelector('inner-shadow')!;
    const innerRoot = inner.attachShadow({ mode: 'open' }) as unknown as ShadowRoot;
    innerRoot.innerHTML = '<p>Deep.</p>';
    const deep = innerRoot.querySelector('p')!;
    expect(shadowHostOf(deep)).toBe(inner);
    expect(shadowHostOf(shadowHostOf(deep)!)).toBe(page.host);
  });
});
