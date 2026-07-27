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

export function normalize(raw: string): string {
  return (
    raw
      .replace(/\u00A0/g, ' ') // &nbsp; the page wrote → обычный пробел
      // After the fold, never before: the marker exists to reach this line with
      // the page's own non-breaking spaces already gone.
      .replace(CODE_INDENT_MARK_PATTERN, '\u00A0')
      .replace(/[ \t]+$/gm, '') // trailing spaces per line
      .replace(/\n{3,}/g, '\n\n') // 3+ newlines → 2
      .replace(/^\n+/, '') // убрать leading newlines
      .trimEnd() + '\n' // единственный завершающий \n
  );
}
