// The fidelity gate.
//
// The oracle finds far more than is fixed today, so this file cannot demand zero
// failures yet — it holds a ceiling instead. A change that makes conversion less
// faithful pushes the count up and fails here; a change that fixes something
// pushes it down and fails here too, asking for the ceiling to be lowered. Either
// way the number moves deliberately, which is the whole point: before this, there
// was no way to tell whether the tail was shrinking.
//
// `bun tests/fidelity/survey.ts` prints what the failures actually are.
import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { installDOMAdapter, roundTrip, describeFailure, render } from './oracle';
import { generate, renderDoc } from './generator';
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
const SEEDS = 200;
const CEILING = 96;

function countFailures(): number {
  let failures = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const html = renderDoc(generate(seed));
    try {
      if (!roundTrip(html).faithful) failures++;
    } catch {
      failures++;
    }
  }
  return failures;
}

describe('round-trip fidelity', () => {
  it('no more failures than the recorded ceiling', () => {
    const failures = countFailures();
    expect(failures).toBeLessThanOrEqual(CEILING);
    // Lower than the ceiling means something was fixed — record it, or the gate
    // silently stops protecting the ground that was just won.
    expect(failures).toBe(CEILING);
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
