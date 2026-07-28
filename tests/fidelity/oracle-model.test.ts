// What the oracle believes the reader saw.
//
// The gate next door measures the conversion against this model, so a hole in the
// model is invisible there by construction: a rule that drops content the oracle
// still counts as seen reports as a defect only when the generator happens to
// write that shape, and a rule the oracle over-reads reports nothing at all until
// then. `<figure>` and `<form>` drifted apart from `SEMANTIC_BLOCKS` exactly that
// way and were repaired only when someone read both lists side by side.
//
// So the model is tested directly here, against the three rules that drop or
// reshape content before any rule sees it. `hidingVerdict` the oracle already
// knew; `foldCollapsedDetails` and `unwrapLayoutTables` arrived in the same diff
// as the `<figure>` repair and were not taught to it.
import { describe, it, expect, beforeAll } from 'bun:test';
import {
  installDOMAdapter,
  roundTrip,
  roundTripStructure,
  describeFailure,
  describeStructuralFailure,
  structure,
  visibleText,
} from './oracle';

beforeAll(() => {
  installDOMAdapter();
});

function expectFaithful(html: string): void {
  const text = roundTrip(html);
  expect(text.faithful ? '' : describeFailure(html, text)).toBe('');
  const claims = roundTripStructure(html);
  expect(claims.faithful ? '' : describeStructuralFailure(html, claims)).toBe('');
}

// The one hiding no style declares: the browser draws the body behind
// `::details-content`, so `hidingVerdict` reads a visible box and the oracle
// counted 500 words of MDN sidebar as text on the screen — for the file, a
// deliberate fold; for the gate, a paragraph the conversion had lost.
describe('oracle model: a folded <details> shows its summary and nothing else', () => {
  it('the body of a closed one was never on the page', () => {
    expect(visibleText('<details><summary>S</summary><p>body</p></details>')).toBe('S');
  });

  it('and it claims nothing either', () => {
    expect(structure('<details><summary>S</summary><p>body</p></details>')).toEqual(['para:S']);
  });

  it('one with no summary shows nothing at all', () => {
    expect(visibleText('<details><p>body</p></details>')).toBe('');
    expect(structure('<details><p>body</p></details>')).toEqual([]);
  });

  // Only the first `<summary>` is drawn; a second is body text like any other.
  it('a second summary is body text', () => {
    expect(visibleText('<details><summary>A</summary><summary>B</summary></details>')).toBe('A');
  });

  it('an open one is read whole', () => {
    expect(visibleText('<details open><summary>S</summary><p>body</p></details>')).toBe('S body');
  });

  it('both fixtures round-trip', () => {
    expectFaithful('<details><summary>S</summary><p>body</p></details>');
    expectFaithful('<details><p>body</p></details>');
    expectFaithful('<details open><summary>S</summary><p>body</p></details>');
  });
});

// A layout table is scaffolding the sanitizer takes away before any rule looks at
// it, so the file writes its cells as blocks and carries no grid at all. The
// oracle went on naming the columns, which is a claim nothing on the other side of
// the round trip could answer.
describe('oracle model: a layout table is blocks, not a grid', () => {
  it('the cells are the paragraphs the file writes', () => {
    expect(structure('<table border="0"><tr><td>left</td><td>right</td></tr></table>')).toEqual([
      'para:left',
      'para:right',
    ]);
  });

  it('role="presentation" says the same', () => {
    expect(structure('<table role="presentation"><tr><td>a</td><td>b</td></tr></table>')).toEqual([
      'para:a',
      'para:b',
    ]);
  });

  // A `role="presentation"` table may still hold a `<th>`, and the first row of a
  // layout table is no header: read as one it is bold by itself, and the `<b>`
  // inside it made a claim the page was said never to have made.
  it('the first row of a layout table is not bold', () => {
    expect(structure('<table border="0"><tr><td><b>a</b></td></tr></table>')).toEqual([
      'para:a',
      'strong:a',
    ]);
  });

  it('a real table still claims its grid', () => {
    expect(structure('<table><tr><td>a</td><td>b</td></tr></table>')).toEqual([
      'cell:a|a',
      'cell:b|b',
    ]);
  });

  // The two rules meeting: the outer table claims nothing, the inner one claims
  // the grid it keeps.
  it('a data table inside a layout cell claims its own grid and only that', () => {
    const html =
      '<table border="0"><tr><td>' +
      '<table><tr><th>Name</th></tr><tr><td>Ann</td></tr></table>' +
      '</td></tr></table>';
    expect(structure(html)).toEqual(['cell:Name|Name', 'cell:Name|Ann']);
  });

  it('the fixtures round-trip', () => {
    expectFaithful('<table border="0"><tr><td>left</td><td>right</td></tr></table>');
    expectFaithful('<table role="presentation"><tr><td>a</td><td>b</td></tr></table>');
    expectFaithful('<table border="0"><tr><td><b>a</b></td></tr></table>');
    expectFaithful(
      '<table border="0"><tr><td><a href="https://example.com">x</a></td></tr></table>',
    );
    expectFaithful(
      '<table border="0"><tr><td><table><tr><th>Name</th></tr><tr><td>Ann</td></tr></table></td></tr></table>',
    );
  });
});
