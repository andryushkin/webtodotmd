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

  // The `<div>` rule was the only one that asked, while the content script
  // records the declaration for every block tag — so two `<p style="display:
  // inline">` were two paragraphs in the file and one sentence on the page. The
  // decision sits in `convert()` now, beside the one that *adds* a block.
  //
  // The list items are parted by a blank all the same: what an inlined `<li>`
  // declines is the line of its own, not its separateness from the item beside
  // it (`laysARow`). Two paragraphs are not — a page runs prose together across
  // them on purpose, and `<p style="display:inline">Yes</p>` and its `No` are
  // one sentence.
  it.each([
    ['paragraphs', '<p style="display:inline">a</p><p style="display:inline">b</p>', 'ab\n'],
    ['list items', '<ul><li style="display:inline">a</li><li style="display:inline">b</li></ul>', 'a b\n'],
    ['a heading in a sentence', '<div>x<h2 style="display:inline">a</h2>y</div>', 'xay\n'],
    ['a quote in a sentence', '<div>x<blockquote style="display:inline">a</blockquote>y</div>', 'xay\n'],
    ['from a snapshot', '<p data-s2md-style="display:inline">a</p><p>b</p>', 'a\n\nb\n'],
  ])('inline declines the block a %s tag implies', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  // A heading is the exception, because `inline` is how a skin puts something
  // *beside* the title rather than how it stops being one. Wikipedia's Vector
  // 2022 is the case that found this: every `<h2>` sits in a
  // `<div class="mw-heading">` and is inlined so the `[edit]` link lands on its
  // line, and an article arrived with all 60 of its section headings as prose —
  // the `<h3>`s as `**bold**`, since bold is what a heading's weight leaves once
  // the level is gone. What decides is whether anything drew before it, which is
  // also what leaves the sentence case above untouched.
  it.each([
    ['opening its line', '<div><h2 style="display:inline">a</h2><span>[edit]</span></div>', '## a\n\n[edit]\n'],
    ['first in a wrapper', '<div><div><h3 style="display:inline">a</h3></div></div>', '### a\n'],
    ['after a heavier wrapper', '<div data-s2md-style="font-weight:700"><h3 style="display:inline">a</h3></div>', '### a\n'],
  ])('a heading %s keeps its level', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  // A delimiter does not cross the blank between two blocks: `**a\n\nb**` renders
  // as the asterisks themselves at both ends and no bold anywhere. So the mark is
  // written per block — and never around one that opens with syntax of its own,
  // where it would be printed or eaten by the construct. A heading is bold
  // already, the same reason a `<th>` is refused the weight it is handed.
  it.each([
    ['paragraphs', '<div style="font-weight:bold"><p>a</p><p>b</p></div>', '**a**\n\n**b**\n'],
    ['a heading', '<div style="font-weight:700"><h3>Title</h3></div>', '### Title\n'],
    ['a list', '<div style="font-weight:bold"><ul><li>a</li></ul></div>', '- a\n'],
    ['one run of text', '<div style="font-weight:bold">plain</div>', '**plain**\n'],
  ])('a style mark goes round %s, not round a block', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  // Only a tag that would have drawn a block has a block to decline. Reading the
  // declaration off anything else would strip the marks its rule writes — and a
  // `<br>` carries `display:inline` in every computed style there is, so the
  // snapshot puts one on every line break in the document.
  it.each([
    ['emphasis keeps its marks', '<p>a<em style="display:inline">b</em>c</p>', 'a*b*c\n'],
    ['a code span keeps its backticks', '<p>a<code style="display:inline">b</code>c</p>', 'a`b`c\n'],
    ['a break stays a break', '<p>a<br data-s2md-style="display:inline">b</p>', 'a\\\nb\n'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  // A grid is not content between blank lines, so there is nothing to unwrap
  // that would leave a table behind.
  it('inline on a table keeps the grid', () => {
    const html = '<table style="display:inline"><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
    expect(toMarkdown(html)).toContain('| a   | b   |');
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

// The section that is not hidden, only not shown yet. A reveal-on-scroll library
// puts `opacity: 0` on half an article and fades each part in as it arrives, and
// dropping those would take the second half of every such page out of a
// select-all. The transition or the animation beside it is the whole difference,
// and a `style` attribute writes it in the shorthand.
describe('an opacity:0 that is on its way in', () => {
  it.each([
    ['a transition shorthand', 'opacity:0;transition:opacity .4s'],
    ['one naming no property', 'opacity:0;transition:.4s'],
    ['one naming all', 'opacity:0;transition:all 300ms ease-in-out'],
    ['one with an easing function', 'opacity:0;transition:opacity .4s cubic-bezier(0.4,0,0.2,1)'],
    ['a list with opacity in it', 'opacity:0;transition:color .2s,opacity .4s'],
    ['a delay after the duration', 'opacity:0;transition:opacity .4s .2s'],
    ['an animation shorthand', 'opacity:0;animation:fade-in 1s ease'],
    ['the longhands a computed style writes', 'opacity:0;transition-duration:0.4s;transition-property:opacity'],
    ['a recorded animation-name', 'opacity:0;animation-name:fade-in'],
  ])('%s keeps the text', (_name, style) => {
    expect(md(`<span style="${style}">SHOWN</span> ok`)).toBe('SHOWN ok');
    expect(md(`<span data-s2md-style="${style}">SHOWN</span> ok`)).toBe('SHOWN ok');
  });

  it.each([
    ['a transition on something else', 'opacity:0;transition:color .4s'],
    ['a transition with no time', 'opacity:0;transition:opacity'],
    ['a zero duration', 'opacity:0;transition-duration:0s;transition-property:opacity'],
    ['an animation set to none', 'opacity:0;animation:none'],
    ['a recorded animation-name of none', 'opacity:0;animation-name:none'],
  ])('%s still drops it', (_name, style) => {
    expect(md(`<span style="${style}">HIDDEN</span>ok`)).toBe('ok');
    expect(md(`<span data-s2md-style="${style}">HIDDEN</span>ok`)).toBe('ok');
  });
});

// `visibility` is the one of these a descendant can declare back, and removing an
// element removes everything under it — so a box that hid itself and then let
// something inside be seen has to stay. It reads the same whichever attribute
// says it, which is what makes a snapshot able to take back what a `style` wrote.
describe('a visibility a descendant takes back', () => {
  it.each([
    ['the style attribute', 'style'],
    ['a recorded computed style', 'data-s2md-style'],
  ])('is answered through %s', (_name, attribute) => {
    const html =
      `<div ${attribute}="visibility:hidden"><p ${attribute}="visibility:visible">SHOWN</p></div>`;
    expect(toMarkdown(html).trim()).toBe('SHOWN');
  });

  it('is answered across the two attributes', () => {
    expect(toMarkdown('<div style="visibility:hidden"><p data-s2md-style="visibility:visible">SHOWN</p></div>').trim())
      .toBe('SHOWN');
  });

  // The box stays, but only what declared itself visible again comes with it:
  // `visibility` inherits, so a sibling that declares nothing is invisible too.
  it('leaves the rest of the box hidden', () => {
    const html =
      '<div style="visibility:hidden"><p style="visibility:visible">SHOWN</p><p>HIDDEN</p></div>';
    expect(toMarkdown(html).trim()).toBe('SHOWN');
  });

  it('still drops a box with nothing visible under it', () => {
    expect(toMarkdown('<div style="visibility:hidden"><p>HIDDEN</p></div><p>ok</p>').trim())
      .toBe('ok');
  });

  // Nothing takes back the other three: a descendant of a `display:none`, an
  // `opacity:0` or a clipped box cannot be seen whatever it declares.
  it.each([['display:none'], ['opacity:0'], ['clip:rect(0px, 0px, 0px, 0px)']])(
    '%s is not undone from inside',
    (style) => {
      expect(toMarkdown(`<div style="${style}"><p style="visibility:visible">HIDDEN</p></div><p>ok</p>`).trim())
        .toBe('ok');
    },
  );
});

// The box above stays, and everything under it that is still hidden says so for
// itself — every *element*, that is. A text node has no style, so nothing spoke
// for it, and the kept box's own text was the one thing that walked into the file
// having never been painted: the reader saw `seen` and the file said
// `HIDDEN_TEXTseenALSO_HIDDEN`. `visibility` is not a maybe — it inherits, and the
// cascade has already settled that this text is invisible — so the usual
// counterweight buys the narrowness of the rule rather than the text.
describe('hidden box text: what reaches the file', () => {
  it.each([
    ['the style attribute', 'style'],
    ['a recorded computed style', 'data-s2md-style'],
  ])('drops the kept box\'s own text, through %s', (_name, attribute) => {
    const html =
      `<div ${attribute}="visibility:hidden">HIDDEN_TEXT` +
      `<span ${attribute}="visibility:visible">seen</span>ALSO_HIDDEN</div>`;
    expect(toMarkdown(html).trim()).toBe('seen');
  });

  // Two boxes kept for one leaf. The inner one is invisible by inheritance and
  // kept for the same reason as the outer, so the same question is asked of it.
  it('drops it at every depth the same box recurs', () => {
    const html =
      '<div style="visibility:hidden">OUTER_BEFORE' +
      '<div style="visibility:hidden">INNER_BEFORE' +
      '<span style="visibility:visible">seen</span>' +
      'INNER_AFTER</div>OUTER_AFTER</div>';
    expect(toMarkdown(html).trim()).toBe('seen');
  });

  // An element that declares itself visible again takes its own text with it —
  // both the text it holds directly and everything under its inline children.
  it('keeps everything under what declared itself visible again', () => {
    const html =
      '<div style="visibility:hidden">X' +
      '<span style="visibility:visible">seen and <b>bold</b></span>Y</div>';
    expect(toMarkdown(html).trim()).toBe('seen and **bold**');
  });

  // A blank looks the same hidden or shown, and the box holds its width open, so
  // the gap between two revealed runs was on screen. Dropping it would weld the
  // words together, which is the loss this rule exists to avoid, not a second
  // instance of it.
  it('keeps the whitespace between two revealed runs', () => {
    const html =
      '<div style="visibility:hidden">\n  <span style="visibility:visible">one</span>' +
      '\n  <span style="visibility:visible">two</span>\n</div>';
    expect(toMarkdown(html).trim()).toBe('one two');
  });

  // The two guards. Nothing declares itself visible in the first, so the box goes
  // whole and the narrower rule never runs; nothing is hidden in the second.
  it('still takes a wholly hidden box entirely', () => {
    expect(toMarkdown('<div style="visibility:hidden">TEXT<p>HIDDEN</p></div><p>ok</p>').trim())
      .toBe('ok');
  });

  it('leaves an ordinary paragraph alone', () => {
    expect(toMarkdown('<p>hello <b>world</b></p>').trim()).toBe('hello **world**');
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

  // The last declaration is flushed after the loop, not by a branch inside it:
  // there the flush sat behind the test for an open quote and could not run
  // while one was, so an apostrophe in a font name threw the attribute's whole
  // tail away. CSS closes an unterminated string at the end of input, and the
  // declaration it makes is then nonsense the readers reject — which is where a
  // nonsense value belongs, rather than taking its neighbours with it.
  it.each([
    ['an unterminated quote after the weight', "<span style=\"font-weight:bold;font-family:Tom's\">x</span> y"],
    ['a quoted family before it', "<span style=\"font-family:'Tom Sans';font-weight:bold\">x</span> y"],
    ['a trailing backslash inside a quote', "<span style=\"font-weight:bold;font-family:'a\\\">x</span> y"],
    ['an unbalanced paren after the weight', '<span style="font-weight:bold;background:url(a">x</span> y'],
  ])('%s keeps the weight', (_name, html) => {
    expect(md(html)).toBe('**x** y');
  });

  // A CSS value is page text, so the page picks the key. An object literal
  // answers `constructor` with a function, and `weightFrom` handed it back where
  // it had declared a number.
  it.each([['constructor'], ['toString'], ['valueOf'], ['__proto__']])(
    'font-weight:%s is not a weight',
    (value) => {
      expect(md(`<strong style="font-weight:${value}">x</strong> y`)).toBe('**x** y');
    },
  );
});

// The second source of the same properties: a computed style someone with live
// nodes wrote down before the clone was taken (`src/content/style-snapshot.ts`).
// It is read through the same parser and the same property readers, so what is
// tested here is the joining — that it answers where the page's own attribute
// cannot, and that it wins where both speak, computed style being the later word.
describe('a recorded computed style', () => {
  it.each([
    ['weight', '<span data-s2md-style="font-weight:700">x</span> y', '**x** y'],
    ['slant', '<span data-s2md-style="font-style:italic">x</span> y', '_x_ y'],
    ['a line through', '<span data-s2md-style="text-decoration-line:line-through">x</span> y', '~~x~~ y'],
  ])('carries the %s a class gave', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });

  it('declines what the tag means, exactly as the attribute does', () => {
    expect(md('<strong data-s2md-style="font-weight:400">x</strong> y')).toBe('x y');
    expect(md('<em data-s2md-style="font-style:normal">x</em> y')).toBe('x y');
  });

  it('is still measured against its context', () => {
    // The recorded weight of a heading a theme reset, and of the run inside it
    // that is genuinely bolder than the heading.
    const html =
      '<h2 data-s2md-style="font-weight:400">a <span data-s2md-style="font-weight:700">b</span></h2>';
    expect(toMarkdown(html)).toBe('## a **b**\n');
  });

  it('wins over the attribute it was computed from', () => {
    // A stylesheet with `!important` beats an inline declaration, and the
    // computed style is the only place that shows.
    expect(md('<span style="font-weight:700" data-s2md-style="font-weight:400">x</span> y'))
      .toBe('x y');
  });

  it('leaves the attribute to answer what it says nothing about', () => {
    expect(md('<span style="font-style:italic" data-s2md-style="font-weight:700">x</span> y'))
      .toBe('**_x_** y');
  });

  it('breaks a line the tag would not', () => {
    expect(toMarkdown('<p>A<span data-s2md-style="display:block">B</span>C</p>'))
      .toBe('A\n\nB\n\nC\n');
  });

  it('never reaches the output, not even where the fallback emits tags', () => {
    const html =
      '<table><tbody><tr><td><span data-s2md-style="font-weight:bold">x</span></td></tr>' +
      '<tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody></table>';
    const out = toMarkdown(html, { complexTableFallback: 'html' });
    expect(out).toContain('<strong>x</strong>');
    expect(out).not.toContain('data-s2md-style');
  });
});

// The shapes a page uses to keep text for a screen reader and away from every
// other one. They are written by a class, so in practice only a recorded computed
// style ever shows them — but the reader is the same reader, so the `style`
// attribute is answered too.
describe('clipped out of sight', () => {
  it.each([
    ['a zero clip rect', 'clip:rect(0px, 0px, 0px, 0px)'],
    ['the same without commas', 'clip:rect(0px 0px 0px 0px)'],
    ['an inset clip-path', 'clip-path:inset(50%)'],
    ['a deeper inset', 'clip-path:inset(100%)'],
    ['a far negative text-indent', 'text-indent:-9999px'],
    ['absolute positioning off the canvas', 'position:absolute;left:-9999px'],
    ['fixed positioning above it', 'position:fixed;top:-5000px'],
    ['a one-pixel box that clips', 'width:1px;height:1px;overflow:hidden'],
  ])('%s drops the text', (_name, style) => {
    expect(md(`<span data-s2md-style="${style}">HIDDEN</span>ok`)).toBe('ok');
    expect(md(`<span style="${style}">HIDDEN</span>ok`)).toBe('ok');
  });

  // The half that matters more: every one of these is a layout a page really
  // uses, and text a reader saw is what a wrong threshold costs.
  it.each([
    ['a clip rect with a side', 'clip:rect(0px, 100px, 20px, 0px)'],
    ['a shallow inset', 'clip-path:inset(10%)'],
    ['a hanging indent', 'text-indent:-2em'],
    ['a small negative indent', 'text-indent:-24px'],
    ['a pulled-back absolute box', 'position:absolute;left:-120px'],
    ['a negative offset with no positioning', 'left:-9999px'],
    ['a relative offset', 'position:relative;left:-9999px'],
    ['a one-pixel box that does not clip', 'width:1px;height:1px'],
    ['a collapsed panel the reader can open', 'width:800px;height:0px;overflow:hidden'],
  ])('%s keeps it', (_name, style) => {
    expect(md(`<span data-s2md-style="${style}">SHOWN</span> ok`)).toBe('SHOWN ok');
  });
});

// Zero is the one length that needs no unit, so the idiom is written `rect(0, 0,
// 0, 0)` more often than it is written `rect(0px, 0px, 0px, 0px)`. The cases
// above happened to use the spelling a computed style produces, which is the
// spelling the extension's snapshot always carries — so the gap stayed shut on
// the extension's side of the product and open on the library's, where the
// page's own `style` attribute is all there is.
describe('unitless clip: a zero side needs no unit', () => {
  it.each([
    ['bare zeros with commas', 'clip:rect(0,0,0,0)'],
    ['bare zeros without commas', 'clip:rect(0 0 0 0)'],
    ['the two spellings mixed', 'clip:rect(0, 0px, 0, 0px)'],
    ['a zero written long', 'clip:rect(0.0, 00, 0, -0)'],
  ])('%s drops the text', (_name, style) => {
    expect(md(`<span data-s2md-style="${style}">HIDDEN</span>ok`)).toBe('ok');
    expect(md(`<span style="${style}">HIDDEN</span>ok`)).toBe('ok');
  });

  // Only a zero. A side that is a keyword or a real length clips nothing away,
  // and a `clip` that is not a rect at all was never this idiom — reading any of
  // them as "none of this" would take a paragraph the reader was looking at.
  it.each([
    ['auto on every side', 'clip:rect(auto, auto, auto, auto)'],
    ['a bare zero beside a real length', 'clip:rect(0, 0, 0, 10px)'],
    ['a unit this does not read', 'clip:rect(0em, 0em, 0em, 0em)'],
    ['three sides instead of four', 'clip:rect(0, 0, 0)'],
    ['no rect at all', 'clip:auto'],
    ['a shape that is not a rect', 'clip:inset(0, 0, 0, 0)'],
  ])('%s keeps it', (_name, style) => {
    expect(md(`<span data-s2md-style="${style}">SHOWN</span> ok`)).toBe('SHOWN ok');
    expect(md(`<span style="${style}">SHOWN</span> ok`)).toBe('SHOWN ok');
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

// A `visibility:hidden` under a transition is written the same way by a reveal
// library and by every dropdown on the web. What separates them is the box: an
// overlay has to leave the flow, or it would hold space open while closed.
describe('скрытое с переходом: раскрытие или оверлей', () => {
  it.each([
    ['секция в потоке', 'visibility:hidden;transition:.6s', 'a\n\nSECTION\n\nb\n'],
    ['секция relative', 'visibility:hidden;transition:.6s;position:relative', 'a\n\nSECTION\n\nb\n'],
    ['оверлей absolute', 'visibility:hidden;transition:.2s;position:absolute', 'ab\n'],
    ['оверлей fixed', 'visibility:hidden;transition:.2s;position:fixed', 'ab\n'],
    ['скрыто без перехода', 'visibility:hidden', 'ab\n'],
  ])('%s', (_name, style, expected) => {
    expect(toMarkdown(`<div>a<section style="${style}">SECTION</section>b</div>`)).toBe(expected);
    expect(toMarkdown(`<div>a<section data-s2md-style="${style}">SECTION</section>b</div>`)).toBe(expected);
  });
});

// A `<section>` is a block, so a kept one stands between blank lines: what these
// measure is whether the text survives at all, not how the line was laid out.
const SHOWN = 'a\n\nSECTION\n\nb\n';
const GONE = 'ab\n';

const section = (style: string, expected: string): void => {
  expect(toMarkdown(`<div>a<section style="${style}">SECTION</section>b</div>`)).toBe(expected);
  expect(toMarkdown(`<div>a<section data-s2md-style="${style}">SECTION</section>b</div>`)).toBe(expected);
};

// Every one of those transitions above names no property, which is the one thing
// both questions accept. Name one and the answer used to depend on the wrong
// property: `transition: visibility 30s` — the plainest way a page can say this
// box is about to be shown — was tested for the word `opacity`, found to say
// nothing, and the paragraph under it left the file.
describe('reveal per property: a visibility:hidden under its own transition', () => {
  it.each([
    ['the shorthand a style attribute writes', 'visibility:hidden;transition:visibility 30s'],
    ['the longhands a computed style states', 'visibility:hidden;transition-property:visibility;transition-duration:30s'],
    ['a list with visibility in it', 'visibility:hidden;transition:color .2s,visibility .4s'],
    // Whatever it animates, a running animation says the element is on its way
    // somewhere — and it is `none` on everything that is merely hidden.
    ['an animation, which counts for either property', 'visibility:hidden;animation:fade-in 1s ease'],
  ])('%s keeps the text', (_name, style) => {
    section(style, SHOWN);
  });

  // The other half of the same rule, and the expensive one: an overlay is
  // written identically and has to leave the flow, or it would hold space open
  // while it is closed. Judged wrong here the file loses a menu; judged wrong
  // above it loses the article.
  it.each([
    ['an absolute overlay', 'visibility:hidden;transition:visibility 30s;position:absolute'],
    ['a fixed overlay', 'visibility:hidden;transition:visibility 30s;position:fixed'],
    ['no transition at all', 'visibility:hidden'],
    ['a transition naming neither property', 'visibility:hidden;transition:color 30s'],
    ['an animation set to none', 'visibility:hidden;animation:none'],
  ])('%s still drops it', (_name, style) => {
    section(style, GONE);
  });

  // Asked the other way round: a `visibility:hidden` whose transition names only
  // `opacity`. The two are one idiom, and the duration sits on the `opacity`
  // half of it — `visibility` has no in-between value to animate, so a fade
  // writes it with a zero duration and a delay, to hold the box out of the way
  // of the mouse until the fade has finished. Refusing `opacity` here for the
  // sake of symmetry would refuse the only part of that declaration carrying a
  // duration at all, and delete text this converter keeps today.
  it.each([
    ['the fade idiom in full', 'visibility:hidden;transition:opacity .3s,visibility 0s .3s'],
    ['its opacity half alone', 'visibility:hidden;transition:opacity .3s'],
    ['the longhands of it', 'visibility:hidden;transition-property:opacity,visibility;transition-duration:.3s,0s'],
  ])('%s keeps the text: opacity is evidence for visibility too', (_name, style) => {
    section(style, SHOWN);
  });
});

// The asymmetry stated from the opacity side. `opacity` is evidence for either
// property; nothing else is evidence for `opacity`, because a transition on
// `color` or on `visibility` says nothing about a transparent element ever being
// painted.
describe('reveal per property: an opacity:0 wants its own property named', () => {
  it.each([
    ['a transition naming opacity', 'opacity:0;transition:opacity .4s', SHOWN],
    ['a transition naming all', 'opacity:0;transition:all .4s', SHOWN],
    ['an animation', 'opacity:0;animation:fade-in 1s ease', SHOWN],
    ['a transition on something else', 'opacity:0;transition:color 30s', GONE],
    ['a transition naming only visibility', 'opacity:0;transition:visibility .3s', GONE],
    ['the same, in longhands', 'opacity:0;transition-property:visibility;transition-duration:.3s', GONE],
  ])('%s', (_name, style, expected) => {
    section(style, expected);
  });
});

// A container states a weight its own children take back, and only the children
// hold text. Reddit's comment header is a `<summary>` at 700 whose every child
// is a `<div>` back at 400, with the author's name declaring 700 again inside —
// so the file bolded the header line, and the name, bold in its own right, came
// out `**[**name**](…)**`. Nothing on screen was bold but the name.
describe('a mark nothing wears', () => {
  it('a weight every child declines writes nothing', () => {
    const html =
      '<div data-s2md-style="font-weight:700"><div data-s2md-style="font-weight:400">plain <a href="https://e.com" data-s2md-style="font-weight:700">name</a></div></div>';
    expect(toMarkdown(html).trim()).toBe('plain [**name**](https://e.com)');
  });

  it('text of its own still wears it', () => {
    expect(toMarkdown('<div data-s2md-style="font-weight:700">heavy</div>').trim()).toBe('**heavy**');
  });

  // One branch is enough for the mark to be written — and it is written round
  // that branch alone. This read `**ab**` while the reader saw the bold begin at
  // `b`: knowing the mark reaches text is not knowing how much of the line wears
  // it, and the two questions had one answer.
  it('one child that inherits it takes the mark, and the other does not', () => {
    const html =
      '<div data-s2md-style="font-weight:700"><span data-s2md-style="font-weight:400">a</span><span>b</span></div>';
    expect(toMarkdown(html).trim()).toBe('a**b**');
  });

  // Where a container states a mark and part of its content takes it back, the
  // delimiters go round the part that kept it. Both spellings, because both reach
  // the converter — the page's own attribute and the content script's snapshot.
  it.each([
    [
      'a declining run before the marked one',
      '<div STYLE="font-weight:700"><span STYLE="font-weight:400">not bold</span> and this is</div>',
      'not bold **and this is**',
    ],
    [
      'a declining run after it',
      '<div STYLE="font-weight:700">bold <span STYLE="font-weight:400">and this is not</span></div>',
      '**bold** and this is not',
    ],
    [
      'a declining run between two marked ones',
      '<div STYLE="font-weight:700">a <span STYLE="font-weight:400">b</span> c</div>',
      '**a** b **c**',
    ],
    [
      'italics, the same shape',
      '<div STYLE="font-style:italic">a <span STYLE="font-style:normal">b</span></div>',
      '_a_ b',
    ],
    [
      'strikethrough, the same shape',
      '<div STYLE="text-decoration-line:line-through">a <span STYLE="text-decoration-line:none">b</span></div>',
      '~~a~~ b',
    ],
    [
      'a run that declines it deeper down keeps its own',
      '<div STYLE="font-weight:700"><span STYLE="font-weight:400">a <b>b</b></span> c</div>',
      'a **b** **c**',
    ],
  ])('%s', (_name, html, expected) => {
    for (const attribute of ['style', 'data-s2md-style']) {
      expect(toMarkdown(html.replace(/STYLE/g, attribute)).trim()).toBe(expected);
    }
  });

  // A child that wrote nothing is not a child that declined the mark. It stands
  // between no characters, so it can end no run — counted as one it split the run
  // in two, and the halves' delimiters met as `**a****b**`, which marked reads as
  // a bold `a` followed by four asterisks the reader never saw. A DOM comment is
  // how this arrives: `v-if` leaves `<!---->` in the middle of a run, so any page
  // a framework rendered can hold one.
  it.each([
    ['a comment', '<div STYLE="font-weight:700">a<!--c-->b</div>', '**ab**'],
    ['a comment against the edge', '<div STYLE="font-weight:700"><!--c-->ab</div>', '**ab**'],
    ['an empty wrapper', '<div STYLE="font-weight:700">a<span></span>b</div>', '**ab**'],
    ['a spacer image', '<div STYLE="font-weight:700">a<img src="s.gif" width="1">b</div>', '**ab**'],
    ['italics, the same shape', '<div STYLE="font-style:italic">a<!--c-->b</div>', '_ab_'],
    // The run really declining the mark still ends it: what changed is only what
    // counts as a child, not what a mark goes round.
    [
      'a run that declines it beside a comment',
      '<div STYLE="font-weight:700">a<!--c--><span STYLE="font-weight:400">b</span></div>',
      '**a**b',
    ],
  ])('%s', (_name, html, expected) => {
    for (const attribute of ['style', 'data-s2md-style']) {
      expect(toMarkdown(html.replace(/STYLE/g, attribute)).trim()).toBe(expected);
    }
  });

  // The mark is not moved onto something that cannot wear it: a picture is not
  // text, and `**![alt](src)**` claims a bold the reader was never shown.
  it('an image beside a marked run is left alone', () => {
    const html =
      '<div data-s2md-style="font-weight:700"><img src="a.png" alt="a"> and this is</div>';
    expect(toMarkdown(html).trim()).toBe('![a](a.png) **and this is**');
  });

  it('the same holds for italics', () => {
    const html =
      '<div data-s2md-style="font-style:italic"><span data-s2md-style="font-style:normal">upright</span></div>';
    expect(toMarkdown(html).trim()).toBe('upright');
  });
});
