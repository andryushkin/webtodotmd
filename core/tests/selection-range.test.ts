// Selection enrichment, driven through real Range objects.
//
// The rest of the suite tests `normalizeFragment` on hand-built containers, which
// leaves the part that decides what a partial selection means — the part users
// exercise with every drag of the mouse — untested. linkedom's Range cannot do
// it: `startContainer` is undefined and `cloneContents()` throws across two
// parents. happy-dom implements enough of it, and the core already names it as a
// supported peer.
import { describe, it, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { selectionToMarkdown } from '../src/browser.js';

function setup(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

/** The one method of Selection the conversion reads, over a single range. */
function selectionOf(range: Range): Selection {
  return {
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => range.toString() || 'x',
  } as unknown as Selection;
}

function convert(doc: Document, build: (range: Range) => void): string {
  const range = doc.createRange();
  build(range);
  return selectionToMarkdown(selectionOf(range), {}).trim();
}

const TABLE = `<div><table>
<thead><tr><th>Name</th><th>Age</th></tr></thead>
<tbody><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody>
</table><p>after the table</p></div>`;

describe('a selection that crosses out of a table', () => {
  it('keeps the header the selection scrolled past', () => {
    const doc = setup(TABLE);
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('tbody tr')[1]!);
      range.setEndAfter(doc.querySelector('p')!);
    });
    // Before this, the common ancestor was a plain <div>, no semantic ancestor
    // was found, and the table arrived headerless — the one thing the table
    // branch exists to prevent.
    expect(md).toContain('Name');
    expect(md).toContain('Age');
    expect(md).toContain('after the table');
  });

  it('still enriches a selection wholly inside the table', () => {
    const doc = setup(TABLE);
    const md = convert(doc, (range) => range.selectNode(doc.querySelectorAll('tbody tr')[1]!));
    expect(md).toContain('Name');
    expect(md).toContain('| b');
  });

  it('leaves a selection with no table alone', () => {
    const doc = setup(TABLE);
    const md = convert(doc, (range) => range.selectNode(doc.querySelector('p')!));
    expect(md).toBe('after the table');
  });
});

describe('header detection', () => {
  it('does not promote a body row that merely repeats the header', () => {
    // Comparing textContent called this row the header and dropped it.
    const doc = setup(`<table>
<thead><tr><th>Name</th><th>Age</th></tr></thead>
<tbody><tr><td>Name</td><td>Age</td></tr><tr><td>b</td><td>2</td></tr></tbody>
</table>`);
    const md = convert(doc, (range) => range.selectNode(doc.querySelectorAll('tbody tr')[0]!));
    const rows = md.split('\n').filter((line) => line.startsWith('|'));
    // Header, separator, and the body row still present as a body row.
    expect(rows).toHaveLength(3);
  });

  it('does not duplicate a header that is itself selected', () => {
    const doc = setup(TABLE);
    const md = convert(doc, (range) => range.selectNode(doc.querySelector('table')!));
    expect(md.match(/Name/g)).toHaveLength(1);
  });
});

describe('preformatted text', () => {
  it('keeps lines that a <pre> broke with <br>', () => {
    const doc = setup('<pre>first<br>second<br>third</pre>');
    const md = convert(doc, (range) => range.selectNodeContents(doc.querySelector('pre')!));
    expect(md).toContain('first\nsecond\nthird');
  });
});

describe('the page is left as it was found', () => {
  it('removes the marks used to match clones back to originals', () => {
    const doc = setup(TABLE);
    convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('tbody tr')[1]!);
      range.setEndAfter(doc.querySelector('p')!);
    });
    expect(doc.body.innerHTML).not.toContain('data-s2md');
  });
});
