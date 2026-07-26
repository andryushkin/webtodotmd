// Deterministic input generator for the fidelity oracle.
//
// Hand-written cases only cover what someone thought to imagine, and the defects
// that survive review are exactly the ones nobody imagined: Markdown assembled
// across two text nodes, a block marker reached through an inline wrapper. The
// generator does not know which combinations are "natural", which is the point —
// it produces the ones a person would rule out.
//
// Seeded and dependency-free on purpose: the extension builds with build.sh and
// no node_modules, so a property-testing library would be a new constraint on the
// build for a test-only gain. A seed plus a shrinker gives the same reproduction.

/** Documents are generated as data, so the shrinker can take them apart. */
export interface Part {
  /** Inline wrapper around the text, or null for a bare text node. */
  tag: string | null;
  text: string;
}
export interface Block {
  kind: BlockKind;
  parts: Part[];
}
export type Doc = Block[];

const BLOCK_KINDS = [
  'p',
  'div',
  'h2',
  'blockquote',
  'li',
  'td',
  'caption',
  'figcaption',
  // The last two force the HTML table fallback — a nested table and a cell
  // holding preformatted text are what a pipe table cannot express, and the
  // fallback has escaping rules of its own. A merged cell no longer qualifies:
  // it is flattened onto the grid instead.
  'td-nested',
  'td-pre',
] as const;
type BlockKind = (typeof BLOCK_KINDS)[number];

const INLINE_TAGS = [null, 'span', 'b', 'i', 'em', 'strong', 'a', 'code', 'sub'] as const;

// Fragments, not whole constructs: a construct that is already complete inside one
// text node is the case the per-node escaper handles. What it cannot handle is the
// halves meeting after concatenation, so the dictionary is mostly halves.
const HAZARDS = [
  '#',
  '# ',
  '##',
  '>',
  '- ',
  '+ ',
  '1. ',
  '---',
  '===',
  '*',
  '**',
  '_',
  '__',
  '~',
  '~~',
  '`',
  '``',
  '[',
  ']',
  '](',
  '(',
  ')',
  '!',
  '![',
  '\\',
  '|',
  '<',
  '<!--',
  '-->',
  '</td>',
  '<div>',
  '&',
  '&amp;',
  ':',
];

const CALM = ['word', 'text', 'a', 'x', 'hello world', ' ', 'foo bar'];

// Halves that are each harmless alone and become markup once concatenated. Picked
// at random the two would practically never land adjacent in the right order — one
// specific pair out of 33×33 — so they are emitted as a unit. This is the axis the
// per-node escaper cannot see: every piece it inspects is genuinely safe.
const PAIRS: readonly (readonly [string, string])[] = [
  ['[text]', '(https://example.com)'],
  ['[', 'x](https://example.com)'],
  ['![alt]', '(https://example.com/i.png)'],
  ['~', '~word~'],
  ['*', '*bold*'],
  ['_', '_under_'],
  ['<', '!-- swallowed -->'],
  ['a <', '!-- swallowed --> b'],
];

// Text that reaches a code span. The core widens the fence when the content holds
// backticks, and the preview's own scanner has to agree about where that span
// ends — these are the shapes where the two can disagree.
const CODE_HAZARDS = ['`', '`` `', '<div> x `', 'a ` b', '<table>', '``'];

// Prose *about* HTML — the kind of page this extension gets used on, and the case
// the preview's table allow-list has to tell apart from the core's own markup.
const HTML_PROSE = [
  '<table>',
  '</table>',
  '<pre>x</pre>',
  '<td colspan="2">',
  '<table>\n<pre>x</pre>\n</table>',
  '<table style="position:fixed">',
];

