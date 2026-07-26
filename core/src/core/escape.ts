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

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

/** Marks that change the render wherever they appear. */
export function escapeInlineMarkdown(text: string): string {
  return (
    text
      // Backslash first, or the escapes below would read as literal pairs.
      .replace(/\\/g, '\\\\')
      .replace(/([*`])/g, '\\$1')
      // An underscore between word characters is not emphasis in CommonMark, so
      // `snake_case` renders as itself — escaping it is noise in the source.
      .replace(/_/g, (mark, index: number, text_: string) =>
        isWordChar(text_[index - 1]) && isWordChar(text_[index + 1]) ? mark : '\\_',
      )
      // Strikethrough needs a pair; a single tilde renders as itself.
      .replace(/~~/g, '\\~\\~')
      // Only a bracket followed by a paren is link or image syntax. A lone `[1]`
      // — a footnote marker, and Wikipedia is full of them — renders as itself,
      // so escaping it would be noise in the source for no gain.
      .replace(/(!?\[)([^\]\n]*)(\]\()/g, '\\$1$2\\$3')
  );
}

/** Constructs that only matter at the start of a line, escaped per line. */
export function escapeBlockStarts(md: string): string {
  return (
    md
      .replace(/^(\s*)(#{1,6})(\s|$)/gm, '$1\\$2$3')
      .replace(/^(\s*)>/gm, '$1\\>')
      .replace(/^(\s*)([-+])(\s)/gm, '$1\\$2$3')
      .replace(/^(\s*)(\d+)\.(\s)/gm, '$1$2\\.$3')
      // A line of dashes or equals signs is a thematic break or a setext
      // underline: it turns the line above it into a heading, or draws a rule
      // where the page showed characters. Escaping the first one is enough.
      .replace(/^(\s*)(-{3,}|={2,})(\s*)$/gm, '$1\\$2$3')
  );
}

/**
 * Escapes only what could open an HTML tag: `<` followed by a letter or a slash.
 * For text the converter re-emits as LaTeX, full escaping is corruption — `a & b`
 * is a matrix separator — but a literal `</td>` inside a formula still closes the
 * cell it lands in when the table falls back to HTML.
 */
export function escapeTagStarts(text: string): string {
  return text.replace(/<(?=[a-zA-Z/])/g, '&lt;');
}
