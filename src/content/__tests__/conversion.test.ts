import { describe, test, expect } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown } from '../../../core/src/browser.ts';
import { CONVERSION_OPTIONS } from '../raw-mathml-rule.ts';
import { Window as HappyWindow } from 'happy-dom';
import { cloneRangeWithBr, expandRangeToWords, highlightsToMd } from '../capture.ts';

function domAdapter(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

function convert(html: string, opts: Record<string, unknown> = {}): string {
  return toMarkdown(html, { domAdapter, ...opts }).trim();
}

// ---- Inline formatting ----

describe('inline formatting', () => {
  test('bold', () => {
    expect(convert('<strong>bold</strong>')).toBe('**bold**');
  });

  test('italic', () => {
    expect(convert('<em>italic</em>')).toBe('_italic_');
  });

  test('strikethrough', () => {
    expect(convert('<del>strikethrough</del>')).toBe('~~strikethrough~~');
  });

  test('inline code', () => {
    expect(convert('<code>inline code</code>')).toBe('`inline code`');
  });

  test('link', () => {
    expect(convert('<a href="https://example.com">link</a>')).toBe('[link](https://example.com)');
  });

  test('link with relative url becomes absolute with baseUrl', () => {
    const md = convert('<a href="/docs/page">text</a>', { baseUrl: 'https://example.com/root' });
    expect(md).toBe('[text](https://example.com/docs/page)');
  });
});

// ---- Block elements ----

describe('block elements', () => {
  test('h1', () => {
    expect(convert('<h1>Heading</h1>')).toBe('# Heading');
  });

  test('h2', () => {
    expect(convert('<h2>Heading</h2>')).toBe('## Heading');
  });

  test('h3', () => {
    expect(convert('<h3>Heading</h3>')).toBe('### Heading');
  });

  test('heading with offset 1', () => {
    expect(convert('<h1>Top</h1>', { headingOffset: 1 })).toBe('## Top');
    expect(convert('<h2>Sub</h2>', { headingOffset: 1 })).toBe('### Sub');
  });

  test('blockquote', () => {
    expect(convert('<blockquote><p>quote</p></blockquote>')).toBe('> quote');
  });

  test('nested blockquote', () => {
    const html = '<blockquote><blockquote><blockquote><p>deep</p></blockquote></blockquote></blockquote>';
    expect(convert(html)).toBe('> > > deep');
  });

  test('hr', () => {
    expect(convert('<hr>')).toBe('---');
  });

  test('line break in paragraph', () => {
    const md = convert('<p>line<br>break</p>');
    expect(md).toContain('line');
    expect(md).toContain('break');
  });
});

// ---- Lists ----

describe('lists', () => {
  test('unordered list', () => {
    const md = convert('<ul><li>one</li><li>two</li></ul>');
    expect(md).toContain('- one');
    expect(md).toContain('- two');
  });

  test('ordered list', () => {
    const md = convert('<ol><li>first</li><li>second</li></ol>');
    expect(md).toContain('1. first');
    expect(md).toContain('2. second');
  });

  test('ordered list with start attribute', () => {
    const md = convert('<ol start="5"><li>fifth</li><li>sixth</li></ol>');
    expect(md).toContain('5. fifth');
    expect(md).toContain('6. sixth');
  });

  test('nested list', () => {
    const html = '<ul><li>parent<ul><li>child</li></ul></li></ul>';
    const md = convert(html);
    expect(md).toContain('- parent');
    expect(md).toMatch(/  - child/);
  });

  test('task list checked', () => {
    const md = convert('<ul><li><input type="checkbox" checked> done</li></ul>');
    expect(md).toContain('[x]');
  });

  test('task list unchecked', () => {
    const md = convert('<ul><li><input type="checkbox"> todo</li></ul>');
    expect(md).toContain('[ ]');
  });
});

// ---- Code blocks ----

describe('code blocks', () => {
  test('fenced code block with language', () => {
    const md = convert('<pre><code class="language-javascript">const x = 1;</code></pre>');
    expect(md).toContain('```javascript');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  test('fenced code block python', () => {
    const md = convert('<pre><code class="language-python">print("hi")</code></pre>');
    expect(md).toContain('```python');
    expect(md).toContain('print("hi")');
  });
});

// ---- Tables ----

// Table serialization is the part of conversion users see fail: a broken row
// looks like a lost paragraph. These pin the shape of the output, not the
// presence of words — a `toContain('Alice')` passes on a table that no longer
// parses as a table.
describe('tables', () => {
  test('simple table with thead/tbody', () => {
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
      </table>`;
    const lines = convert(html).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\| Name\s+\| Age\s+\|$/);
    expect(lines[1]).toMatch(/^\| -+ \| -+ \|$/);
    expect(lines[2]).toMatch(/^\| Alice\s+\| 30\s+\|$/);
  });

  test('table without thead promotes the first row to the header', () => {
    const html = '<table><tr><td>Name</td><td>Age</td></tr><tr><td>Alice</td><td>30</td></tr></table>';
    const lines = convert(html).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Name');
    expect(lines[1]).toMatch(/^\| -+ \| -+ \|$/);
    expect(lines[2]).toContain('Alice');
  });

  test('pipe inside a cell is escaped instead of breaking the row', () => {
    const html = '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>a|b</td></tr></tbody></table>';
    const lines = convert(html).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('a\\|b');
  });

  test('pipe inside inline code in a cell is escaped too', () => {
    const html = '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td><code>a|b</code></td></tr></tbody></table>';
    const lines = convert(html).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('`a\\|b`');
  });

  test('link in a cell survives as a link', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td><a href="https://example.com">text</a></td></tr></tbody></table>';
    expect(convert(html)).toContain('[text](https://example.com)');
  });

  test('block content in a cell stays on one row', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td><p>para one</p><p>two</p></td></tr></tbody></table>';
    const lines = convert(html).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('para one<br>two');
  });

  test('colspan is flattened onto the grid, not turned into HTML', () => {
    const html = '<table><tr><th colspan="2">Header</th></tr><tr><td>A</td><td>B</td></tr></table>';
    const md = convert(html);
    expect(md).not.toContain('<table>');
    // The header keeps its text where it starts; the position it spanned is empty.
    expect(md.split('\n')[0]).toMatch(/^\| Header\s*\|\s*\|$/);
  });

  test('colspan still reaches HTML when it is asked for', () => {
    const html = '<table><tr><th colspan="2">Header</th></tr><tr><td>A</td><td>B</td></tr></table>';
    const md = convert(html, { complexTableFallback: 'html' });
    expect(md).toContain('<table>');
    expect(md).toContain('colspan="2"');
  });

  test('nested table is kept once, not duplicated', () => {
    const html = '<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>';
    expect(convert(html).match(/inner/g)).toHaveLength(1);
  });

  // The fallback is the one path that emits HTML into the file the user copies
  // and downloads. It builds that HTML here — table, tr, td, th, pre — and
  // carries nothing from the page, so the .md cannot gain behavior or layout.
  test('HTML fallback carries no page markup or attributes', () => {
    const html =
      '<table><tr><td colspan="2" title="&quot;><img src=x onerror=alert(1)>" onclick="steal()">' +
      '<form><input autofocus><button>go</button></form>' +
      '<div style="position:fixed;inset:0">overlay</div></td></tr></table>';
    const md = convert(html, { complexTableFallback: 'html' });
    const reparsed = domAdapter(md);
    expect(reparsed.querySelectorAll('img')).toHaveLength(0);
    expect(reparsed.querySelectorAll('form, input, button, div')).toHaveLength(0);
    for (const attr of ['onerror', 'onclick', 'title', 'style']) expect(md).not.toContain(attr);
    expect(md).toContain('<td colspan="2">');
    expect(md).toContain('go');
    expect(md).toContain('overlay');
  });

  test('HTML fallback keeps preformatted text byte for byte', () => {
    const source = 'def f():\n\n\treturn 1\n';
    const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
    const md = convert(html, { complexTableFallback: 'html' });
    expect(domAdapter(md).querySelector('pre')?.textContent).toBe(source);
    // A blank line here would end the HTML block and hand the rest of the table
    // to the Markdown parser as text.
    expect(md).not.toMatch(/\n[ \t]*\n/);
  });

  test('HTML fallback keeps list items separate instead of gluing them', () => {
    const html =
      '<table><thead><tr><th>Items</th></tr></thead><tbody><tr><td><ul><li>a</li><li>b</li></ul></td></tr></tbody></table>';
    const md = convert(html);
    expect(md).toContain('- a');
    expect(md).toContain('- b');
    expect(md).not.toContain('>ab<');
  });
});

// ---- Images ----

describe('images', () => {
  test('img with alt', () => {
    expect(convert('<img src="photo.jpg" alt="A photo">')).toBe('![A photo](photo.jpg)');
  });

  test('figure with figcaption', () => {
    const html = '<figure><img src="fig.png" alt="desc"><figcaption>Caption text</figcaption></figure>';
    const md = convert(html);
    expect(md).toContain('![');
    expect(md).toContain('fig.png');
  });
});

// ---- Edge cases ----

describe('edge cases', () => {
  test('HTML the page showed as text is escaped, not passed through', () => {
    // Passing it through was the bug: Markdown carries raw HTML, so a page about
    // HTML lost the text it was showing — this one rendered as actual bold.
    const html = '<p>&lt;strong&gt;bold&lt;/strong&gt;</p>';
    expect(convert(html)).toBe('\\<strong>bold\\</strong>');
  });

  test('empty paragraph produces no output', () => {
    expect(convert('<p></p>')).toBe('');
  });

  test('plain text', () => {
    expect(convert('<p>hello world</p>')).toBe('hello world');
  });
});

// ---- What the extension actually converts with ----

// The content script builds its own fragment and calls toMarkdown(), so it gets
// the library default — a whole page — unless CONVERSION_OPTIONS says otherwise.
// It said nothing, and a selected `<nav>` was deleted on the way to the panel.
// Wrapped in <body> so the sanitizer walks one root; a multi-root fragment
// string is read differently by linkedom, which is beside the point here.
describe('selection mode: the extension keeps what a person selected', () => {
  const withExtensionOptions = (html: string): string =>
    toMarkdown(`<body>${html}</body>`, { domAdapter, ...CONVERSION_OPTIONS }).trim();

  const furniture: Array<[string, string, string]> = [
    ['nav', '<nav><a href="/docs">Docs</a></nav>', 'Docs'],
    ['header', '<header><p>Masthead</p></header>', 'Masthead'],
    ['footer', '<footer><p>Copyright</p></footer>', 'Copyright'],
    ['aside', '<aside><p>Sidebar note</p></aside>', 'Sidebar note'],
  ];

  for (const [tag, html, text] of furniture) {
    test(`a selected <${tag}> survives, while the library default drops it`, () => {
      expect(withExtensionOptions(html)).toContain(text);
      expect(convert(`<body>${html}</body>`)).not.toContain(text);
    });
  }

  test('an <aside> a drag crossed comes along with the prose around it', () => {
    const md = withExtensionOptions('<p>Above</p><aside><p>Pull quote</p></aside><p>Below</p>');
    expect(md).toContain('Above');
    expect(md).toContain('Pull quote');
    expect(md).toContain('Below');
  });
});

// What the capture ships with, and the reason it is not a fixed shift: an
// answer on claude.ai is written under `<h3>`, so `headingOffset: 1` produced a
// file starting at `####` with no `#`, `##` or `###` above it anywhere.
describe('heading levels the extension writes', () => {
  const withExtensionOptions = (html: string): string =>
    toMarkdown(`<body>${html}</body>`, { domAdapter, ...CONVERSION_OPTIONS }).trim();

  test('a page that starts at h3 comes back starting at ##', () => {
    expect(withExtensionOptions('<h3>Answer</h3><h4>Detail</h4>')).toBe('## Answer\n\n### Detail');
  });

  test('a page that starts at h1 keeps it', () => {
    expect(withExtensionOptions('<h1>Article</h1><h2>Section</h2>')).toBe(
      '# Article\n\n## Section',
    );
  });

  // A page captured in several goes: each press is its own conversion, so the
  // second one is told where the first started. Without it, capture a section's
  // `<h2>` and then the `<h3>` under it and both arrive as `##`.
  test('a second press keeps its distance from the first', () => {
    const window = new HappyWindow();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML = '<h2 id="a">Section</h2><h3 id="b">Under it</h3>';
    const press = (id: string, headingBase?: number) =>
      highlightsToMd([doc.getElementById(id)!], doc, { headingBase });

    const first = press('a');
    expect(first.md.trim()).toBe('## Section');
    expect(first.topLevel).toBe(2);
    // On its own the second press answers `## Under it`; told where the first
    // one started, it keeps the rank the reader saw.
    expect(press('b').md.trim()).toBe('## Under it');
    expect(press('b', first.topLevel).md.trim()).toBe('### Under it');
  });

  test('one base for a capture of several fragments, so ranks stay apart', () => {
    const window = new HappyWindow();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML = '<h2 id="a">Section</h2><h3 id="b">Under it</h3>';
    const md = highlightsToMd([doc.getElementById('a')!, doc.getElementById('b')!], doc).md;
    // Converted fragment by fragment, each would put its own heading at `##`.
    expect(md).toContain('## Section');
    expect(md).toContain('### Under it');
  });
});

// The capture reads a page, and the only global it may count on is the one the
// page hands it: a `document`. `Node` is not that — under happy-dom it does not
// exist, and the two paths that named it threw a `ReferenceError` that the fault
// handling around a capture swallows, so the failure arrived as an empty file
// rather than as an error. The tests here had been lending the global back,
// which hid the condition instead of removing it.
describe('the capture names no global the page does not give it', () => {
  test('the highlighter path runs with no Node global at all', () => {
    expect((globalThis as { Node?: unknown }).Node).toBeUndefined();
    const window = new HappyWindow();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML = '<p id="a">First.</p><p id="b">Second.</p>';
    // Out of document order on purpose: this is the sort that read
    // `Node.DOCUMENT_POSITION_FOLLOWING`.
    const md = highlightsToMd([doc.getElementById('b')!, doc.getElementById('a')!], doc).md;
    expect(md.indexOf('First.')).toBeLessThan(md.indexOf('Second.'));
  });

  test('a range that starts mid-word is still expanded', () => {
    expect((globalThis as { Node?: unknown }).Node).toBeUndefined();
    const window = new HappyWindow();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML = '<p>alpha bravo charlie</p>';
    const text = doc.querySelector('p')!.firstChild!;
    const range = doc.createRange();
    range.setStart(text, 8);
    range.setEnd(text, 9);
    const out = expandRangeToWords(range);
    expect(out.toString()).toBe('bravo');
  });
});

// The bubble is an element on the page like any other, so a Cmd+A selection
// covered it and every full-page capture ended with the words `add to .md`.
describe('the extension does not capture itself', () => {
  test('drops its own bubble and hover outline from the clone', () => {
    const window = new HappyWindow();
    const doc = window.document as unknown as Document;
    doc.body.innerHTML =
      '<p>Page text.</p><div id="tomd-bubble">add to .md</div>' +
      '<div id="s2md-hover">outline</div>';
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    const md = toMarkdown(cloneRangeWithBr(range), { ...CONVERSION_OPTIONS });
    expect(md).toContain('Page text.');
    expect(md).not.toContain('add to .md');
    expect(md).not.toContain('outline');
  });
});
