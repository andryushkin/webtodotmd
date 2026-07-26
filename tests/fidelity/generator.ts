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

// The one import: the snapshot attribute's name, taken from the core rather than
// spelled again, so a rename cannot leave the generator quietly measuring an
// attribute nothing reads.
import { SNAPSHOT_ATTR } from '../../core/src/utils/inline-style';

/** Documents are generated as data, so the shrinker can take them apart. */
export interface Part {
  /** Inline wrapper around the text, or null for a bare text node. */
  tag: string | null;
  text: string;
  /** Attribute value for the tags that carry one — `href` on `a`, `src` on `img`. */
  attr?: string;
  /** CSS declarations on the wrapper — see `STYLE_HAZARDS`. */
  style?: string;
  /** Which attribute carries them: the page's own, or the content script's snapshot. */
  styleVia?: StyleVia;
}
export interface Block {
  kind: BlockKind;
  parts: Part[];
  /** Attribute value for the kinds that carry one — the fence info string. */
  attr?: string;
  /** CSS declarations on the block, for the kinds rendered as a plain wrapper. */
  style?: string;
  styleVia?: StyleVia;
}
export type StyleVia = 'attr' | 'snapshot';
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
  // The three shapes a pipe table cannot express. They no longer reach for HTML
  // by default — they are flattened — so these are the coverage for the code
  // that does the flattening: the grid, the nested-table fold and the code-span
  // fold each have their own kind here.
  'td-merged',
  'td-rowspan',
  'td-nested',
  'td-pre',
  // Three shapes of the nested-table fold that the plain `td-nested` never
  // reaches. The fold joins cells with a separator, drops the ones it reads as
  // empty, and finds the inner table by walking the cell — so an empty cell, a
  // caption it has no slot for, and a wrapper between the cell and the table are
  // each a different question about the same code.
  'td-nested-empty',
  'td-nested-caption',
  'td-nested-div',
  // A line break inside preformatted text: the source shows two lines, and the
  // fence has to as well. `<br>` is how a page writes one when the markup was
  // generated rather than typed.
  'pre-br',
  // The fence info string, which is an attribute value and reaches the file
  // outside every text path.
  'pre-lang',
] as const;
type BlockKind = (typeof BLOCK_KINDS)[number];

// `kbd` and `samp` are here because the core makes them code spans, which is the
// one wrapper that changes what escaping is allowed inside it. `img` carries no
// text of its own — its part text becomes the `alt`.
const INLINE_TAGS = [
  null, 'span', 'b', 'i', 'em', 'strong', 'a', 'code', 'sub', 'kbd', 'samp',
] as const;

const EMPHASIS_TAGS = ['b', 'i', 'em', 'strong'] as const;

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

// Attribute values reach the file inside the converter's own syntax — `[t](href)`,
// `![alt](src)` — where a value that closes the construct from the inside leaves
// everything after it as markup. Nothing in the text escaper ever sees an
// attribute, so the hazards here are the ones that end a link destination:
// whitespace, an unbalanced paren, a quote, a bracket that starts a new one.
const ATTR_HAZARDS = [
  'https://example.com/a(b)c',
  'https://example.com/a)b',
  'https://example.com/a b',
  'https://example.com/a"b',
  "https://example.com/a'b",
  'https://example.com/a`b`',
  'https://example.com/x?a=1&b=2',
  'https://example.com/x#<div>',
  'https://example.com/a](x)b',
  'https://example.com/a\nb',
  'javascript:alert(1)',
  '',
];

// The info string after the opening fence. A newline in it closes the fence
// immediately, and everything the page put in the block lands in prose.
const LANG_HAZARDS = ['js', 'js x', 'js\n```\n<div>', '```', '<div>', 'a`b'];

