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
  // The last two force the HTML table fallback — a merged cell and a cell holding
  // preformatted text are exactly what a pipe table cannot express. Without them
  // the whole second layer (escapeHtmlTagsInMarkdown) is never exercised.
  'td-merged',
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
      // Hazards outnumber calm text: a document of prose proves little here.
      const text = rand() < 0.7 ? pick(HAZARDS) : pick(CALM);
      parts.push({ tag: pick(INLINE_TAGS), text });
    }
    blocks.push({ kind: pick(BLOCK_KINDS), parts });
  }
  return blocks;
}

function renderPart(part: Part): string {
  if (part.tag === null) return part.text;
  if (part.tag === 'a') return `<a href="https://example.com">${part.text}</a>`;
  return `<${part.tag}>${part.text}</${part.tag}>`;
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
    case 'td-merged':
      return `<table><tbody><tr><td colspan="2">${inner}</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>`;
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
