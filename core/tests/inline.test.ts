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
    expect(toMarkdown('<sub>2</sub>')).toBe('₂\n');
  });

  it('sup — HTML passthrough', () => {
    expect(toMarkdown('<sup>2</sup>')).toBe('²\n');
  });

  it('sub внутри параграфа', () => {
    expect(toMarkdown('<p>H<sub>2</sub>O</p>')).toBe('H₂O\n');
  });

  it('sup внутри параграфа', () => {
    expect(toMarkdown('<p>x<sup>2</sup></p>')).toBe('x²\n');
  });
});

// A reading welded onto its word is a corruption, not a blemish: `漢字かんじ`
// says nothing about where the word stops and the reading starts, and a search
// for either fails on the joined form. Parentheses are how plain text has always
// written a reading, and they keep the two strings separable.
describe('ruby annotation: the reading goes in parentheses', () => {
  it('furigana above a Japanese word', () => {
    expect(toMarkdown('<body><ruby>漢字<rt>かんじ</rt></ruby></body>')).toBe('漢字(かんじ)\n');
  });

  it('pinyin above a Chinese word', () => {
    expect(toMarkdown('<body><ruby>中文<rt>zhōngwén</rt></ruby></body>')).toBe('中文(zhōngwén)\n');
  });

  // Per character, which is the commonest real shape: each reading stays beside
  // the character it belongs to, where the reader saw it.
  it('one annotation per character', () => {
    expect(toMarkdown('<body><ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby></body>')).toBe(
      '漢(かん)字(じ)\n',
    );
  });

  it('inside a sentence, with the words on either side left where they were', () => {
    expect(
      toMarkdown('<body><p>The word <ruby>漢字<rt>かんじ</rt></ruby> means characters.</p></body>'),
    ).toBe('The word 漢字(かんじ) means characters.\n');
  });

  // `<rb>` is the base in the older spelling and needs no rule of its own: the
  // default one hands back its children, and its children are the word.
  it('rb, the older spelling of the base', () => {
    expect(toMarkdown('<body><ruby><rb>漢字</rb><rt>かんじ</rt></ruby></body>')).toBe(
      '漢字(かんじ)\n',
    );
  });

  // The annotation is content like any other, so markup inside it converts.
  it('an annotation with markup of its own', () => {
    expect(toMarkdown('<body><ruby>漢字<rt><em>かんじ</em></rt></ruby></body>')).toBe(
      '漢字(*かんじ*)\n',
    );
  });

  // `<rp>` carries the parentheses a browser without ruby support would show, and
  // every browser that has ruby hides it. Keeping the page's pair as well as this
  // rule's would give `漢字((かんじ))`; dropping it leaves both readers — the one
  // who saw the parentheses and the one who did not — with the same two
  // characters in the same place.
  it('rp does not double the parentheses', () => {
    expect(
      toMarkdown('<body><ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby></body>'),
    ).toBe('漢字(かんじ)\n');
  });

  // The same document as the extension sees it. The content script's snapshot
  // records the UA `display:none` on `<rp>`, so the sanitizer takes the element
  // before any rule runs — and until `<rp>` was dropped by rule, that path and a
  // library caller with no snapshot answered differently about the same page.
  it('rp hidden by the style snapshot gives the same answer', () => {
    const hidden = 'data-s2md-style="display:none"';
    expect(
      toMarkdown(
        `<body><ruby>漢字<rp ${hidden}>(</rp><rt>かんじ</rt><rp ${hidden}>)</rp></ruby></body>`,
      ),
    ).toBe('漢字(かんじ)\n');
  });

  // Parentheses around nothing are two characters the page never showed.
  it('an empty annotation writes nothing', () => {
    expect(toMarkdown('<body><ruby>漢字<rt></rt></ruby></body>')).toBe('漢字\n');
  });

  it('a whitespace-only annotation writes nothing', () => {
    expect(toMarkdown('<body><ruby>漢字<rt>  </rt></ruby></body>')).toBe('漢字\n');
  });

  it('a ruby with no annotation at all is its base', () => {
    expect(toMarkdown('<body><ruby>漢字</ruby></body>')).toBe('漢字\n');
  });

  // The text escaper judges a `]` by the page's own text ahead of it and cannot
  // see a parenthesis this rule invents, so a base ending in one assembled
  // `[x](y)`: a link whose target was the reading and whose brackets left the
  // page. `\(` renders as `(`, so the reader sees the same characters.
  it('a base ending in a bracket does not assemble a link', () => {
    expect(toMarkdown('<body><p><ruby>[x]<rt>y</rt></ruby></p></body>')).toBe('[x]\\(y)\n');
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
  it('ведущий пробел выносится наружу bold (one space at the seam)', () => {
    // The space still comes out from between the delimiters; what it meets is
    // the text node's own trailing space, and two collapsible runs that meet
    // are one space on screen, so one of them reaches the file.
    expect(toMarkdown('<p>text <strong> bold</strong></p>')).toBe('text **bold**\n');
  });

  it('trailing пробел выносится наружу italic (one space at the seam)', () => {
    expect(toMarkdown('<p><em>italic </em> text</p>')).toBe('_italic_ text\n');
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

// Two wrappers pressed together put their delimiters side by side, and the pair
// merges into one longer run: `*a**b*` is a single emphasis around `a**b`, so the
// second wrapper is gone and the reader gains asterisks the page never showed.
// The element that follows drops to its tag, which has no delimiter to merge.
describe('соседние выделения', () => {
  it.each([
    ['italic pair', '<p><em>a</em><em>b</em></p>', '_a_<em>b</em>'],
    ['bold pair', '<p><strong>a</strong><strong>b</strong></p>', '**a**<strong>b</strong>'],
    ['strikethrough pair', '<p><del>a</del><del>b</del></p>', '~~a~~<del>b</del>'],
    ['the other spellings of the same pair', '<p><i>a</i><em>b</em></p>', '_a_<em>b</em>'],
    // Bold and italic draw from the same two characters, so `**a***b*` collides
    // exactly as a matching pair does.
    ['bold then italic', '<p><strong>a</strong><em>b</em></p>', '**a**<em>b</em>'],
    ['three in a row', '<p><em>a</em><em>b</em><em>c</em></p>', '_a_<em>b</em><em>c</em>'],
    // Whichever side it comes from, a space already parts the delimiters and both
    // wrappers keep the lighter spelling.
    ['parted by a text node', '<p><em>a</em> <em>b</em></p>', '_a_ _b_'],
    ['parted by a space inside the first', '<p><em>a </em><em>b</em></p>', '_a_ _b_'],
    ['parted by a space inside the second', '<p><em>a</em><em> b</em></p>', '_a_ _b_'],
    // The neighbour is found through a wrapper that emits nothing of its own.
    ['through a span', '<p><span><em>a</em></span><em>b</em></p>', '_a_<em>b</em>'],

    // Other delimiters do not collide with emphasis, so nothing gives way. A code
    // span is read for its text rather than its backtick: emphasis is resolved
    // after code spans, and renderers disagree about what is left at that seam.
    ['a code span next door', '<p><em>a</em><code>b</code></p>', '*a*`b`'],
        // A shifted run is letters now, not a tag, so the neighbour picks the marker
    // a letter after it allows: `_a_b` would render as its own underscores.
    ['a sub next door', '<p><em>a</em><sub>b</sub></p>', '*a*b'],

    // Flanking is decided per code point. Indexing UTF-16 handed the test half a
    // surrogate pair, which is in no category at all: an emoji is symbol
    // punctuation, so pressed against letters no marker can open and `a*😀*b`
    // rendered with the asterisks showing and no emphasis at all.
    ['emoji against words', '<p>a<em>😀</em>b</p>', 'a<em>😀</em>b'],
    ['emoji at the line edges', '<p><em>😀</em></p>', '_😀_'],

    // A neighbour is judged by its tag, and the tag comes off the page. An object
    // literal answered `constructor` with a function, which read as an emphasis
    // wrapper — so the `<em>` gave up `*b*` for a tag against a delimiter no
    // `<constructor>` element ever writes.
    ['an element named after Object.prototype', '<p><constructor>a</constructor><em>b</em></p>', 'a*b*'],
    ['an ordinary unknown element', '<p><foo>a</foo><em>b</em></p>', 'a*b*'],

    // A style inside a code span reaches no output: the code rule takes its
    // element's text. Looking into one found a syntax highlighter's
    // `font-weight` and made the `<em>` after the span give way to a delimiter
    // that was really a backtick — and a highlighter puts such a span inside
    // every `<code>` on an ordinary documentation page.
    [
      'a styled run inside a code span',
      '<p><code><span style="font-weight:700">a</span></code><em>b</em></p>',
      '`a`*b*',
    ],
    [
      'a bold tag inside a code span',
      '<p><code>a<b>b</b></code><em>c</em></p>',
      '`ab`*c*',
    ],
    [
      'a styled run inside a formula',
      '<p><span class="katex"><span style="font-weight:700">a</span></span><em>b</em></p>',
      'a*b*',
    ],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// Two wrappers collide only when their delimiters really do meet, and a line
// ending between them means they never do. The search for the neighbour skipped
// anything holding no text, so it read straight past a `<br>` to the wrapper on
// the line above: `<em>a</em><br><em>b</em>` was judged a collision and the second
// wrapper gave up `_b_` — which renders perfectly on a line of its own — for a
// tag. The character each end is pressed against comes from the same search, so a
// wrapper at the start of a line was reading the one before the break.
describe('перенос строки разделяет соседей', () => {
  it.each([
    ['an italic pair', '<p><em>a</em><br><em>b</em></p>', '_a_\\\n_b_'],
    ['a bold pair', '<p><strong>a</strong><br><strong>b</strong></p>', '**a**\\\n**b**'],
    ['a strikethrough pair', '<p><del>a</del><br><del>b</del></p>', '~~a~~\\\n~~b~~'],
    // The break may sit inside the wrapper in front and still end the line.
    ['a break inside the wrapper in front', '<p><span><em>a</em><br></span><em>b</em></p>', '_a_\\\n_b_'],
    // A block ends a line as surely as a break does, and an `<hr>` writes one of
    // its own.
    ['a block between them', '<div><em>a</em><p>x</p><em>b</em></div>', '_a_\n\nx\n\n_b_'],
    ['a rule between them', '<div><em>a</em><hr><em>b</em></div>', '_a_\n\n---\n\n_b_'],

    // The neighbouring character, not just the neighbouring wrapper: `_` never
    // works inside a word, and the word was on the other line.
    ['the letter before the break is not the one in front', '<p>a<br><em>b</em></p>', 'a\\\n_b_'],
    ['nor the one after it behind', '<p><em>a</em><br>b</p>', '_a_\\\nb'],

    // On one line the collision is real and the second wrapper still gives way.
    ['a pair on the same line still collides', '<p><em>a</em><em>b</em></p>', '_a_<em>b</em>'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// Nothing is parsed inside a code span, so every mark in one is a character the
// reader sees. The rule wrapped the converted children, which put the emphasis
// delimiters of `<code><strong>token</strong></code>` into the file as text.
describe('code span не показывает разметку', () => {
  it.each([
    ['bold inside code', '<p><code><strong>token</strong></code></p>', '`token`'],
    ['italic inside kbd', '<p><kbd><em>Ctrl</em></kbd></p>', '`Ctrl`'],
    ['a link inside code', '<p><code><a href="https://e.com">x</a></code></p>', '`x`'],
    // A <br> is the one child that is not text and is still something the reader
    // saw; a span renders its newlines as spaces, so that is what it becomes.
    ['a break inside code', '<p><code>a<br>b</code></p>', '`a b`'],

    // Adjacent spans merge their backticks into one run — `` `word``hello world` ``
    // is a single span whose text carries two backticks — and no delimiter length
    // separates them, so the run is written as the one span the page looked like.
    ['adjacent spans', '<p><code>word</code><code>hello world</code></p>', '`wordhello world`'],
    ['three spans', '<p><code>a</code><code>b</code><code>c</code></p>', '`abc`'],
    ['a span and a kbd', '<p><code>a</code><kbd>b</kbd></p>', '`ab`'],
    ['merged text still sizes the delimiter', '<p><code>a`b</code><code>c</code></p>', '`` a`bc ``'],
    ['text on both sides', '<p>x<code>a</code><code>b</code>y</p>', 'x`ab`y'],
    // A space already parts the backticks, so the two spans stay two.
    ['parted by a text node', '<p><code>a</code> <code>b</code></p>', '`a` `b`'],
    // Reaching through a wrapper would move `b` inside the emphasis, so it is not
    // done — and here the closing `_` parts the backticks anyway.
    ['not merged across a wrapper', '<p><em><code>a</code></em><code>b</code></p>', '<em>`a`</em>`b`'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// The two spans merge because nothing stood between them, and emptiness of
// `textContent` was the test for that. It is a different question: a `<br>` and an
// `<img>` hold no text and are exactly what the reader saw in between. Stepping
// over one welded two lines into one and left the break at the end of the merged
// span, and moved the picture behind text it had been standing in front of.
describe('пустой сосед не сливает спаны', () => {
  it.each([
    ['a break between them', '<p><code>a</code><br><code>b</code></p>', '`a`\\\n`b`'],
    [
      'an image between them',
      '<p><code>a</code><img src="https://e.com/i.png" alt="P"><code>b</code></p>',
      '`a`![P](https://e.com/i.png)`b`',
    ],
    // Neither the break nor the picture has to be the sibling itself: a wrapper
    // is only as empty as what it holds.
    ['a break inside a wrapper', '<p><code>a</code><span><br></span><code>b</code></p>', '`a`\\\n`b`'],
    [
      'a picture inside a wrapper',
      '<p><code>a</code><picture><img src="https://e.com/i.png" alt="P"></picture><code>b</code></p>',
      '`a`![P](https://e.com/i.png)`b`',
    ],
    // An empty `<sub>` writes nothing now that it shifts to Unicode, so it parts
    // nothing either and the two spans merge — which is what any other empty
    // wrapper between them already did. An `<hr>` still writes its rule.
    ['an empty sub no longer parts them', '<p><code>a</code><sub></sub><code>b</code></p>', '`ab`'],
    ['a rule between them', '<div><code>a</code><hr><code>b</code></div>', '`a`\n\n---\n\n`b`'],
    ['every span keeps its own delimiters', '<p><code>a`b</code><br><code>c</code></p>', '`` a`b ``\\\n`c`'],
    ['a run of them', '<p><code>a</code><br><code>b</code><br><code>c</code></p>', '`a`\\\n`b`\\\n`c`'],

    // What really writes nothing is still stepped over — and has to be, since the
    // spans are then adjacent in the file and their backticks would run together.
    ['a wrapper holding nothing', '<p><code>a</code><span></span><code>b</code></p>', '`ab`'],
    ['a comment', '<p><code>a</code><!-- x --><code>b</code></p>', '`ab`'],
    ['nothing at all', '<p><code>a</code><code>b</code></p>', '`ab`'],
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
    ['tel', 'tel:+15551234', true],
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

// One allow-list, two paths. The check was written for the HTML fallback and only
// later put in front of `[text](href)` as well — which is where almost every link
// goes, so a list of `https` and `mailto` quietly stopped being a precaution and
// started being a loss: a `tel:` number in a page header came back as bare digits
// with nothing to tap.
describe('схемы ссылок', () => {
  const link = (href: string) => toMarkdown(`<p><a href="${href}">t</a></p>`).trim();

  it.each([
    ['http', 'http://e.com/', '[t](http://e.com/)'],
    ['https', 'https://e.com/a', '[t](https://e.com/a)'],
    ['mailto', 'mailto:a@e.com', '[t](mailto:a@e.com)'],
    // An address handed to whichever application owns that kind of address —
    // the same shape as `mailto`, and the reason this list was widened.
    ['tel', 'tel:+15551234', '[t](tel:+15551234)'],
    ['sms', 'sms:+15551234', '[t](sms:+15551234)'],
    ['callto', 'callto:someone', '[t](callto:someone)'],
    ['xmpp', 'xmpp:a@e.com', '[t](xmpp:a@e.com)'],
    ['matrix', 'matrix:u/a:e.com', '[t](matrix:u/a:e.com)'],
    ['cid', 'cid:part1@e.com', '[t](cid:part1@e.com)'],
    // A browser no longer follows these, but the address still names the file,
    // and what is being written is a document rather than a browser.
    ['ftp', 'ftp://e.com/f', '[t](ftp://e.com/f)'],
    ['ftps', 'ftps://e.com/f', '[t](ftps://e.com/f)'],
  ])('%s keeps its target', (_name, href, expected) => {
    expect(link(href)).toBe(expected);
  });

  it.each([
    // Following one of these runs the page's code inside the reader's document.
    ['javascript', 'javascript:alert(1)'],
    ['vbscript', 'vbscript:msgbox(1)'],
    // An href holding a `data:` URL is a whole document, `text/html` included —
    // a script wearing a label. An image `src` is the other question; see below.
    ['data', 'data:text/html,<script>alert(1)</script>'],
    // A URL parser strips these before it reads the scheme, so by the time
    // anything acts on the string it is `javascript:`. Reading the attribute as
    // written finds no scheme at all and would pass it on as a relative URL.
    ['javascript split by a newline', 'java\nscript:alert(1)'],
    ['javascript split by a tab', 'java\tscript:alert(1)'],
  ])('%s costs the link, not the text', (_name, href) => {
    expect(toMarkdown(`<p><a href="${href.replace(/"/g, '&quot;')}">click</a></p>`)).toBe('click\n');
  });

  it('an image still inlines a data: picture', () => {
    // Deliberate, and not the same question: a `src` is fetched and never
    // navigated, and `data:image/…` is how a page carries a picture inside itself.
    expect(toMarkdown('<img src="data:image/png;base64,AAA" alt="x">').trim()).toBe(
      '![x](data:image/png;base64,AAA)',
    );
  });
});

// `markdownUrl()` closed the ways out of a destination one at a time: the space,
// the backtick, the backslash, the unbalanced paren. `](` was the one left open,
// and it is the only one that needs nothing to be wrong with the URL itself.
describe('назначение ссылки не обрывается', () => {
  const link = (href: string) =>
    toMarkdown(
      `<p><a href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">t</a></p>`,
    ).trim();

  it.each([
    // A second `](` is a complete label boundary sitting inside the address. It
    // bites once a bracket in the page's own text has thrown the renderer's
    // bracket count off — and that bracket is deliberately left unescaped, since
    // `[1]` is a footnote marker. Nothing here can see the text ahead of the
    // link, so the `]` is escaped every time; the renderer strips the backslash
    // and the address the reader follows is unchanged.
    ['a ]( in the middle', 'https://e.com/a](x)b', '[t](https://e.com/a\\](x)b)'],
    // A bracket that opens nothing ends nothing, so it costs no backslash.
    ['a lone ]', 'https://e.com/a]b', '[t](https://e.com/a]b)'],
    ['a lone [', 'https://e.com/a[b', '[t](https://e.com/a[b)'],
    // Balanced parens are still left alone — `…/Foo_(bar)` is most of Wikipedia —
    // and the `](` beside them is escaped on its own.
    [
      'balanced parens beside it',
      'https://e.com/Foo_(bar)](x)y',
      '[t](https://e.com/Foo_(bar)\\](x)y)',
    ],
    // Unbalanced, both escapes apply, and the renderer undoes both.
    ['unbalanced parens beside it', 'https://e.com/a](x', '[t](https://e.com/a\\]\\(x)'],
    // The backslash pass runs first, so the backslash this adds is not doubled.
    ['a backslash in front of it', 'https://e.com/a\\](x)b', '[t](https://e.com/a\\\\\\](x)b)'],
  ])('href with %s', (_name, href, expected) => {
    expect(link(href)).toBe(expected);
  });

  it('an image src is written the same way', () => {
    expect(toMarkdown('<img src="https://e.com/a](x)b" alt="p">').trim()).toBe(
      '![p](https://e.com/a\\](x)b)',
    );
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
    // Prose is also where `#` is a heading. The alt went through the inline and
    // the HTML escapers and never through the block one, so an image with no
    // usable src turned its description into a section of the document.
    ['a heading', '# heading', '\\# heading'],
    ['a quote', '&gt; quoted', '\\> quoted'],
    ['a bullet', '- item', '\\- item'],
    ['a number', '1. item', '1\\. item'],
    // A line of dashes draws a rule, or turns whatever is above it into a heading.
    ['a rule', '---', '\\---'],
    // The escape belongs to the front of the line only: a sharp inside a sentence
    // is a sharp, and a backslash there would be one the reader pays for.
    ['a sharp mid-sentence', 'issue #3', 'issue #3'],
  ])('an alt with no src cannot open a block: %s', (_name, alt, expected) => {
    expect(toMarkdown(`<p><img alt="${alt}"></p>`).trim()).toBe(expected);
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

// A raised or lowered run is written with the characters Unicode has for it. A
// tag would be HTML in a file whose whole point is being Markdown, and Markdown
// has no syntax: Pandoc's `H~2~O` renders as strikethrough under GFM, which
// corrupts the meaning rather than losing it.
describe('надстрочный и подстрочный', () => {
  it.each([
    ['формула', '<p>H<sub>2</sub>O</p>', 'H₂O'],
    ['степень', '<p>x<sup>2</sup></p>', 'x²'],
    ['оба сразу', '<p>x<sup>2</sup>y<sub>1</sub></p>', 'x²y₁'],
    ['оператор', '<p>x<sup>n+1</sup></p>', 'xⁿ⁺¹'],
    ['скобки', '<p>a<sup>(i)</sup></p>', 'a⁽ⁱ⁾'],
  ])('%s', (_n, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // All or nothing per element: a half-mapped run states a different formula
  // with the same confidence, and losing the raising is the smaller error.
  it.each([
    ['заглавные — регистр не подменяем', '<p>x<sup>ABC</sup></p>', 'xABC'],
    ['кириллица', '<p>x<sup>Примечание</sup></p>', 'xПримечание'],
    ['частично отображается', '<p>x<sup>2q</sup></p>', 'x2q'],
  ])('%s', (_n, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// A `<q>` shows its marks from the UA stylesheet's `q::before { content:
// open-quote }`, so no node in the document holds them and the element used to
// convert to its text alone: a sentence that had quoted something arrived saying
// it had not. Which pair is the content language's business — CSS's own default
// is `quotes: auto`, and the pairs are CLDR's.
describe('q quotation marks: the pair the reader saw', () => {
  it.each([
    ['English by default', '', '“quoted”'],
    ['Russian', ' lang="ru"', '«quoted»'],
    ['German', ' lang="de"', '„quoted“'],
    ['French', ' lang="fr"', '«quoted»'],
    // A region tag falls back to its language — unless it has a pair of its own.
    ['Brazilian Portuguese, quoting like English', ' lang="pt-BR"', '“quoted”'],
    ['European Portuguese, which does not', ' lang="pt-PT"', '«quoted»'],
    // A language no table covers is no reason to write nothing.
    ['an unknown language', ' lang="qqq"', '“quoted”'],
    // The element's own attribute wins over the ancestor's, as `:lang()` does.
    ['the nearest lang, not the outermost', ' lang="ru"><span lang="de"', '„quoted“'],
  ])('%s', (_name, lang, expected) => {
    expect(toMarkdown(`<body${lang}><p><q>quoted</q></p></body>`).trim()).toBe(expected);
  });

  it('the sentence around it stays exactly where it was', () => {
    expect(toMarkdown('<body><p>He said <q>quoted</q> and left.</p></body>').trim()).toBe(
      'He said “quoted” and left.',
    );
  });

  // The second level is the language's second pair, which is what CSS reaches
  // for when the depth passes one.
  it.each([
    ['English', '', '“a ‘b’ c”'],
    ['Russian', ' lang="ru"', '«a „b“ c»'],
  ])('a nested quotation takes the second pair: %s', (_name, lang, expected) => {
    expect(toMarkdown(`<body${lang}><p><q>a <q>b</q> c</q></p></body>`).trim()).toBe(expected);
  });

  // The text inside is page text and goes through the escaper like any other;
  // the marks are this rule's own characters and go outside what it wrote.
  it('quoted text ending in a Markdown character keeps its escape', () => {
    expect(toMarkdown('<body><p>He said <q>done*</q> today.</p></body>').trim()).toBe(
      'He said “done\\*” today.',
    );
  });

  // A URL is not what the reader saw — no browser draws `cite` at all.
  it('a cite attribute does not reach the file', () => {
    expect(toMarkdown('<body><p><q cite="https://e.com/src">quoted</q></p></body>').trim()).toBe(
      '“quoted”',
    );
  });

  // Marks around nothing quote nothing, and would press against the words on
  // either side. The blank between two runs is still the blank the reader saw.
  it.each([
    ['empty', '<body><p>a<q></q>b</p></body>', 'ab'],
    ['whitespace only', '<body><p>a<q> </q>b</p></body>', 'a b'],
  ])('an %s q writes no marks', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// A flex or grid row puts its items side by side with nothing between them in
// the markup: `<a>c#</a><a>python</a>` is what a tag list is. The snapshot marks
// the container (`data-s2md-row`) rather than the items, because recording the
// `block` the items derive turned a navigation row into one paragraph per link.
describe('a row of items the reader saw side by side', () => {
  const row = (inner: string) => `<div data-s2md-row="1">${inner}</div>`;

  it('parts two items with the blank the page drew', () => {
    expect(toMarkdown(row('<span>one</span><span>two</span>')).trim()).toBe('one two');
  });

  it('adds no second blank where one is already there', () => {
    expect(toMarkdown(row('<span>one</span> <span>two</span>')).trim()).toBe('one two');
  });

  it('leaves an unmarked container running its items together', () => {
    expect(toMarkdown('<div><span>one</span><span>two</span></div>').trim()).toBe('onetwo');
  });

  // The gap decides emphasis as well as spacing: pressed against a word, `**`
  // has no CommonMark spelling that renders, and the mark fell back to a live
  // `<strong>` — a Stack Overflow tag list came out as HTML from the second tag
  // on.
  it('lets a marker open where the blank precedes it', () => {
    const bold = (text: string) => `<b>${text}</b>`;
    expect(toMarkdown(row(bold('java') + bold('python'))).trim()).toBe('**java** **python**');
  });

  it('parts blocks without adding a blank inside them', () => {
    expect(toMarkdown(row('<p>one</p><p>two</p>')).trim()).toBe('one\n\ntwo');
  });
});

// The same loss with no mark to spend: a list whose items the page laid along a
// line. The container is an ordinary `<ul>`, so nothing blockifies and no
// snapshot marks it, while `</li><li>` is written with not one character
// between — which is how Stack Overflow writes the tags under a question.
describe('a list the page laid along a line', () => {
  const item = (inner: string) => `<li data-s2md-style="display:inline">${inner}</li>`;
  const inlined = (...items: string[]) => `<ul>${items.map(item).join('')}</ul>`;

  it('parts two items the markup runs together', () => {
    expect(toMarkdown(inlined('one', 'two')).trim()).toBe('one two');
  });

  it('adds no second blank where the markup already breaks the line', () => {
    expect(toMarkdown(`<ul>${item('one')}\n${item('two')}</ul>`).trim()).toBe('one two');
  });

  it('leaves a list the page stacked writing its markers', () => {
    expect(toMarkdown('<ul><li>one</li><li>two</li></ul>').trim()).toBe('- one\n- two');
  });

  it('parts the items of a numbered list too', () => {
    expect(toMarkdown(inlined('one', 'two').replace(/ul>/g, 'ol>')).trim()).toBe('one two');
  });

  // The tags of a question, as the page writes them: bold by class, so the mark
  // comes from the snapshot, and pressed against the tag before it `**` has no
  // CommonMark spelling that renders — which is how a tag list came back as live
  // `<strong>` before the row blank existed.
  it('lets a marker open where the blank precedes it', () => {
    const tag = (name: string) =>
      `<a href="/tagged/${name}" data-s2md-style="font-weight:700">${name}</a>`;
    expect(toMarkdown(inlined(tag('java'), tag('c++'))).trim())
      .toBe('[**java**](/tagged/java) [**c++**](/tagged/c++)');
  });
});
