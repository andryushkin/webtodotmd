// The fidelity gate.
//
// The oracle finds far more than is fixed today, so this file cannot demand zero
// failures yet — it holds a ceiling instead. A change that makes conversion less
// faithful pushes the count up and fails here; a change that fixes something
// pushes it down and fails here too, asking for the ceiling to be lowered. Either
// way the number moves deliberately, which is the whole point: before this, there
// was no way to tell whether the tail was shrinking.
//
// A number alone could not tell a repair from a swap, though. Fix one seed,
// regress another, and 74 stayed 74 — the gate said nothing and meant nothing. So
// the classes are recorded too, and they are what actually holds: which defects
// exist, not how many. `bun tests/fidelity/survey.ts` prints them.
import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import {
  installDOMAdapter,
  roundTrip,
  describeFailure,
  render,
  roundTripStructure,
  describeStructuralFailure,
} from './oracle';
import { survey, type DefectClass } from './survey';
import { toMarkdown } from '../../core/src/server.js';
import { CONVERSION_OPTIONS } from '../../src/content/raw-mathml-rule';

beforeAll(() => {
  installDOMAdapter();
});

// Measured 2026-07-26 on the generator as it stands.
//
// It rose from 76 when tables stopped falling back to HTML. Folding a nested
// table into its cell joins the cells with ` · `, and folding preformatted text
// indents with non-breaking spaces — characters the page did not show, which is
// exactly what this oracle reports. Both are deliberate: without a separator the
// cells of the inner table run together into one word. The number is the price
// of that choice, not a defect to chase.
//
// It rose again when the generator regained merged-cell coverage. Removing the
// merged-cell block kind had left `expandSpans` — the newest code here, and now
// the default path for every merged table — with no generated input at all.
//
// It fell from 98 when escaping learned to hold across a node boundary. Two whole
// classes went with it — `<span>&lt;</span>!-- swallowed --&gt;` and the same
// shape mid-sentence — 26 seeds between them, where a `<` ending one text node and
// a comment opener starting the next joined into a comment that ate the rest of
// the line. What is left on the concatenation axis is the Markdown half of the
// same problem: `<span>[</span>x](url)` still assembles into a link.
//
// It rose from 74 to 98, and the classes from 38 to 69, when the generator learned
// the shapes a review found it had never produced. Nothing regressed; the oracle
// started looking where it had not. The net is smaller than the find because the
// new block kinds also displace the old ones — a seed that used to roll `td` may
// now roll `pre-br` — so the shapes that were already covered fell from 74 seeds
// to 55, and the new ones account for 43:
//
//   19  a nested table's <caption> is dropped by the fold
//   10  a nested table behind a <div> is not folded at all, and the pipe table
//       emitted instead lands inside a cell, where the reader gets `| x | y |`
//    6  two adjacent code spans run their delimiters together — which is what
//       <kbd> or <samp> beside <code> produces
//    4  a <pre> holding both a <br> and a <code> keeps only what the <code> held
//    2  a hostile `href` ends its own link destination
//    2  an <img> with an empty `src` deliberately shows its alt as prose
//
// The first four are defects, and each is reproduced by name in `structural
// sanity` below so a repair has one place to check itself against.
//
// The generator kinds that found nothing are worth as much: emphasis pressed
// against an emoji, and a hostile fence info string, both round-trip today.
const SEEDS = 200;
const CEILING = 98;

