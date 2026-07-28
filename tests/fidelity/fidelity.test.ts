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
// It fell from 74 when neighbouring inline runs stopped colliding — 8 seeds, all
// on the emphasis-flanking axis, which lost 7 of its 12 classes. Two adjacent
// wrappers used to run their delimiters into one: `<em>a</em><em>b</em>` was
// written `*a**b*`, a single emphasis around `a**b`, and two code spans merged
// into one holding stray backticks. What is left on that axis is content the page
// showed as delimiters — `~word~`, `<b>**</b>` — where the escape and the marker
// have to share the same characters.
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
//
// Measured again once the four parallel repairs were joined: 94, not 98. The
// emphasis work above and the generator's new shapes landed in the same tree, and
// four of the seeds the generator newly reached were the collisions that work had
// already fixed.
//
// Then 94 -> 76 across three more repairs. The concatenation axis is gone
// entirely: link brackets are now escaped against a bounded lookahead, so
// `<span>[</span>x](url)` no longer assembles. A nested table behind a wrapper is
// folded, a <pre> holding both a <br> and a <code> keeps both, and a link
// destination containing `](` no longer ends itself.
//
// Some classes here look new and are not. A class is keyed by the shrunk minimal
// document, so repairing one defect lets the shrinker reach a different,
// pre-existing one in the same seed. Each was checked directly: byte-identical
// Markdown before and after, failing on both.
//
// Then 76 -> 91, and this rise is a decision rather than a regression. A nested
// table's empty cells used to be dropped before the fold joined the rest with
// ` · `, so `a · b` was what both a two-cell row and a three-cell row with a gap
// produced, and the reader could not tell which column a value sat in. Keeping
// the positions costs a separator the page did not show — the same trade the
// separator itself was accepted on — and every one of the 15 added seeds is that.
//
// Then 91 -> 89, and this fall is *not* ground won. The generator learned to emit
// CSS declarations — `style` and the content script's snapshot attribute, the two
// ways a mark now reaches the converter without a tag — and a new draw from the
// same rng reshuffles every seed. The number is a different measurement, not a
// better one, and comparing it to 91 says nothing. What it did buy is 8 classes on
// an axis that had none, all of them the meeting of the two escapers: a delimiter
// the style writes lands against text the per-node escaper already spelled, and
// neither can see the other. `<p>~<span style="text-decoration-line:line-through">
// x</span></p>` is the sharpest — `~~~x~~` renders as nothing at all, so the
// reader loses the text outright rather than seeing a stray marker.
//
// Two of those 8 are the same document written both ways, once with `style` and
// once with the snapshot attribute. That pair is deliberate: it is the standing
// proof that the two paths are read as one, and repairing the defect must move
// both lines or the seam has come apart.
//
// Then 89 -> 84, and this one is ground won. A single tilde at the edge of a text
// node is now escaped: it used to render as itself, which is true of a tilde alone
// and false of one standing next to a node that emits `~~`. `~` then a struck `x`
// wrote `~~~x~~`, a run that closes nothing, and the text disappeared from the
// page rather than gaining a stray marker — the only defect the survey has found
// that costs content instead of characters. A tilde mid-sentence still pays
// nothing, so `~/src` and `~5 min` read as they always did.
//
// Eight classes arrived with that repair and none of them is new: each was
// checked directly against the previous commit and fails there identically. A
// class is keyed by its shrunk document, so a seed that stops failing on the
// tilde shrinks to whatever else it was already carrying.
//
// Then 84 -> 84, and the total sitting still is exactly the case this file's
// second test exists for. Three classes went and two arrived. The three are the
// tilde rule learning to ask whether a partner exists rather than where in the
// node the tilde stands: `~word~` after any prefix used to be written `~word\~`,
// and a backslash does not stop the renderer that draws the preview from closing
// a `<del>` on it, so the reader lost `~word~` and gained a stray `\`. The two
// that arrived are the ` · ` fold on a nested table, already fifty lines of this
// list, reached by the shrinker only now that the same seeds stop failing on the
// tilde first; both were run against the previous commit and fail there
// identically.
//
// Then 84 -> 83, and this is ground won. A text node opening a line was found by
// asking its parent alone, so `<p>…<br><span># x</span></p>` — a run wrapped the
// way every chat interface wraps one — left the `#` unescaped at the start of a
// line and the reader's literal `# x` came back a real H1, taking the break
// before it along. The question walks up through inline wrappers now, stopping at
// any that writes a delimiter of its own, because escaping inside an emphasis
// fallback shows the backslash. `<p><span># </span></p>` and
// `<p><span>1. </span></p>` are the two classes that went.
//
// One arrived: `<p><a href="javascript:alert(1)"> </a># </p>`, where the link is
// dropped for its scheme and the `#` it left behind is at the start of a line
// after all. Run against the previous commit, where it fails identically — the
// shrinker reaches it only now that the two classes above stop failing first.
// Then 83 -> 82, and this is ground won. A hard break with nothing left to break
// — a `<br>` a block ends on, or one a page puts between two blocks to draw
// vertical space — wrote a backslash on a line of its own, and the renderer shows
// it. `<p>(https://example.com/i.png)\\</p>` is the class that went. The run
// becomes the blank line it was drawing; inside a paragraph both `a\\b` and two
// breaks in a row are untouched, because there the reader saw them.
//
// Found on Hacker News, where every layout table is followed by one: a captured
// discussion page carried 133 lines holding a lone backslash.
//
// Then 82 -> 81, and this is ground won. An element that writes no character was
// read as ink on the line, so the text after it went unescaped at the head of
// one: `<p><a href="javascript:alert(1)"> </a># </p>` — the link dropped for its
// scheme — put the page's literal `#` where a renderer reads an empty heading,
// and the character left the file. That class went and none arrived, across four
// conversion changes measured together: this one, a style mark that now goes
// round the run wearing it rather than round the whole assembled line, the
// semantic containers that now write the block they draw, and a code block's
// language bar lifted out of the paragraph it was arriving as.
//
// Two of those four are invisible here by construction. The mark is a claim the
// text oracle cannot see — `structure()` is what measures it, and it had to be
// taught the same distinction before it could, since it read the face off the
// element and applied it to the whole subtree exactly as the converter did. The
// language bar is a deliberate loss of characters, like the `<details>` fold: a
// control's caption and a label the fence now carries as its info string.
//
// Then 81 -> 81, and the class list is identical: three conversion changes that
// this generator cannot reach. A player dropped for its scheme or its address
// (`about:blank`, `data:`) now writes nothing on the line, as the link dropped
// for its scheme already did; a child that converted to nothing no longer ends a
// run of a style mark, which is a DOM comment mid-run; and a language bar is
// refused where the wrapper holds text of its own or the bar holds a heading at
// any depth. The generator writes none of the three — it emits no `<iframe>`, no
// comment inside a styled run, and no code block with a bar beside it — so the
// measurement records that nothing moved rather than that nothing was fixed.
// Each has its own test: two in `no-live-markup.test.ts`, which is where the
// reader's characters are checked after a render, and the third in the core.
const SEEDS = 200;
const CEILING = 81;

