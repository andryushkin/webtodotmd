import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('bold', () => {
  it('strong tag', () => {
    expect(toMarkdown('<strong>text</strong>')).toBe('**text**\n');
  });

  it('b tag', () => {
    expect(toMarkdown('<b>text</b>')).toBe('**text**\n');
  });

  it('empty strong — не оборачивать', () => {
    expect(toMarkdown('<strong></strong>')).toBe('\n');
  });

  it('только пробелы — не оборачивать', () => {
    // trailing space stripped by normalizer
    expect(toMarkdown('<strong> </strong>')).toBe('\n');
  });

  it('flanking: пробелы внутри выносятся наружу', () => {
    // paragraph .trim() strips outer trailing space
    expect(toMarkdown('<p><strong> text </strong></p>')).toBe('**text**\n');
  });
});

describe('italic', () => {
  it('em tag', () => {
    expect(toMarkdown('<em>text</em>')).toBe('_text_\n');
  });

  it('i tag', () => {
    expect(toMarkdown('<i>text</i>')).toBe('_text_\n');
  });

  it('empty em — не оборачивать', () => {
    expect(toMarkdown('<em></em>')).toBe('\n');
  });

  it('flanking: пробелы внутри выносятся наружу', () => {
    expect(toMarkdown('<p><em> text </em></p>')).toBe('_text_\n');
  });
});

describe('strikethrough', () => {
  it('del tag', () => {
    expect(toMarkdown('<del>text</del>')).toBe('~~text~~\n');
  });

  it('s tag', () => {
    expect(toMarkdown('<s>text</s>')).toBe('~~text~~\n');
  });

  it('empty del — не оборачивать', () => {
    expect(toMarkdown('<del></del>')).toBe('\n');
  });
});

describe('sub / sup', () => {
  it('sub — HTML passthrough', () => {
    expect(toMarkdown('<sub>2</sub>')).toBe('<sub>2</sub>\n');
  });

  it('sup — HTML passthrough', () => {
    expect(toMarkdown('<sup>2</sup>')).toBe('<sup>2</sup>\n');
  });

  it('sub внутри параграфа', () => {
    expect(toMarkdown('<p>H<sub>2</sub>O</p>')).toBe('H<sub>2</sub>O\n');
  });

  it('sup внутри параграфа', () => {
    expect(toMarkdown('<p>x<sup>2</sup></p>')).toBe('x<sup>2</sup>\n');
  });
});

describe('inline code', () => {
  it('code не внутри pre', () => {
    expect(toMarkdown('<code>foo()</code>')).toBe('`foo()`\n');
  });

  it('empty code — не оборачивать', () => {
    expect(toMarkdown('<code></code>')).toBe('\n');
  });

  it('flanking: пробелы внутри выносятся наружу', () => {
    expect(toMarkdown('<p><code> x </code></p>')).toBe('`x`\n');
  });

  it('code внутри pre — не срабатывает (обрабатывается как текст)', () => {
    const result = toMarkdown('<pre><code>block code</code></pre>');
    // code внутри pre не должен превращаться в `block code`
    expect(result).not.toContain('`block code`');
  });
});

describe('links', () => {
  it('a с href', () => {
    expect(toMarkdown('<a href="https://example.com">Example</a>')).toBe(
      '[Example](https://example.com)\n',
    );
  });

  it('a без href — fallback to childContent', () => {
    expect(toMarkdown('<a>anchor text</a>')).toBe('anchor text\n');
  });

  it('a с пустым текстом', () => {
    expect(toMarkdown('<a href="https://example.com"></a>')).toBe('\n');
  });

  it('a с пробельным текстом — не оборачивать', () => {
    // trailing space stripped by normalizer
    expect(toMarkdown('<a href="https://example.com"> </a>')).toBe('\n');
  });

  it('flanking: пробелы внутри выносятся наружу', () => {
    expect(toMarkdown('<p><a href="https://example.com"> link </a>.</p>')).toBe(
      '[link](https://example.com) .\n',
    );
  });

  it('baseUrl разрешает относительный URL', () => {
    expect(toMarkdown('<a href="/path/page">Page</a>', { baseUrl: 'https://example.com' })).toBe(
      '[Page](https://example.com/path/page)\n',
    );
  });

  it('baseUrl не трогает абсолютный URL', () => {
    expect(
      toMarkdown('<a href="https://other.com">Other</a>', { baseUrl: 'https://example.com' }),
    ).toBe('[Other](https://other.com)\n');
  });
});

describe('images', () => {
  it('img с src и alt', () => {
    expect(toMarkdown('<img src="photo.jpg" alt="Photo">')).toBe('![Photo](photo.jpg)\n');
  });

  it('img без alt', () => {
    expect(toMarkdown('<img src="photo.jpg">')).toBe('![](photo.jpg)\n');
  });

  it('img без src — вернуть alt', () => {
    expect(toMarkdown('<img alt="description">')).toBe('description\n');
  });

  it('img без src и без alt — пустая строка', () => {
    expect(toMarkdown('<img>')).toBe('\n');
  });

  it('baseUrl разрешает относительный src', () => {
    expect(
      toMarkdown('<img src="/images/photo.jpg" alt="Photo">', {
        baseUrl: 'https://example.com',
      }),
    ).toBe('![Photo](https://example.com/images/photo.jpg)\n');
  });

  it('alt с переносами строк — нормализуется в пробел', () => {
    expect(toMarkdown('<img src="x.jpg" alt="line1\nline2">')).toBe('![line1 line2](x.jpg)\n');
  });
});

describe('nested inline', () => {
  it('strong > em', () => {
    expect(toMarkdown('<strong><em>text</em></strong>')).toBe('**_text_**\n');
  });

  it('em > strong', () => {
    expect(toMarkdown('<em><strong>text</strong></em>')).toBe('_**text**_\n');
  });

  it('em > code', () => {
    expect(toMarkdown('<em><code>x</code></em>')).toBe('_`x`_\n');
  });

  it('strong > del', () => {
    expect(toMarkdown('<strong><del>text</del></strong>')).toBe('**~~text~~**\n');
  });

  it('a с вложенным em', () => {
    expect(toMarkdown('<a href="https://example.com"><em>link</em></a>')).toBe(
      '[_link_](https://example.com)\n',
    );
  });
});

describe('flanking whitespace', () => {
  it('ведущий пробел выносится наружу bold (double space — text node + extracted)', () => {
    // text node has trailing space, plus extracted leading space from strong → double space
    expect(toMarkdown('<p>text <strong> bold</strong></p>')).toBe('text  **bold**\n');
  });

  it('trailing пробел выносится наружу italic (double space — extracted + text node)', () => {
    // extracted trailing space from em, plus text node leading space → double space
    expect(toMarkdown('<p><em>italic </em> text</p>')).toBe('_italic_  text\n');
  });

  it('оба пробела выносятся наружу del', () => {
    expect(toMarkdown('<p>a<del> x </del>b</p>')).toBe('a ~~x~~ b\n');
  });
});
