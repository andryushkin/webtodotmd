// What the `style` attribute says, and what the converter is allowed to write
// down because of it.
//
// The negative cases carry the weight here. Bold that survives is easy; the
// defects this file is built around are a `**` that appears where the page showed
// no bold — inside a heading, twice around a `<strong>`, around a `font-weight`
// the page set to `normal` — because every one of those puts characters on screen
// that the reader never saw.
import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

// A paragraph around every case: it is where inline content lives, and its rule
// trims, so the assertions are about the marks and nothing else.
const md = (html: string): string => toMarkdown(`<p>${html}</p>`).trim();

describe('font-weight', () => {
  it.each([
    ['bold', '<span style="font-weight:bold">x</span> y', '**x** y'],
    ['bolder', '<span style="font-weight:bolder">x</span> y', '**x** y'],
    ['700', '<span style="font-weight:700">x</span> y', '**x** y'],
    ['600 — where semibold starts', '<span style="font-weight:600">x</span> y', '**x** y'],
    ['900', '<span style="font-weight:900">x</span> y', '**x** y'],
    // Not bold, and this is the half that matters: 500 is "medium" and 400 is
    // body text. A rule reading "a number is bold" would mark whole pages.
    ['500 is not bold', '<span style="font-weight:500">x</span> y', 'x y'],
    ['400 is not bold', '<span style="font-weight:400">x</span> y', 'x y'],
    ['normal is not bold', '<span style="font-weight:normal">x</span> y', 'x y'],
    ['lighter is not bold', '<span style="font-weight:lighter">x</span> y', 'x y'],
    ['nonsense is not bold', '<span style="font-weight:very">x</span> y', 'x y'],
  ])('%s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });

  it('reads the property whatever the case and the priority', () => {
    expect(md('<span style="FONT-WEIGHT: BOLD !important">x</span> y')).toBe('**x** y');
  });

  it('the last declaration wins, as the cascade says', () => {
    expect(md('<span style="font-weight:bold;font-weight:400">x</span> y')).toBe('x y');
  });

  it('bolder is relative: from a normal context it reaches bold', () => {
    expect(md('<span style="font-weight:100"><span style="font-weight:bolder">x</span></span> y'))
      .toBe('x y');
  });
});

describe('font-style', () => {
  it.each([
    ['italic', '<span style="font-style:italic">x</span> y', '_x_ y'],
    ['oblique', '<span style="font-style:oblique">x</span> y', '_x_ y'],
    ['oblique with an angle', '<span style="font-style:oblique 14deg">x</span> y', '_x_ y'],
    ['normal is not italic', '<span style="font-style:normal">x</span> y', 'x y'],
  ])('%s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });
});

describe('text-decoration', () => {
  it.each([
    ['line-through', '<span style="text-decoration:line-through">x</span> y', '~~x~~ y'],
    ['the longhand', '<span style="text-decoration-line:line-through">x</span> y', '~~x~~ y'],
    // The shorthand carries colour, style and thickness too.
    [
      'inside a full shorthand',
      '<span style="text-decoration:line-through solid red 2px">x</span> y',
      '~~x~~ y',
    ],
    ['beside an underline', '<span style="text-decoration:underline line-through">x</span> y', '~~x~~ y'],
    // Underlining alone has no Markdown spelling and never had one; what must not
    // happen is it turning into some other mark.
    ['underline alone writes nothing', '<span style="text-decoration:underline">x</span> y', 'x y'],
    ['none writes nothing', '<span style="text-decoration:none">x</span> y', 'x y'],
  ])('%s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });
});

// The style is what the reader saw; the tag is only what the page meant. Where
// they disagree the mark goes and the content stays.
describe('a style that declines what its tag means', () => {
  it.each([
    ['strong', '<strong style="font-weight:normal">x</strong> y', 'x y'],
    ['b with a number', '<b style="font-weight:400">x</b> y', 'x y'],
    ['em', '<em style="font-style:normal">x</em> y', 'x y'],
    ['i', '<i style="font-style:normal">x</i> y', 'x y'],
    ['s', '<s style="text-decoration:none">x</s> y', 'x y'],
    ['del', '<del style="text-decoration:none">x</del> y', 'x y'],
  ])('%s keeps its text and loses its mark', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });

  it('only the mark the style names', () => {
    expect(md('<strong style="font-style:italic">x</strong> y')).toBe('**_x_** y');
  });

  it('a wrapper that declines does not stop what is inside it', () => {
    expect(md('<b style="font-weight:normal"><span style="font-weight:700">x</span></b> y'))
      .toBe('**x** y');
  });
});

// The point the whole design turns on: a mark is worth writing when the run is
// heavier than the block it sits in, not when its weight is large.
describe('a style that repeats its context', () => {
  it('a bold heading stays a heading', () => {
    expect(toMarkdown('<h2 style="font-weight:700">Title</h2>')).toBe('## Title\n');
  });

  it('a run inside a heading is not bolder than the heading', () => {
    expect(toMarkdown('<h2>a <span style="font-weight:bold">b</span> c</h2>')).toBe('## a b c\n');
  });

  it('a bold table header stays a header', () => {
    const html =
      '<table><thead><tr><th style="font-weight:700">H</th></tr></thead>' +
      '<tbody><tr><td>v</td></tr></tbody></table>';
    expect(toMarkdown(html)).toBe('| H   |\n| --- |\n| v   |\n');
  });

  it('a bold body cell is bolder than its row', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead>' +
      '<tbody><tr><td style="font-weight:bold">v</td></tr></tbody></table>';
    expect(toMarkdown(html)).toBe('| H     |\n| ----- |\n| **v** |\n');
  });

  it('a strong that says it is bold is bold once', () => {
    expect(md('<strong style="font-weight:700">x</strong> y')).toBe('**x** y');
  });

  it('a run inside a strong that says the same thing adds nothing', () => {
    expect(md('<strong>a <span style="font-weight:900">b</span></strong> y')).toBe('**a b** y');
  });

  it('a styled run inside an em adds nothing', () => {
    expect(md('<em>a <span style="font-style:italic">b</span></em> y')).toBe('_a b_ y');
  });

  // The other way round is a tag inside a style, and the tag's own rule is not
  // this change's business: `<em>a <em>b</em></em>` has always written nested
  // delimiters, which render as nested emphasis and cost the reader nothing.
  // What matters here is that the style adds no *third* mark.
  it('an em inside a styled wrapper nests as an em inside an em does', () => {
    expect(md('<span style="font-style:italic">a <em>b</em></span> y')).toBe('_a _b__ y');
    expect(md('<em>a <em>b</em></em> y')).toBe('_a _b__ y');
  });
});

describe('marks combine', () => {
  it('bold and italic on one element nest', () => {
    expect(md('<span style="font-weight:700;font-style:italic">x</span> y')).toBe('**_x_** y');
  });

  it('all three', () => {
    expect(md('<span style="font-weight:700;font-style:italic;text-decoration:line-through">x</span> y'))
      .toBe('**~~_x_~~** y');
  });

  it('a styled wrapper around a tag', () => {
    expect(md('<span style="font-weight:bold"><em>x</em></span> y')).toBe('**_x_** y');
  });

  it('a tag around a styled wrapper', () => {
    expect(md('<em><span style="font-weight:bold">x</span></em> y')).toBe('_**x**_ y');
  });
});

// The delimiters of two neighbouring runs merge into one, and the rule that
// parts them reads tags. A style is a second source of the same delimiters with
// no tag to give it away.
describe('a styled run beside another run', () => {
  it('does not run its delimiters into a neighbour', () => {
    expect(md('<span style="font-weight:700">a</span><b>c</b>')).toBe('**a**<strong>c</strong>');
  });

  it('parts two styled runs the same way', () => {
    expect(md('<span style="font-weight:700">a</span><span style="font-weight:700">c</span>'))
      .toBe('**a**<strong>c</strong>');
  });

  it('a declined mark leaves nothing for a neighbour to avoid', () => {
    expect(md('<b style="font-weight:normal">a</b><b>c</b>')).toBe('a**c**');
  });
});

describe('a style inside a literal context', () => {
  it('writes no marks into a fenced block', () => {
    expect(toMarkdown('<pre><span style="font-weight:bold">code</span></pre>'))
      .toBe('```\ncode\n```\n');
  });

  it('writes no marks into a code span', () => {
    expect(md('<code><span style="font-weight:bold">code</span></code>')).toBe('`code`');
  });

  it('writes no marks into a formula', () => {
    const html = '<math><mi style="font-weight:bold">x</mi></math>';
    expect(toMarkdown(html, { math: false })).toBe('x\n');
  });
});

// Inside an HTML block no delimiter is parsed, so the marks have to be tags —
// which they are, because the emitter is the one the tag rules already use.
describe('a style inside the HTML table fallback', () => {
  it('emits tags rather than delimiters', () => {
    const html =
      '<table><tbody><tr><td><span style="font-weight:bold">x</span></td></tr>' +
      '<tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody></table>';
    const out = toMarkdown(html, { complexTableFallback: 'html' });
    expect(out).toContain('<strong>x</strong>');
    expect(out).not.toContain('**');
  });
});

describe('display', () => {
  it('block on an inline element breaks the line', () => {
    expect(toMarkdown('<p>A<span style="display:block">B</span>C</p>')).toBe('A\n\nB\n\nC\n');
  });

  it.each([['flex'], ['grid'], ['table'], ['list-item'], ['flow-root']])(
    '%s does too',
    (value) => {
      expect(toMarkdown(`<p>A<span style="display:${value}">B</span>C</p>`)).toBe('A\n\nB\n\nC\n');
    },
  );

  it.each([['inline'], ['inline-block'], ['inline-flex'], ['contents'], ['table-cell']])(
    '%s does not',
    (value) => {
      expect(toMarkdown(`<p>A<span style="display:${value}">B</span>C</p>`)).toBe('ABC\n');
    },
  );

  // Not inside a `<p>`: an HTML parser closes the paragraph at the `<div>`
  // whatever its style says, so the break would be the parser's, not the rule's.
  it('inline on a div keeps the sentence together', () => {
    expect(toMarkdown('<div>a<div style="display:inline">b</div>c</div>')).toBe('abc\n');
  });

  it('block on an element that is already one changes nothing', () => {
    expect(toMarkdown('<div style="display:block">a</div><div>b</div>')).toBe('a\n\nb\n');
  });

  it('a styled block keeps both its marks and its break', () => {
    expect(toMarkdown('<p>A<span style="display:block;font-weight:bold">B</span>C</p>'))
      .toBe('A\n\n**B**\n\nC\n');
  });
});

describe('hidden by style', () => {
  it.each([
    ['display:none', 'display:none'],
    ['visibility:hidden', 'visibility:hidden'],
    ['visibility:collapse', 'visibility:collapse'],
    ['opacity:0', 'opacity:0'],
    ['opacity:0%', 'opacity:0%'],
    ['opacity:0.0', 'opacity:0.0'],
  ])('%s is dropped', (_name, style) => {
    expect(md(`<span style="${style}">HIDDEN</span>ok`)).toBe('ok');
  });

  it.each([
    ['opacity:0.5', 'opacity:0.5'],
    ['opacity:1', 'opacity:1'],
    ['visibility:visible', 'visibility:visible'],
    // A property whose name merely starts the same way is not the property.
    ['-x-display:none', '-x-display:none'],
  ])('%s is kept', (_name, style) => {
    expect(md(`<span style="${style}">SHOWN</span> ok`)).toBe('SHOWN ok');
  });
});

describe('the style attribute itself', () => {
  it('a semicolon inside a value does not split the declaration', () => {
    expect(md('<span style="background:url(a;b);font-weight:bold">x</span> y')).toBe('**x** y');
  });

  it('a trailing semicolon costs nothing', () => {
    expect(md('<span style="font-weight:bold;">x</span> y')).toBe('**x** y');
  });

  it('a declaration with no colon is skipped', () => {
    expect(md('<span style="font-weight;font-style:italic">x</span> y')).toBe('_x_ y');
  });

  it('a value pointing at another cascade level is silence', () => {
    // `inherit` says "whatever the context said", which is what the element
    // already had: writing a mark for it would claim a change that is not one.
    expect(md('<strong style="font-weight:inherit">x</strong> y')).toBe('**x** y');
  });
});

describe('a style on other elements', () => {
  it('a link keeps its target and gains the mark', () => {
    expect(md('<a href="https://e.com" style="font-weight:bold">link</a>'))
      .toBe('[**link**](https://e.com)');
  });

  it('a list item keeps its marker', () => {
    expect(toMarkdown('<ul><li style="font-weight:bold">item</li></ul>')).toBe('- **item**\n');
  });

  it('a paragraph keeps its block and marks its content', () => {
    expect(toMarkdown('<p style="font-weight:bold">a</p><p>b</p>')).toBe('**a**\n\nb\n');
  });

  it('a div keeps its block and marks its content', () => {
    expect(toMarkdown('<div style="font-weight:bold">a</div><div>b</div>')).toBe('**a**\n\nb\n');
  });

  it('a blockquote keeps its quoting', () => {
    expect(toMarkdown('<blockquote style="font-style:italic">a</blockquote>')).toBe('> _a_\n');
  });
});