// The defect classes as they stand, keyed by the minimal input that still shows
// each one — the survey's own output, recorded. This is the half a total cannot
// do: a swap moves a line in and a line out while the count sits still, and the
// failure names both.
//
// Regenerate with `bun tests/fidelity/survey.ts 200` after a deliberate change.
const RECORDED_CLASSES: readonly string[] = [
  '<p>(https://example.com)&lt;div&gt; x `</p>',
  '<p>(https://example.com)&lt;table&gt;</p>',
  '<p>(https://example.com)<a href="https://example.com">!</a></p>',
  '<p>(https://example.com)<a href="https://example.com/a`b`">hello world</a></p>',
  '<p>(https://example.com/i.png)&lt;div&gt; x `</p>',
  '<p>(https://example.com/i.png)<b>x</b></p>',
  '<p>(https://example.com/i.png)<strong>a</strong></p>',
  '<p>(https://example.com/i.png)<strong>hello world</strong></p>',
  '<p>(https://example.com/i.png)\\</p>',
  '<p>(https://example.com/i.png)~~</p>',
  '<p><code>&lt;table&gt;</code><code>_</code></p>',
  '<p><code>_</code><kbd>word</kbd></p>',
  '<p><img src="" alt="a"></p>',
  '<p><img src="" alt="x"></p>',
  '<p><kbd>\\</kbd><kbd>![</kbd></p>',
  '<p><samp>:</samp><code>&lt;div&gt; x `</code></p>',
  '<p><samp>text</samp><code>_</code></p>',
  '<p><samp>word</samp><samp>---</samp></p>',
  '<p><span>![alt]</span>(https://example.com/i.png)</p>',
  '<p><span>1. </span></p>',
  '<p><span>[</span>x](https://example.com)</p>',
  '<p><span>[text]</span>(https://example.com)</p>',
  '<p>[<a href="https://example.com/a](x)b">x</a></p>',
  '<p>x](https://example.com)**</p>',
  '<p>x](https://example.com)<samp>![</samp></p>',
  '<p>x](https://example.com)<strong>text</strong></p>',
  '<p>~word~</p>',
  '<pre>---<br><code>`</code></pre>',
  '<pre><code>hello world</code><br>**</pre>',
  '<pre><code>word</code><br>(https://example.com/i.png)</pre>',
  '<pre>_under_<br><code>text</code></pre>',
  '<table><tbody><tr><td><div><table><tbody><tr><td> </td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>&lt;/td&gt;</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>(</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>--&gt;</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>[</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>hello world</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>text</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><div><table><tbody><tr><td>x</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption> </caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>!-- swallowed --&gt;</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>!</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>![alt]</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>&lt;</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>&lt;pre&gt;x&lt;/pre&gt;</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>*</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>--&gt;</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>]</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>__</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>a ` b</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>a</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>text</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>word</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>x</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>👍🏽</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><caption>👩‍💻</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>&lt;table style="position:fixed"&gt;</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>(https://example.com/i.png)</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>)</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>**</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>*</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>[</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>\\</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>]</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>_</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>hello world</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>word</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>x](https://example.com)</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
  '<table><tbody><tr><td><table><tbody><tr><td>~</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
];

// The survey shrinks every failing seed, so it is measured once and shared.
let measured: Map<string, DefectClass> | undefined;
function classes(): Map<string, DefectClass> {
  measured ??= survey(SEEDS);
  return measured;
}

describe('round-trip fidelity', () => {
  it('no more failures than the recorded ceiling', () => {
    const failures = [...classes().values()].reduce((n, c) => n + c.seeds.length, 0);
    expect(failures).toBeLessThanOrEqual(CEILING);
    // Lower than the ceiling means something was fixed — record it, or the gate
    // silently stops protecting the ground that was just won.
    expect(failures).toBe(CEILING);
  });

  it('the same failures, not merely the same number of them', () => {
    const found = [...classes().keys()].sort();
    // Named both ways round: `repaired` is ground won and worth recording,
    // `introduced` is a regression. A swap shows one of each.
    expect({
      repaired: RECORDED_CLASSES.filter((html) => !found.includes(html)),
      introduced: found.filter((html) => !RECORDED_CLASSES.includes(html)),
    }).toEqual({ repaired: [], introduced: [] });
  });
});

