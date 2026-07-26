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
 * HTML the page showed as characters. Markdown passes raw HTML through, so a page
 * *about* HTML — documentation, a changelog, a tutorial — lost the text it was
 * showing: `</td>` vanished, `<pre>x</pre>` turned into a code block, and
 * `<!-- note -->` swallowed the rest of the sentence. The preview escaped these
 * for display, but the saved file kept them raw, so the two disagreed.
 *
 * As narrow as the Markdown escaping above, and for the same reason: `a < b` and
 * `Tom & Jerry` are not markup, and a backslash there is noise the reader pays
 * for. Only a `<` that could open a tag, a comment or a processing instruction,
 * and only an `&` that could complete a character reference.
 *
 * `continues` says another node's text will be joined onto the end of this one.
 * Both lookaheads stop where the string does, so a construct that begins at the
 * very end has nothing to be checked against and passes — a highlighter puts
 * `&lt;` in one span and `img src=…&gt;` in the next, each half harmless, and the
 * join is a live tag. There is no way to look at what is coming, so an unfinished
 * tail is escaped on suspicion instead.
 */
export function escapeHtmlSyntax(text: string, continues = false): string {
  const escaped = text
    .replace(/&(?=[a-zA-Z][a-zA-Z0-9]*;|#\d+;|#[xX][0-9a-fA-F]+;)/g, '\\&')
    .replace(/<(?=[a-zA-Z/!?])/g, '\\<');
  if (!continues) return escaped;
  // Only a tail that is still open: a `<` with nothing after it to judge, or an
  // `&` and the part of a character reference written so far. A `<` that already
  // has its next character here was decided above, and `&` in `Tom & Jerry` or
  // `AT&T ships` is followed by text that cannot be a reference either way.
  return escaped.replace(/(?:<|&(?:[a-zA-Z][a-zA-Z0-9]*|#[xX][0-9a-fA-F]*|#\d*)?)$/, '\\$&');
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

/**
 * The same problem outside a table cell: LaTeX is re-emitted between dollar
 * signs, and Markdown carries raw HTML, so a formula holding `<img src=x
 * onerror=…>` put working markup in the file.
 *
 * Stricter than `escapeTagStarts` because here there is no cell to protect and
 * every escape costs a formula: `a < b` and `x <y` are ordinary mathematics and
 * must survive untouched. Only a `<` that begins something a parser would take as
 * a tag or a comment — a name, then a matching `>` — is neutralized.
 *
 * `continues` means the same thing as in `escapeHtmlSyntax`, and here it is worse:
 * this rule wants the whole tag, opener and closing `>`, inside one string, so a
 * split anywhere in the middle defeats it. MathML splits by construction —
 * `<mo>&lt;</mo><mi>b</mi><mo>&gt;</mo>` is how a page writes `a < b > c`, and
 * with no math rule claiming it that is three text nodes joining into `<b>`.
 */
export function escapeMathTags(latex: string, continues = false): string {
  const escaped = latex.replace(
    /<(?:[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?\/?>|\/[a-zA-Z][a-zA-Z0-9]*\s*>|!--)/g,
    // Both delimiters, not just the opener: leaving the `>` behind produced
    // `&lt;b>` — half an entity, which KaTeX shows verbatim and no renderer
    // reassembles. A comment opener has no `>` to pair with and keeps its text.
    (match) => {
      const inner = match.slice(1);
      return `&lt;${inner.endsWith('>') ? `${inner.slice(0, -1)}&gt;` : inner}`;
    },
  );
  if (!continues) return escaped;
  // A tag that is still being written when the node ends: the `<` alone, a name
  // and its attributes so far, or a comment opener half typed. `x <=` keeps its
  // `<` — nothing appended after `=` can make that a tag.
  return escaped.replace(
    /<(?:\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?|\/|!-?)?$/,
    (match) => `&lt;${match.slice(1)}`,
  );
}