// Declarations that decide a mark, which is the axis a tag cannot reach: a style
// writes emphasis where no tag says any, and it takes a tag's emphasis away again.
// Both halves matter to the oracle, because a mark that appears and a mark that
// vanishes are the same defect seen from opposite sides.
//
// The hazard is the meeting of the two escapers. A declaration puts `**` around
// text the per-node escaper already decided how to spell, and neither can see the
// other: `*` inside a bold run is a marker pressed against a marker, and the
// flanking rules that pick between `_` and `**` never learn a delimiter is coming.
const STYLE_HAZARDS = [
  'font-weight:700',
  'font-weight:normal',
  'font-style:italic',
  'font-style:normal',
  'text-decoration-line:line-through',
  'font-weight:700;font-style:italic',
  'font-weight:700;text-decoration-line:line-through',
  // Not a mark but a boundary: an inline element that lays out as a block splits
  // the text around it, which is where a block-opening hazard lands mid-paragraph.
  'display:block',
];

// The two ways declarations reach the converter, and they are read as one: the
// page's own attribute (what an editor pastes) and the attribute the content
// script writes after reading the cascade. Generating both is what keeps the
// snapshot path measured rather than assumed.
const STYLE_VIA: readonly StyleVia[] = ['attr', 'snapshot'];

// Emphasis pressed against an emoji. CommonMark decides whether a marker may open
// or close by the Unicode category on each side, and an emoji is neither a letter
// nor ASCII punctuation — so this is where "is this marker allowed here" is least
// obvious. The multi-codepoint ones are here because a naive look at the
// neighbouring *code unit* sees half a surrogate pair.
const EMOJI = ['🎉', '👍🏽', '👩‍💻', '❤️', '🇺🇸'];

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
      if (roll < 0.29) {
        parts.push({ tag: 'code', text: pick(CODE_HAZARDS) });
        continue;
      }
      if (roll < 0.36) {
        parts.push({ tag: null, text: pick(HTML_PROSE) });
        continue;
      }
      if (roll < 0.43) {
        // The emoji has to sit in its own text node on each side, or the marker
        // is not the thing being pressed against it.
        const emoji = pick(EMOJI);
        parts.push({ tag: null, text: emoji });
        parts.push({ tag: pick(EMPHASIS_TAGS), text: pick(CALM) });
        parts.push({ tag: null, text: emoji });
        continue;
      }
      if (roll < 0.52) {
        // A hostile attribute, with calm text around it: the text is not what is
        // being tested here, and a hazard in both would not say which one leaked.
        parts.push({ tag: rand() < 0.5 ? 'a' : 'img', text: pick(CALM), attr: pick(ATTR_HAZARDS) });
        continue;
      }
      if (roll < 0.60) {
        // A mark with no tag behind it: the span is only somewhere to hang the
        // declaration, and the hazard text is what the mark closes around.
        parts.push({
          tag: 'span',
          text: rand() < 0.75 ? pick(HAZARDS) : pick(CALM),
          style: pick(STYLE_HAZARDS),
          styleVia: pick(STYLE_VIA),
        });
        continue;
      }
      // Hazards outnumber calm text: a document of prose proves little here.
      const text = roll < 0.84 ? pick(HAZARDS) : pick(CALM);
      parts.push({ tag: pick(INLINE_TAGS), text });
    }

    // A second pass, so a declaration can also land *on top of* a tag rather than
    // instead of one. That is where the two disagree: over `<strong>` it is a
    // duplicate the core must not write twice, and `font-weight:normal` there has
    // to take the tag's own mark away.
    for (const part of parts) {
      if (part.tag === null || part.tag === 'img' || part.style !== undefined) continue;
      if (rand() < 0.14) {
        part.style = pick(STYLE_HAZARDS);
        part.styleVia = pick(STYLE_VIA);
      }
    }

    const kind = pick(BLOCK_KINDS);
    const block: Block =
      kind === 'pre-lang' ? { kind, parts, attr: pick(LANG_HAZARDS) } : { kind, parts };
    // A block's own weight is the baseline every part is judged against, so a
    // heading told it is not bold, or a paragraph told it is, moves the line for
    // everything inside it.
    if (rand() < 0.12) {
      block.style = pick(STYLE_HAZARDS);
      block.styleVia = pick(STYLE_VIA);
    }
    blocks.push(block);
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

// An attribute value needs the quote and the newline neutralized as well, or the
// fixture closes the attribute itself and the hazard never reaches the converter.
function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

/**
 * The style attribute, or nothing. `snapshot` writes the attribute the content
 * script leaves behind after reading the cascade — the core answers both through
 * the same reader, and a fixture that only ever used one would measure half of it.
 */
