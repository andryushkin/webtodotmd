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

// A table without <thead> — which is most of them — has a header all the same:
// the first row, which is what a conversion of the whole page prints as one.
const PLAIN_TABLE = `<div><table><tbody>
<tr><td>Name</td><td>Age</td></tr>
<tr><td>a</td><td>1</td></tr>
<tr><td>b</td><td>2</td></tr>
</tbody></table><p>after the table</p></div>`;

describe('таблица без thead', () => {
  it('restores the first row when a body row is selected', () => {
    const doc = setup(PLAIN_TABLE);
    const md = convert(doc, (range) => range.selectNode(doc.querySelectorAll('tr')[2]!));
    // Was `| b | 2 |` alone: with no <thead> nothing was restored, and the row
    // the user selected became the header of a table that had lost its own.
    expect(md).toContain('| Name | Age |');
    expect(md).toContain('| b    | 2   |');
  });

  it('restores it for a selection that crosses out of the table', () => {
    const doc = setup(PLAIN_TABLE);
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('tr')[2]!);
      range.setEndAfter(doc.querySelector('p')!);
    });
    expect(md).toContain('| Name | Age |');
    expect(md).toContain('after the table');
  });

  it('does not repeat the first row when it is itself selected', () => {
    const doc = setup(PLAIN_TABLE);
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('tr')[0]!);
      range.setEndAfter(doc.querySelectorAll('tr')[1]!);
    });
    expect(md.match(/Name/g)).toHaveLength(1);
    expect(md).toContain('| a    | 1   |');
  });
});

describe('нумерация выделенного пункта', () => {
  const LIST = `<div><ol start="7"><li>one</li><li>two</li><li>three</li></ol><p>after</p></div>`;

  it('numbers a single item by its position, not by the list start', () => {
    const doc = setup(LIST);
    const md = convert(doc, (range) => range.selectNodeContents(doc.querySelectorAll('li')[1]!));
    // `start` was copied verbatim, so the eighth item came out numbered 7.
    expect(md).toBe('8. two');
  });

  it('keeps two selected items an ordered list', () => {
    const doc = setup(LIST);
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('li')[1]!);
      range.setEndAfter(doc.querySelectorAll('li')[2]!);
    });
    // The common ancestor is the <ol>, which was not a semantic wrapper: the
    // clone was a run of bare <li>, and the rule bulleted what it could not
    // find an <ol> for.
    expect(md).toBe('8. two\n9. three');
  });

  it('keeps the numbering when the selection leaves the list', () => {
    const doc = setup(LIST);
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('li')[1]!);
      range.setEndAfter(doc.querySelector('p')!);
    });
    expect(md).toContain('8. two');
    expect(md).toContain('9. three');
  });

  it('leaves an unordered list unnumbered', () => {
    const doc = setup('<ul><li>one</li><li>two</li></ul>');
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('li')[0]!);
      range.setEndAfter(doc.querySelectorAll('li')[1]!);
    });
    expect(md).toBe('- one\n- two');
  });

  it('numbers a nested list from its own start', () => {
    const doc = setup(
      '<ol start="3"><li>one<ol start="5"><li>deep a</li><li>deep b</li></ol></li><li>two</li></ol>',
    );
    const md = convert(doc, (range) =>
      range.selectNodeContents(doc.querySelectorAll('ol > li')[0]!),
    );
    expect(md).toContain('3. one');
    expect(md).toContain('5. deep a');
  });
});

describe('вложенные таблицы при выделении', () => {
  it('does not file the rows of an inner table under the outer header', () => {
    const doc = setup(
      `<table><thead><tr><th>Outer</th></tr></thead><tbody><tr><td>before<table>` +
        `<thead><tr><th>Inner</th></tr></thead><tbody><tr><td>inner data</td></tr></tbody>` +
        `</table>after</td></tr></tbody></table>`,
    );
    const cell = doc.querySelector('td')!;
    const md = convert(doc, (range) => {
      range.setStart(cell.firstChild!, 0);
      range.setEnd(cell.lastChild!, 5);
    });
    // The row walk descended into every table, so `Inner` and `inner data` came
    // out as rows of the outer table, under a header the reader never saw over
    // them — and the inner table was gone.
    expect(md).not.toContain('Outer');
    expect(md).toContain('| Inner      |');
    expect(md).toContain('| inner data |');
  });

  it('gives a row of a nested headerless table the header of that table', () => {
    const doc = setup(
      `<table><thead><tr><th>Outer</th></tr></thead><tbody><tr><td><table><tbody>` +
        `<tr><td>Inner head</td></tr><tr><td>inner data</td></tr>` +
        `</tbody></table></td></tr></tbody></table>`,
    );
    const md = convert(doc, (range) =>
      range.selectNode(doc.querySelectorAll('table table tr')[1]!),
    );
    expect(md).not.toContain('Outer');
    expect(md).toContain('| Inner head |');
    expect(md).toContain('| inner data |');
  });
});