// Math cannot be judged by text fidelity: a page shows `x`, the file says `$x$`,
// and both are correct. What must hold is that a formula does not damage the cell
// it rides in, and that the LaTeX arrives unchanged. Both are recorded as they
// behave today — including where they are wrong — so a repair has to come here and
// say so.
describe('math inside the HTML table fallback', () => {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const katex = (tex: string) =>
    `<span class="katex"><annotation encoding="application/x-tex">${esc(tex)}</annotation></span>`;
  const mathjaxV2 = (tex: string) => `<script type="math/tex">${esc(tex)}</script>`;
  // A nested table is what forces the fallback; the formula rides beside it.
  const table = (inner: string) =>
    `<table><tbody><tr><td>${inner}</td></tr><tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody></table>`;

  const cellCount = (html: string): number =>
    parseHTML(`<html><body>${html}</body></html>`).document.querySelectorAll('td,th').length;

  it.each([
    // tex,          builder,     cells survive, latex intact
    // A comment opener no longer breaks the cell — escapeMathTags covers it — but
    // neutralizing it does change the LaTeX. That trade is deliberate: a formula
    // that reads as a comment swallows the rest of the table.
    ['x<!--oops', katex, true, false],
    ['x<!--oops', mathjaxV2, true, false],
    // A `</td>` in a formula is neutralized now — it would close the cell it
    // rides in — so the cell survives and the LaTeX does not.
    ['a</td><td>b', katex, true, false],
    ['a</td><td>b', mathjaxV2, true, false],
    ['a & b_1', katex, true, true],
    // Still wrong: isMathSubtree does not cover <script>, so the cell escaping
    // reaches LaTeX it should have left alone.
    ['a & b_1', mathjaxV2, true, false],
    ['x < y', katex, true, true],
    ['x < y', mathjaxV2, true, false],
  ])('%s via %p', (tex, build, cellsSurvive, latexIntact) => {
    const html = table((build as (t: string) => string)(tex as string));
    const md = toMarkdown(html, { ...CONVERSION_OPTIONS, complexTableFallback: 'html' });
    expect(cellCount(render(md)) === cellCount(html)).toBe(cellsSurvive as boolean);
    expect(md.includes(tex as string)).toBe(latexIntact as boolean);
  });
});

// The oracle is only worth its ceiling if it is not simply blind. These are cases
// where conversion is known to be faithful, and a regression in the oracle itself
// — a normalisation that swallows a real difference — shows up here first.
//
// What this block proves is narrower than its names suggest, and that is the
// point of the block below it: `real emphasis` here only says the words `bold`
// and `italic` came back. It would say exactly the same if the emphasis had been
// dropped, because the text oracle compares characters and emphasis is not one.
describe('oracle sanity', () => {
  it.each([
    ['plain text', '<p>hello world</p>'],
    ['real emphasis', '<p><b>bold</b> and <i>italic</i> text</p>'],
    ['literal asterisks', '<p>Use **bold** here</p>'],
    ['literal heading marker', '<p># not a heading</p>'],
    ['heading', '<h2>Title</h2><p>body</p>'],
    ['list', '<ul><li>one</li><li>two</li></ul>'],
    ['pipe table', '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'],
    ['code block', '<pre><code>x = 1</code></pre>'],
    ['blockquote', '<blockquote><p>quoted</p></blockquote>'],
  ])('%s round-trips', (_name, html) => {
    const trip = roundTrip(html);
    if (!trip.faithful) throw new Error(describeFailure(html, trip));
    expect(trip.faithful).toBe(true);
  });
});