// The defect classes as they stand, keyed by the minimal input that still shows
// each one — the survey's own output, recorded. This is the half a total cannot
// do: a swap moves a line in and a line out while the count sits still, and the
// failure names both.
//
// Regenerate with `bun tests/fidelity/survey.ts 200` after a deliberate change.
const RECORDED_CLASSES: readonly string[] = [
  "<p style=\"font-weight:700;font-style:italic\"><b>**</b></p>",
  "<p>(https://example.com)&lt;div&gt; x `</p>",
  "<p>(https://example.com)&lt;table&gt;</p>",
  "<p>(https://example.com)<b>text</b></p>",
  "<p>(https://example.com)<i>word</i></p>",
  "<p>(https://example.com)<img src=\"https://example.com/a&quot;b\" alt=\"word\"></p>",
  "<p>(https://example.com)[x](https://example.com)</p>",
  "<p>(https://example.com)_</p>",
  "<p>(https://example.com/i.png)<b>x</b></p>",
  "<p>(https://example.com/i.png)<kbd>word</kbd></p>",
  "<p>(https://example.com/i.png)<strong>a</strong></p>",
  "<p>(https://example.com/i.png)_under_</p>",
  "<p><code data-s2md-style=\"display:block\">``</code>&lt;/table&gt;</p>",
  "<p><img src=\"\" alt=\"a\"></p>",
  "<p><img src=\"\" alt=\"foo bar\"></p>",
  "<p><samp data-s2md-style=\"display:block\">x</samp>x](https://example.com)</p>",
  "<p><span data-s2md-style=\"font-weight:700;text-decoration-line:line-through\">a &lt;</span>!-- swallowed --&gt; b</p>",
  "<p><span style=\"font-weight:700;text-decoration-line:line-through\">a &lt;</span>!-- swallowed --&gt; b</p>",
  "<p><span style=\"text-decoration-line:line-through\">~~</span></p>",
  "<p>x](https://example.com)&lt;/table&gt;</p>",
  "<p>x](https://example.com)<strong>hello world</strong></p>",
  "<p>🇺🇸<i data-s2md-style=\"font-weight:700\">x</i></p>",
  "<p>🎉<b>:</b></p>",
  "<table><tbody><tr><td colspan=\"2\"><span data-s2md-style=\"display:block\">\\</span>foo bar</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td> </td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>!-- swallowed --&gt; b</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>![</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>(</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>(https://example.com)</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>--&gt;</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>1. </td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>[</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>hello world</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>word</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>x</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>~word~</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><div><table><tbody><tr><td>🎉</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption> </caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>![alt]</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>##</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>&amp;amp;</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>&lt;!--</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>(https://example.com)</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>(https://example.com/i.png)</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>*</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>*bold*</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>===</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>a</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>x</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>~</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><caption>❤️</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td> </td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>![</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>&lt;td colspan=\"2\"&gt;</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>*bold*</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>--&gt;</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>!-- swallowed --&gt;</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>#</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>&lt;/td&gt;</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>)</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>===</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>foo bar</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>hello world</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>~word~</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td></td><td>❤️</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>===</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>word</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>x](https://example.com)</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
  "<table><tbody><tr><td><table><tbody><tr><td>~word~</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>",
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
  // No `esc()` here, unlike katex: <script> is a raw-text element, so entities
  // inside it are never decoded and the LaTeX would arrive doubly encoded. Every
  // mathjaxV2 row below was measuring that instead of the escaping it names, and
  // `md.includes(tex)` was false whatever the converter did.
  const mathjaxV2 = (tex: string) => `<script type="math/tex">${tex}</script>`;
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
    ['a & b_1', mathjaxV2, true, true],
    ['x < y', katex, true, true],
    ['x < y', mathjaxV2, true, true],
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

    // The same claims written in the other language a page has for them. Every
    // one of these read as plain text until the style attribute was read, and
    // none of them changed a single character while doing so — which is why they
    // belong here and are invisible to the oracle above.
    ['a styled bold run survives', '<p><span style="font-weight:700">bold</span> text</p>', true],
    ['a styled italic run survives', '<p><span style="font-style:italic">slanted</span> text</p>', true],
    [
      'a styled strikethrough survives',
      '<p><span style="text-decoration:line-through">gone</span> here</p>',
      true,
    ],
    // The style is what the reader saw, so the tag's mark must not be written.
    ['a style that declines its tag', '<p><strong style="font-weight:normal">plain</strong> text</p>', true],
    // A header cell is bold in every renderer, so the declaration claims nothing
    // the output does not already make — writing `**` here would *add* a claim.
    [
      'a bold table header claims nothing extra',
      '<table><thead><tr><th style="font-weight:700">h</th></tr></thead>' +
        '<tbody><tr><td>a</td></tr></tbody></table>',
      true,
    ],
    [
      'a bold body cell is a claim of its own',
      '<table><thead><tr><th>h</th></tr></thead>' +
        '<tbody><tr><td style="font-weight:bold">a</td></tr></tbody></table>',
      true,
    ],

    // --- deliberate: differences the product chose ---
    // `topHeadingLevel: 2` raises a capture that starts deeper — a chat answer
    // written under `<h3>` comes back at `##` — and never pushes one down: an
    // `<h1>` is the rank the page gave its own title. Both are here so that a
    // change to the policy cannot happen quietly.
    ['a top-level heading keeps its level', '<h1>a <em>b</em> c</h1>', true],
    ['a heading below the top keeps its level', '<h2>a <em>b</em> c</h2>', true],
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
    // `display:block` on a `<span>` is three lines on the page and three
    // paragraphs in the file, which is the conversion doing exactly the right
    // thing. What cannot follow it is this oracle: a browser wraps `A` and `C` in
    // anonymous block boxes that exist in no markup, so there is nothing here to
    // read them off, and the input still reads as the one paragraph the `<p>` is.
    // The text oracle above agrees with the conversion, which is where the claim
    // that it is right actually rests.
    [
      'a block-displayed span splits its paragraph',
      '<p>A<span style="display:block">B</span>C</p>',
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
    // Recorded as a defect, and repaired in the same round by the inline-code
    // rule taking the child's text instead of its converted Markdown.
    ['emphasis inside a code span', '<p><code>a <b>b</b></code></p>', true],
    // Load-bearing since the scheme list was widened to DOMPurify's own: a
    // shorter list in the core would drop links the panel's sanitizer keeps.
    ['a link keeps a tel: target', '<p><a href="tel:+15551234">call</a></p>', true],
    // A <pre> behind a wrapper folds exactly as a direct child does; before, the
    // wrapper dropped a fenced block into a pipe cell.
    [
      'a wrapped pre in a cell',
      '<table><tr><td>h</td></tr><tr><td><div><pre>a\nb</pre></div></td></tr></table>',
      false,
    ],
    // An empty cell in a nested table keeps its position, so a value cannot move
    // column silently. Unfaithful for the fold's own sake, like the cases above.
    [
      'an empty cell in a nested table',
      '<table><tr><td><table><tr><td>a</td><td></td><td>b</td></tr></table></td></tr></table>',
      false,
    ],
    // A `](` in a destination ends it only when an unbalanced `[` sits ahead of
    // the link in the page's text — which is the shape a footnote marker makes.
    ['a link target holding a bracket-paren', '<p>[<a href="https://e.com/a](x)b">x</a></p>', true],
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
    // Repaired: the `<code>` is read alone only when it is all the `<pre>` holds.
    ['pre with a br and a code loses text', '<pre>lost<br><code>kept</code></pre>', true],
    // `cap` reaches the file now, as the folded cell's first line. Still recorded
    // unfaithful because the fold itself is — the ` · ` join is a deliberate
    // difference, not a lost caption.
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
