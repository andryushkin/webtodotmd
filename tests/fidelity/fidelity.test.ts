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
import { installDOMAdapter, roundTripCore, roundTripApp, describeFailure } from './oracle';
import { generate, renderDoc } from './generator';

beforeAll(() => {
  installDOMAdapter();
});

// Measured 2026-07-26 on the generator as it stands. Both layers sit at the same
// number because every failure so far originates in the core; the preview escaper
// neither adds nor repairs any of them.
const SEEDS = 200;
const CEILING = { core: 88, app: 88 };

function countFailures(level: 'core' | 'app'): number {
  let failures = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const html = renderDoc(generate(seed));
    try {
      const trip = level === 'core' ? roundTripCore(html) : roundTripApp(html);
      if (!trip.faithful) failures++;
    } catch {
      failures++;
    }
  }
  return failures;
}

describe('round-trip fidelity', () => {
  it.each(['core', 'app'] as const)('%s: no more failures than the recorded ceiling', (level) => {
    const failures = countFailures(level);
    expect(failures).toBeLessThanOrEqual(CEILING[level]);
    // Lower than the ceiling means something was fixed — record it, or the gate
    // silently stops protecting the ground that was just won.
    expect(failures).toBe(CEILING[level]);
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
    const trip = roundTripCore(html);
    if (!trip.faithful) throw new Error(describeFailure(html, trip));
    expect(trip.faithful).toBe(true);
  });
});