/** mulberry32 — small, seedable, good enough to spread choices. */
function rng(seed: number): () => number {
  let s = seed + 0x6d2b79f5;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(seed: number): Doc {
  const rand = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

  const blocks: Block[] = [];
  const blockCount = 1 + Math.floor(rand() * 2);
  for (let b = 0; b < blockCount; b++) {
    const parts: Part[] = [];
    const partCount = 1 + Math.floor(rand() * 4);
    for (let p = 0; p < partCount; p++) {
      const roll = rand();
      if (roll < 0.25) {
        // A pair, split across two parts. The first keeps a wrapper so the halves
        // land in separate text nodes — without one the DOM merges them, and then
        // the escaper sees the whole construct and handles it correctly.
        const [first, second] = pick(PAIRS);
        parts.push({ tag: 'span', text: first });
        parts.push({ tag: null, text: second });
        continue;
      }
      if (roll < 0.32) {
        parts.push({ tag: 'code', text: pick(CODE_HAZARDS) });
        continue;
      }
      if (roll < 0.4) {
        parts.push({ tag: null, text: pick(HTML_PROSE) });
        continue;
      }
      // Hazards outnumber calm text: a document of prose proves little here.
      const text = roll < 0.8 ? pick(HAZARDS) : pick(CALM);
      parts.push({ tag: pick(INLINE_TAGS), text });
    }
    blocks.push({ kind: pick(BLOCK_KINDS), parts });
  }
  return blocks;
}

// Part text is what the page *shows*, never markup: `<div>` in the dictionary
// means a page with the characters "<div>" on it — a page about HTML, which is
// exactly the kind this extension gets used on. Structure comes from `tag` and
// `kind` alone. Without escaping here the generator silently built real elements
// and measured something else entirely.
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPart(part: Part): string {
  const text = escapeText(part.text);
  if (part.tag === null) return text;
  if (part.tag === 'a') return `<a href="https://example.com">${text}</a>`;
  return `<${part.tag}>${text}</${part.tag}>`;
}

/** Wraps blocks in the parent their tag requires, so the DOM is the real thing. */
function renderBlock(block: Block): string {
  const inner = block.parts.map(renderPart).join('');
  switch (block.kind) {
    case 'li':
      return `<ul><li>${inner}</li></ul>`;
    case 'td':
      return `<table><tbody><tr><td>${inner}</td></tr></tbody></table>`;
    case 'caption':
      return `<table><caption>${inner}</caption><tbody><tr><td>cell</td></tr></tbody></table>`;
    case 'figcaption':
      return `<figure><figcaption>${inner}</figcaption></figure>`;
    case 'td-nested':
      return `<table><tbody><tr><td>${inner}</td></tr><tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody></table>`;
    case 'td-pre':
      return `<table><tbody><tr><td><pre>${inner}</pre></td></tr></tbody></table>`;
    default:
      return `<${block.kind}>${inner}</${block.kind}>`;
  }
}

export function renderDoc(doc: Doc): string {
  return doc.map(renderBlock).join('');
}

/**
 * Greedily removes what the failure does not need, so two seeds that hit the same
 * defect report the same minimal input — that is what makes the survey a list of
 * defect classes rather than a list of seeds.
 */
export function shrink(doc: Doc, stillFails: (doc: Doc) => boolean): Doc {
  let current = doc;

  const tryReplace = (candidate: Doc): void => {
    if (candidate.length > 0 && candidate.some((b) => b.parts.length > 0) && stillFails(candidate)) {
      current = candidate;
    }
  };

  let changed = true;
  while (changed) {
    changed = false;
    const before = current;

    // Drop whole blocks.
    for (let i = 0; i < current.length; i++) {
      tryReplace(current.filter((_, j) => j !== i));
    }
    // Drop parts.
    for (let b = 0; b < current.length; b++) {
      for (let p = 0; p < current[b]!.parts.length; p++) {
        tryReplace(
          current.map((blk, j) =>
            j === b ? { ...blk, parts: blk.parts.filter((_, q) => q !== p) } : blk,
          ),
        );
      }
    }
    // Unwrap inline tags — the wrapper matters only when it changes the outcome.
    for (let b = 0; b < current.length; b++) {
      for (let p = 0; p < current[b]!.parts.length; p++) {
        if (current[b]!.parts[p]!.tag === null) continue;
        tryReplace(
          current.map((blk, j) =>
            j === b
              ? {
                  ...blk,
                  parts: blk.parts.map((part, q) => (q === p ? { ...part, tag: null } : part)),
                }
              : blk,
          ),
        );
      }
    }
    // Simplify the block wrapper: <p> is the plainest context there is.
    for (let b = 0; b < current.length; b++) {
      if (current[b]!.kind === 'p') continue;
      tryReplace(current.map((blk, j) => (j === b ? { ...blk, kind: 'p' as BlockKind } : blk)));
    }

    if (current !== before) changed = true;
  }
  return current;
}