// The other oracle, on the differences the text one is built not to see. Every
// case here keeps its characters, so the block above passes on all of them; what
// changes is what the document *claims* about those characters.
//
// Recorded as they behave today, including where that is wrong, so a repair has
// to come here and say so. The third column is whether the claims survive; the
// comment above each `false` says whether the difference is a decision or a
// defect, because the gate cannot tell them apart and a reader has to be able to.
describe('structural sanity', () => {
  it.each([
    // --- faithful: what a repair must not break ---
    ['emphasis survives', '<p><b>bold</b> and <i>italic</i> text</p>', true],
    ['nested emphasis survives', '<p><strong>bold <em>and italic</em></strong></p>', true],
    ['emphasis against punctuation', '<p>a<b>(bold)</b>b</p>', true],
    ['emphasis against an emoji', '<p>🎉<em>x</em>🎉</p>', true],
    [
      'emphasis in a table cell',
      '<table><tbody><tr><td>h</td></tr><tr><td><b>bold</b></td></tr></tbody></table>',
      true,
    ],
    ['a link keeps its target', '<p><a href="https://e.com/a?b=1&c=2">label</a></p>', true],
    // `%20` for a space is how a Markdown link spells the same URL, not a new one.
    ['a link target with a space', '<p><a href="https://e.com/a b">t</a></p>', true],
    ['a link target with parens', '<p><a href="https://e.com/a(b)c">t</a></p>', true],
    ['an image keeps src and alt', '<p><img src="https://e.com/a.png" alt="a picture"></p>', true],
    [
      'a cell keeps its column',
      '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
      true,
    ],
    ['blank lines between paragraphs', '<p>one</p><p>two</p><p>three</p>', true],
    ['list items stay separate', '<ul><li>one</li><li>two</li></ul>', true],
    ['a nested list stays nested', '<ul><li>one<ul><li>deep</li></ul></li></ul>', true],
    ['a blockquote stays quoted', '<blockquote><p>quoted</p></blockquote>', true],
    ['kbd becomes a code span', '<p><kbd>Ctrl</kbd></p>', true],
    ['samp becomes a code span', '<p><samp>out</samp></p>', true],
    ['pre keeps its lines', '<pre><code>a\nb</code></pre>', true],
    ['pre with a br', '<pre>a<br>b</pre>', true],
    ['strikethrough survives', '<p><del>gone</del> here</p>', true],

    // --- deliberate: differences the product chose ---
    // `headingOffset: 1` — the page title takes h1, so everything below moves
    // down one. Nothing to repair; the case is here so that a change to the
    // offset cannot happen quietly.
    ['a heading is demoted by one', '<h2>a <em>b</em> c</h2>', false],
    // A pipe table has no caption, so it becomes a paragraph above the table.
    [
      'a caption becomes a paragraph',
      '<table><caption>cap</caption><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
      false,
    ],
    // A spanned cell fills one column and blanks the rest. Repeating its text
    // across the span would read worse than leaving the slot empty.
    [
      'a merged cell fills one column',
      '<table><tbody><tr><th>h1</th><th>h2</th></tr><tr><td colspan="2">wide</td></tr></tbody></table>',
      false,
    ],
    [
      'a rowspan continuation is blank',
      '<table><tbody><tr><th>h1</th><th>h2</th></tr><tr><td rowspan="2">tall</td>' +
        '<td>a</td></tr><tr><td>b</td></tr></tbody></table>',
      false,
    ],
    // The fold that replaced the HTML fallback: the inner grid becomes one cell of
    // ` · `-joined text, so its own columns stop existing. Deliberate, and already
    // the reason the ceiling above rose once.
    [
      'a nested table folds into its cell',
      '<table><tbody><tr><td><table><tbody><tr><td>x</td><td>y</td></tr></tbody></table>' +
        '</td></tr><tr><td>outer</td></tr></tbody></table>',
      false,
    ],

    // --- wrong: defects this oracle is the first to name ---
    // Should be `code:a b`. The rule converts the code span's children instead of
    // taking its text, so `**` reaches a context where Markdown is not parsed and
    // the reader sees the asterisks. The text oracle catches this one too.
    ['emphasis inside a code span', '<p><code>a <b>b</b></code></p>', false],
    // Should fold exactly as the case above does. The fold looks at the cell's
    // own children, so one wrapper hides the inner table from it — and the pipe
    // table it emits instead lands inside a cell, where the reader gets
    // `| x | y |` as text. A `<div>` around a table is ordinary page markup.
    [
      'a nested table behind a div is not folded',
      '<table><tbody><tr><td><div><table><tbody><tr><td>x</td><td>y</td></tr></tbody></table>' +
        '</div></td></tr><tr><td>outer</td></tr></tbody></table>',
      false,
    ],
    // Should be `pre:lost kept`. With both a `<br>` and a `<code>` inside, only
    // what the `<code>` held survives; the rest of the block is dropped.
    ['pre with a br and a code loses text', '<pre>lost<br><code>kept</code></pre>', false],
    // Should keep `cap`. The inner table's caption has no slot in the fold and is
    // dropped instead of being joined with the cells.
    [
      "a nested table's caption is dropped",
      '<table><tbody><tr><td><table><caption>cap</caption><tbody><tr><td>x</td><td>y</td></tr>' +
        '</tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>',
      false,
    ],
  ])('%s', (_name, html, faithful) => {
    const trip = roundTripStructure(html as string);
    // A case recorded as faithful reports what broke; one recorded as wrong only
    // has to still be wrong in the same way.
    if (faithful && !trip.faithful) {
      throw new Error(describeStructuralFailure(html as string, trip));
    }
    expect(trip.faithful).toBe(faithful as boolean);
  });
});
