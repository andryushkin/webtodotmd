import { describe, test, expect } from 'bun:test';
import { parseHTML } from '~/Server/markitdown/node_modules/linkedom/esm/index.js';
import { toMarkdown } from '~/Server/markitdown/src/browser.ts';

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

describe('tables', () => {
  test('simple table with thead/tbody', () => {
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
      </table>`;
    const md = convert(html);
    expect(md).toContain('Name');
    expect(md).toContain('Age');
    expect(md).toContain('Alice');
    expect(md).toContain('---');
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
  test('HTML entity text is preserved as-is in markdown output', () => {
    // &lt;strong&gt; in DOM becomes text <strong>, which markitdown passes through as text
    const html = '<p>&lt;strong&gt;bold&lt;/strong&gt;</p>';
    const md = convert(html);
    expect(md).toContain('<strong>bold</strong>');
  });

  test('empty paragraph produces no output', () => {
    expect(convert('<p></p>')).toBe('');
  });

  test('plain text', () => {
    expect(convert('<p>hello world</p>')).toBe('hello world');
  });
});
