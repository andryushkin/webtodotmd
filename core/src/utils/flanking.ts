export function extractFlankingWhitespace(content: string): {
  leading: string;
  trimmed: string;
  trailing: string;
} {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content);
  return {
    leading: match?.[1] ?? '',
    trimmed: match?.[2] ?? '',
    trailing: match?.[3] ?? '',
  };
}

// CommonMark decides whether `*` or `_` opens emphasis from the two characters
// around the run, not from the tags in the source. Emitting `_x_` without asking
// produced text where the page had italics: `word<i>**</i>` became `word_\*\*_`,
// whose opening `_` sits between a letter and punctuation and so opens nothing —
// the reader lost the emphasis and gained two underscores.
//
// Undefined means the edge of the line, which the spec treats as whitespace.

function isWhitespace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

// The spec's "Unicode punctuation character": the P categories plus symbols.
function isPunctuation(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{P}\p{S}]/u.test(ch);
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** Left-flanking: the run can begin emphasis. */
export function isLeftFlanking(before: string | undefined, after: string | undefined): boolean {
  if (isWhitespace(after)) return false;
  return !isPunctuation(after) || isWhitespace(before) || isPunctuation(before);
}

/** Right-flanking: the run can end emphasis. */
export function isRightFlanking(before: string | undefined, after: string | undefined): boolean {
  if (isWhitespace(before)) return false;
  return !isPunctuation(before) || isWhitespace(after) || isPunctuation(after);
}

/**
 * Whether `marker…marker` around `content` actually renders as emphasis, given
 * the characters it will sit between.
 */
export function markerWorks(
  marker: string,
  content: string,
  before: string | undefined,
  after: string | undefined,
): boolean {
  const first = content[0];
  const last = content[content.length - 1];

  // The opening run sits between `before` and the content's first character; the
  // closing run between its last character and `after`.
  if (!isLeftFlanking(before, first)) return false;
  if (!isRightFlanking(last, after)) return false;

  if (marker.startsWith('_')) {
    // `_` additionally never works inside a word, which is what keeps
    // snake_case from turning into emphasis.
    if (isWordChar(before) || isWordChar(after)) return false;
    // And a run that flanks both ways may only open when punctuation precedes it.
    if (isRightFlanking(before, first) && !isPunctuation(before)) return false;
    if (isLeftFlanking(last, after) && !isPunctuation(after)) return false;
  }
  return true;
}

const BLOCK_BOUNDARY = new Set([
  'p', 'div', 'li', 'td', 'th', 'blockquote', 'section', 'article', 'main', 'dd',
  'dt', 'figcaption', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre',
]);

/**
 * The character that will precede the element's output. Read from the source DOM,
 * which is an approximation — a sibling rule can emit something else entirely —
 * but the last character of a text run survives escaping, and that is the one
 * that decides. Walks up through inline wrappers, and stops at a block, where the
 * line begins and the answer is "whitespace".
 */
export function charBefore(el: Element): string | undefined {
  let node: Node = el;
  for (;;) {
    const prev: Node | null = node.previousSibling;
    if (prev) {
      const text = prev.textContent ?? '';
      if (text.length > 0) return text[text.length - 1];
      node = prev;
      continue;
    }
    const parent = node.parentElement;
    if (!parent || BLOCK_BOUNDARY.has(parent.tagName.toLowerCase())) return undefined;
    node = parent;
  }
}

/** The character that will follow the element's output. */
export function charAfter(el: Element): string | undefined {
  let node: Node = el;
  for (;;) {
    const next: Node | null = node.nextSibling;
    if (next) {
      const text = next.textContent ?? '';
      if (text.length > 0) return text[0];
      node = next;
      continue;
    }
    const parent = node.parentElement;
    if (!parent || BLOCK_BOUNDARY.has(parent.tagName.toLowerCase())) return undefined;
    node = parent;
  }
}