function styleAttr(styled: { style?: string; styleVia?: StyleVia }): string {
  if (styled.style === undefined) return '';
  const name = styled.styleVia === 'snapshot' ? SNAPSHOT_ATTR : 'style';
  return ` ${name}="${escapeAttr(styled.style)}"`;
}

function renderPart(part: Part): string {
  const text = escapeText(part.text);
  if (part.tag === null) return text;
  if (part.tag === 'a') {
    return `<a href="${escapeAttr(part.attr ?? 'https://example.com')}"${styleAttr(part)}>${text}</a>`;
  }
  // An image shows no text of its own, so the part's text is its alt — the other
  // attribute that reaches the file inside the converter's own syntax.
  if (part.tag === 'img') {
    const src = escapeAttr(part.attr ?? 'https://example.com/i.png');
    return `<img src="${src}" alt="${escapeAttr(part.text)}">`;
  }
  return `<${part.tag}${styleAttr(part)}>${text}</${part.tag}>`;
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
    case 'td-rowspan':
      return `<table><tbody><tr><td rowspan="2">${inner}</td><td>a</td></tr><tr><td>b</td></tr></tbody></table>`;
    // The payload goes in the *inner* cell: the fold's separator, its empty-cell
    // filtering and its pipe handling are what needs the hazard, not the cell
    // around it.
    case 'td-nested':
      return `<table><tbody><tr><td><table><tbody><tr><td>${inner}</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>`;
    // An empty inner cell: the fold drops the ones it reads as empty, and whether
    // it drops the separator with them is a different question from whether it
    // joins the rest.
    case 'td-nested-empty':
      return `<table><tbody><tr><td><table><tbody><tr><td></td><td>${inner}</td><td></td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>`;
    // A caption on the inner table, which the fold has no slot for at all.
    case 'td-nested-caption':
      return `<table><tbody><tr><td><table><caption>${inner}</caption><tbody><tr><td>x</td><td>b</td></tr></tbody></table></td></tr><tr><td>outer</td></tr></tbody></table>`;
    // A wrapper between the cell and the table it holds — the shape that decides
    // whether the fold looks for the inner table or only at the cell's children.
    case 'td-nested-div':
      return `<table><tbody><tr><td><div><table><tbody><tr><td>${inner}</td><td>b</td></tr></tbody></table></div></td></tr><tr><td>outer</td></tr></tbody></table>`;
    case 'td-pre':
      return `<table><tbody><tr><td><pre>${inner}</pre></td></tr></tbody></table>`;
    case 'pre-br':
      return `<pre>${block.parts.map(renderPart).join('<br>')}</pre>`;
    case 'pre-lang':
      return `<pre><code data-lang="${escapeAttr(block.attr ?? 'js')}">${inner}</code></pre>`;
    // Only the kinds rendered as one plain wrapper carry a block style. The rest
    // build a table around themselves, where "the block" is several elements and
    // which of them the declaration belongs on is a question this file should not
    // be answering.
    default:
      return `<${block.kind}${styleAttr(block)}>${inner}</${block.kind}>`;
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
    // Drop declarations — on a part, then on the block. Same rule as unwrapping a
    // tag: a style earns its place in the minimal case only by changing the
    // outcome, or every defect it merely rode along with would be reported as a
    // style defect.
    for (let b = 0; b < current.length; b++) {
      for (let p = 0; p < current[b]!.parts.length; p++) {
        if (current[b]!.parts[p]!.style === undefined) continue;
        tryReplace(
          current.map((blk, j) =>
            j === b
              ? {
                  ...blk,
                  parts: blk.parts.map((part, q) =>
                    q === p ? { tag: part.tag, text: part.text, attr: part.attr } : part,
                  ),
                }
              : blk,
          ),
        );
      }
    }
    for (let b = 0; b < current.length; b++) {
      if (current[b]!.style === undefined) continue;
      tryReplace(
        current.map((blk, j) =>
          j === b ? { kind: blk.kind, parts: blk.parts, attr: blk.attr } : blk,
        ),
      );
    }

    if (current !== before) changed = true;
  }
  return current;
}
