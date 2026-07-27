/**
 * The indentation of a code line folded into a pipe cell, before it becomes the
 * non-breaking space it stands for.
 *
 * `normalize()` turns every U+00A0 in the document into an ordinary space, and
 * that is right for the character the *page* wrote: a non-breaking space nobody
 * asked for is invisible in the file and breaks the next search or diff. The
 * converter writes one of its own for the opposite reason — a code span drops
 * leading ordinary spaces when the preview renders it as inline `<code>`, so the
 * shape of a folded sample survives only as U+00A0. Both are the same character
 * by the time the document is a string, so the fold undid the fold's own work
 * and the reader saw the sample flush left.
 *
 * A marker is what keeps them apart, and `preInCell` writes this one instead.
 * U+FDD0 is a permanent Unicode noncharacter: the standard guarantees it is
 * never assigned and is not meant for interchange, so no font draws it and no
 * page shows it — which is what the expansion below needs, since it cannot tell
 * a marker the page carried from one written here. Private use would not do:
 * U+E000 and its neighbours are exactly where icon fonts keep their glyphs, and
 * a page full of them is ordinary.
 *
 * `rules/tables.ts` imports it rather than spelling it again — a second spelling
 * desynchronises silently, and a marker nobody expands is a stray character in
 * the file, which is the very thing the fold exists to prevent.
 *
 * Built at runtime rather than written as a literal. The escape is ASCII in this
 * file, but the transpiler re-emits a string literal as the character it stands
 * for, so the bundle carried the noncharacter's own bytes \u2014 and Chrome validates
 * a content script with a UTF-8 check that rejects noncharacters, refusing the
 * whole manifest with "encoding other than UTF-8". The extension would not load
 * at all. `build.sh` scans the bundle for it now, because the failure is
 * invisible to every test that does not go through Chrome.
 */
export const CODE_INDENT_MARK = String.fromCharCode(0xfdd0);

const CODE_INDENT_MARK_PATTERN = new RegExp(CODE_INDENT_MARK, 'g');

/**
 * A newline inside a fenced block, hidden from the collapse below for the length
 * of `normalize()`.
 *
 * Every rule in that pipeline is about the space *between* blocks, and applied
 * inside one it rewrites the sample instead: a Python snippet that separated its
 * imports from its body with two blank lines came back with one, which is the
 * page's own text edited. Built at runtime and taken from the same noncharacter
 * block as `CODE_INDENT_MARK`, for the reason spelled out there — a literal
 * reaches the bundle and Chrome refuses the manifest.
 */
const FENCED_NEWLINE = String.fromCharCode(0xfdd1);

const FENCED_NEWLINE_PATTERN = new RegExp(FENCED_NEWLINE, 'g');

// An opening or closing fence: three or more backticks or tildes, indented or
// not. Read off the emitted Markdown rather than off the DOM, because by here
// that is all there is. A closer has to match its opener in character and be at
// least as long, or a sample printing ``` of its own would end the block early.
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})/;

function guardFences(raw: string): string {
  const lines = raw.split('\n');
  let fence: string | null = null;
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = FENCE_LINE.exec(line)?.[1];
    if (fence === null) {
      if (marker) fence = marker;
    } else if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
      fence = null;
    }
    out += line;
    // Decided after the line, so each fence line's own break belongs to the side
    // it is on: the one under an opener is inside the block, the one under a
    // closer is between blocks again.
    if (i < lines.length - 1) out += fence === null ? '\n' : FENCED_NEWLINE;
  }
  return out;
}

export function normalize(raw: string): string {
  return (
    guardFences(raw)
      .replace(/\u00A0/g, ' ') // &nbsp; the page wrote → обычный пробел
      // After the fold, never before: the marker exists to reach this line with
      // the page's own non-breaking spaces already gone.
      .replace(CODE_INDENT_MARK_PATTERN, '\u00A0')
      .replace(/[ \t]+$/gm, '') // trailing spaces per line
      // A hard break with nothing left to break: a `<br>` a block ends on, or one
      // a page puts between two blocks to draw vertical space without a
      // paragraph. Hacker News does both — a `<br>` after every table it lays the
      // page out with — and a discussion page came back carrying 133 lines that
      // held one backslash. The run becomes the blank line it was drawing.
      //
      // Only against a blank line or the end of the document. Inside a paragraph
      // `a\\\nb` is the break the reader saw, and `a\\\n\\\nb` is two of them.
      .replace(/(?:\\\n)+(?=\n|$)/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // 3+ newlines → 2
      .replace(/^\n+/, '') // убрать leading newlines
      // Unconditional, and last: a block the document never closed still holds
      // markers, and one left in the file is a character the page never had.
      .replace(FENCED_NEWLINE_PATTERN, '\n')
      .trimEnd() + '\n' // единственный завершающий \n
  );
}