describe('порядок групп строк', () => {
  // <tfoot> before <tbody> is legal, and HTML 4 required it.
  const FOOTED = `<table>
<thead><tr><th>H</th></tr></thead>
<tfoot><tr><td>Total</td></tr></tfoot>
<tbody><tr><td>Data</td></tr></tbody>
</table>`;

  it('keeps the totals row under the data it totals', () => {
    const doc = setup(FOOTED);
    const md = convert(doc, (range) => range.selectNodeContents(doc.querySelector('table')!));
    // Every row went into one new <tbody> in source order, so the page read
    // H, Data, Total and the note read H, Total, Data.
    expect(md.indexOf('Data')).toBeLessThan(md.indexOf('Total'));
  });

  it('restores the header for a footer row selected on its own', () => {
    const doc = setup(FOOTED);
    const md = convert(doc, (range) => range.selectNode(doc.querySelector('tfoot tr')!));
    expect(md).toContain('| H     |');
    expect(md).toContain('| Total |');
  });
});

describe('обогащение через границу блока', () => {
  it('restores both headers of two tables quoted together', () => {
    const doc = setup(
      `<blockquote>` +
        `<table><thead><tr><th>A1</th></tr></thead><tbody><tr><td>a2</td></tr></tbody></table>` +
        `<table><thead><tr><th>B1</th></tr></thead><tbody><tr><td>b2</td></tr></tbody></table>` +
        `</blockquote>`,
    );
    const md = convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('tbody tr')[0]!);
      range.setEndAfter(doc.querySelectorAll('tbody tr')[1]!);
    });
    // The blockquote branch and the header restoration were alternatives: the
    // quote won, the first table lost its header and — down to a single cell —
    // stopped being a table at all, leaving a bare `> a2`.
    expect(md).toContain('> | A1  |');
    expect(md).toContain('> | a2  |');
    expect(md).toContain('> | B1  |');
    expect(md).toContain('> | b2  |');
  });

  it('restores a table header inside a selected list item', () => {
    const doc = setup(
      `<ol start="4"><li>intro<table><thead><tr><th>H</th><th>H2</th></tr></thead>` +
        `<tbody><tr><td>d1</td><td>d2</td></tr></tbody></table></li></ol>`,
    );
    const md = convert(doc, (range) => range.selectNodeContents(doc.querySelector('li')!));
    expect(md).toContain('4. intro');
    expect(md).toContain('| H   | H2  |');
  });
});

describe('чужие атрибуты на странице', () => {
  // The page uses the attribute names the capture marks with — its own values,
  // for its own purposes.
  const OCCUPIED = `<div><table data-s2md-origin="page">
<thead><tr data-s2md-row="head"><th>Name</th></tr></thead>
<tbody><tr data-s2md-row="header"><td>a</td></tr><tr><td>b</td></tr></tbody>
</table><p>after</p></div>`;

  it('gives the page its own attribute values back', () => {
    const doc = setup(OCCUPIED);
    convert(doc, (range) => {
      range.setStartBefore(doc.querySelectorAll('tbody tr')[1]!);
      range.setEndAfter(doc.querySelector('p')!);
    });
    // The cleanup was `removeAttribute`, so a capture deleted what it found.
    expect(doc.querySelector('table')!.getAttribute('data-s2md-origin')).toBe('page');
    expect(doc.querySelector('thead tr')!.getAttribute('data-s2md-row')).toBe('head');
    expect(doc.querySelectorAll('tbody tr')[0]!.getAttribute('data-s2md-row')).toBe('header');
  });

  it('does not read a value the page set as the header mark', () => {
    const doc = setup(OCCUPIED);
    const md = convert(doc, (range) => range.selectNode(doc.querySelectorAll('tbody tr')[0]!));
    // That row says `header` because the page says so. Taken for our mark, it
    // was treated as the header already selected, and `Name` was dropped.
    expect(md).toContain('| Name |');
    expect(md).toContain('| a    |');
  });
});
