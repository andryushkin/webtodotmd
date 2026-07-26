/**
 * Escaping for Markdown syntax that came from the page as plain text.
 *
 * Without it the conversion changes meaning: a page showing `**bold**` as
 * characters — a Markdown tutorial, a changelog, API prose — produced `**bold**`
 * in the file, which renders as bold. What the reader saw and what they get must
 * match, so those characters are escaped and render back as themselves.
 *
 * Deliberately minimal: every escape is a backslash the user reads in the source,
 * so only constructs that actually change the render are escaped. Splitting it in
 * two is not a style choice — inline marks are safe to escape per text node,
 * while block constructs depend on being at the start of a line, and a text node
 * is not a line. The parser splits text at every element boundary, so a node that
 * happens to begin with `>` sits mid-sentence as often as it starts a quote.
 */

/** Marks that change the render wherever they appear. */
export function escapeInlineMarkdown(text: string): string {
  return (
    text
      // Backslash first, or the escapes below would read as literal pairs.
      .replace(/\\/g, '\\\\')
      .replace(/([*_`~])/g, '\\$1')
      // Only a bracket followed by a paren is link or image syntax. A lone `[1]`
      // — a footnote marker, and Wikipedia is full of them — renders as itself,
      // so escaping it would be noise in the source for no gain.
      .replace(/(!?\[)([^\]\n]*)(\]\()/g, '\\$1$2\\$3')
  );
}

/** Constructs that only matter at the start of a line, escaped per line. */
export function escapeBlockStarts(md: string): string {
  return md
    .replace(/^(\s*)(#{1,6})(\s|$)/gm, '$1\\$2$3')
    .replace(/^(\s*)>/gm, '$1\\>')
    .replace(/^(\s*)([-+])(\s)/gm, '$1\\$2$3')
    .replace(/^(\s*)(\d+)\.(\s)/gm, '$1$2\\.$3');
}
