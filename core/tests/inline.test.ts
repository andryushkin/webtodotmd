import { describe, it, expect, beforeAll } from 'bun:test';
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

// CommonMark decides emphasis from the two characters around the delimiters, not
// from the tags in the source. Emitting `_x_` regardless produced text where the
// page had italics: the reader lost the formatting and gained the underscores.
describe('emphasis whose delimiters would not flank', () => {
  it.each([
    // The preferred marker is kept wherever it renders — ordinary pages are
    // unaffected, which is what makes the fallback safe to add.
    ['plain italic', '<p><em>italic</em></p>', '_italic_'],
    ['plain bold', '<p><strong>bold</strong></p>', '**bold**'],
    ['italic between spaces', '<p>a <em>b</em> c</p>', 'a _b_ c'],

    // `_` cannot open against a word, and `*` cannot open against punctuation,
    // so content that is punctuation pressed against a word has no marker left.
    ['asterisks against a word', '<p>word<i>**</i></p>', 'word<em>\\*\\*</em>'],
    ['equals signs before a word', '<p><em>===</em>x</p>', '<em>===</em>x'],
    ['paren after a word', '<p>text<em>)</em></p>', 'text<em>)</em>'],
    ['dashes before a word', '<p><strong>---</strong>a</p>', '<strong>---</strong>a'],
    ['tildes after a word', '<p>x<strong>~~</strong></p>', 'x<strong>\\~\\~</strong>'],

    // A `_` that cannot open still leaves `*`, which has no intraword rule.
    ['italic inside a word', '<p>snake<em>case</em>word</p>', 'snake*case*word'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// From the same review: repairs that broke neighbouring behaviour.
describe('code spans that nest', () => {
  it.each([
    ['kbd inside code', '<p><code>press <kbd>X</kbd></code></p>', '`press X`'],
    ['samp inside samp', '<p><samp>a<samp>b</samp>c</samp></p>', '`abc`'],
    ['code inside pre stays a fence', '<pre><code>x</code></pre>', '```\nx\n```'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

describe('link scheme check in an HTML fallback cell', () => {
  const cell = (href: string) =>
    `<table><tbody><tr><td colspan="2"><a href="${href}">t</a></td></tr><tr><td>a</td><td>b</td></tr></tbody></table>`;

  const toHtmlTable = (html: string) => toMarkdown(html, { complexTableFallback: 'html' });

  it.each([
    ['https', 'https://e.com', true],
    ['mailto', 'mailto:a@e.com', true],
    // Relative URLs may contain a colon; matching "no colon anywhere" dropped them.
    ['relative with a colon', '2024:notes.html', true],
    ['query with a colon', '?filter=a:b', true],
    ['javascript', 'javascript:alert(1)', false],
  ])('%s', (_name, href, kept) => {
    const md = toHtmlTable(cell(href));
    expect(md.includes('<a href=')).toBe(kept);
    expect(md).toContain('t');
  });
});

// An attribute is page input dropped straight inside the converter's own syntax
// — `[text](href)`, `![alt](src 'title')`, the info string after a fence — and
// nothing encoded it for that position. A value could therefore end the
// construct from inside, and whatever followed stopped being text: the URL's own
// tail, a paragraph of the page, the whole of a code block.
describe('значения атрибутов в синтаксисе markdown', () => {
  it('a scheme that cannot be followed costs the link, not the text', () => {
    expect(toMarkdown('<p><a href="javascript:alert(1)">click</a></p>')).toBe('click\n');
  });

  it.each([
    ['https', 'https://e.com/a', '[t](https://e.com/a)'],
    ['mailto', 'mailto:a@e.com', '[t](mailto:a@e.com)'],
    ['relative with a colon', '2024:notes.html', '[t](2024:notes.html)'],
  ])('an ordinary href is written as it always was: %s', (_name, href, expected) => {
    expect(toMarkdown(`<p><a href="${href}">t</a></p>`).trim()).toBe(expected);
  });

  it.each([
    // A newline ends the destination and the rest of the attribute starts a new
    // paragraph — as markup, since Markdown carries raw HTML.
    ['newline', 'https://e.com/x\n\n<b>y</b>', '[t](https://e.com/x%0A%0A%3Cb%3Ey%3C/b%3E)'],
    // A space ends it just as well, and an unquoted URL is where spaces live.
    ['space', 'https://e.com/a b.png', '[t](https://e.com/a%20b.png)'],
    // A code span outranks a link, so a backtick can swallow the `)` and beyond.
    ['backtick', 'https://e.com/a`b', '[t](https://e.com/a%60b)'],
    // `<` in first position asks for the angle-bracket form, which this is not.
    ['angle bracket', '<https://e.com/a>', '[t](%3Chttps://e.com/a%3E)'],
    // Parentheses are read as balanced pairs: a lone one closes the link and the
    // remainder of the URL is left standing in the paragraph as text.
    ['unbalanced close', 'https://e.com/a)b', '[t](https://e.com/a\\)b)'],
    ['unbalanced open', 'https://e.com/a(b', '[t](https://e.com/a\\(b)'],
    // Balanced ones have always rendered — most of Wikipedia is this URL — so a
    // backslash there would be a character the reader pays for and gains nothing by.
    ['balanced pair', 'https://e.com/Foo_(bar)', '[t](https://e.com/Foo_(bar))'],
    // A backslash is always escaped: left alone it would either escape the
    // closing delimiter or turn the parenthesis after it into an escaped one.
    ['backslash', 'https://e.com/a\\b', '[t](https://e.com/a\\\\b)'],
  ])('href with a %s', (_name, href, expected) => {
    const doc = `<p><a href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">t</a></p>`;
    expect(toMarkdown(doc).trim()).toBe(expected);
  });

  it('src is encoded the same way, in the same position', () => {
    expect(toMarkdown('<img src="https://e.com/a b.png" alt="x">').trim()).toBe(
      '![x](https://e.com/a%20b.png)',
    );
  });

  it.each([
    // The label is parsed as inline content, and `alt` never went through the
    // text escaper — it is an attribute, not a text node.
    ['closing bracket', 'left]right', '![left\\]right](x.png)'],
    ['opening bracket', 'a[b', '![a\\[b](x.png)'],
    ['backtick', 'a`b', '![a\\`b](x.png)'],
    ['backslash', 'a\\b', '![a\\\\b](x.png)'],
    // Emphasis cannot break the label, so it is left alone: a backslash there
    // would surface in the alt text a reader sees when the image fails to load.
    ['asterisks', 'a*b*c', '![a*b*c](x.png)'],
  ])('alt with a %s', (_name, alt, expected) => {
    const doc = `<img src="x.png" alt="${alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
    expect(toMarkdown(doc).trim()).toBe(expected);
  });

  it.each([
    ['an apostrophe closes the title early', "Bob's photo", "![a](x.png 'Bob\\'s photo')"],
    ['a backslash would escape the quote after it', 'a\\b', "![a](x.png 'a\\\\b')"],
    // A blank line inside the title ends the paragraph and leaves the whole
    // construct as source. A title is a tooltip; it has no lines to keep.
    ['a blank line', 'a\n\nb', "![a](x.png 'a b')"],
  ])('title with %s', (_name, title, expected) => {
    const doc = `<img src="x.png" alt="a" title="${title.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
    expect(toMarkdown(doc).trim()).toBe(expected);
  });

  it('an alt with no src lands as ordinary text and is escaped like it', () => {
    // Without a URL the alt is all that is left, and it goes into the document
    // as prose — where `<b>` is a tag and `**x**` is bold.
    expect(toMarkdown('<p><img alt="&lt;b&gt;**x**"></p>').trim()).toBe('\\<b>\\*\\*x\\*\\*');
  });

  it.each([
    // `data-lang` is page input written straight after the opening fence: a
    // newline and three backticks in it closed the fence on the spot, and the
    // code — and everything under it — was read as markup.
    ['fence and payload', 'js\n```\n<b>y</b>', '```\nsafe\n```'],
    ['a space', 'js onload=alert(1)', '```\nsafe\n```'],
    ['a backtick', 'j`s', '```\nsafe\n```'],
    // A name that is a name is kept, punctuation and all.
    ['a plain name', 'rust', '```rust\nsafe\n```'],
    ['punctuation real names carry', 'c++', '```c++\nsafe\n```'],
    ['a sharp', 'f#', '```f#\nsafe\n```'],
  ])('data-lang with %s', (_name, lang, expected) => {
    const attr = lang.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    expect(toMarkdown(`<pre><code data-lang="${attr}">safe</code></pre>`).trim()).toBe(expected);
  });
});
