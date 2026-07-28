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

import { isLeftFlanking, isRightFlanking } from '../utils/flanking.js';

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

/**
 * What the rest of the line writes on either side of this text node, as far as
 * the tilde question needs it. The parser gathers it; `''` is the edge of a line.
 */
export interface Seam {
  /** The tail of what is written before this node. */
  behind?: string;
  /** The head of what is written after it — also the bracket rule's lookahead. */
  ahead?: string;
}

/**
 * Strikethrough, which is the one mark a page can also show as characters.
 *
 * A `~` needs a partner to be markup at all, and with none it renders as itself
 * — which is why a lone one was left alone for a long time, and why the rule
 * that replaced that ("both edges of a text node pay") was wrong in the other
 * direction: `~/src`, `~5 min`, a `<td>~</td>` and a `## ~/home` all paid a
 * backslash for a partner that does not exist.
 *
 * The real question is whether a partner can reach it, and it is asked the same
 * way the bracket rule asks about `](`: over this node's text plus what the line
 * writes on each side of it. A backslash still goes only on a tilde inside this
 * node — the other half is its own node's business — but unlike the bracket rule
 * this one cannot rely on killing a single delimiter, so *both* halves of a
 * possible pair are escaped by their own nodes. A backslash does not disarm the
 * closing side: `~word\~\~\~` comes back as `<del>word\</del>~~` from the
 * renderer that draws the preview.
 *
 * What can be a partner:
 *
 *   - A run of two or more tildes, which is a delimiter on its own account.
 *     `~~x~~` is strikethrough and `~~~` at the head of a line is a code fence,
 *     so a run of ours always pays whatever stands around it.
 *   - Another `~` that CommonMark's flanking rules let close what this one opens,
 *     or the other way round. `see ~/src and ~/usr` has two and pays nothing:
 *     both can open, neither can close, so nothing pairs. `range 1~5 and 7~9`
 *     pays, because a tilde inside a word does both.
 *   - A `~` the neighbouring output puts on the line — the `~~` a `<del>` writes.
 *     `~` then a struck `x` made `~~~x~~`, a fence, and `x` left the page: the
 *     only defect the survey has found that costs content rather than characters.
 *
 * One clause has nothing to do with pairs. A `~` directly in front of a code
 * span's backtick stops the span opening at all — `` ~`text` `` renders as its
 * own five characters — so the tilde pays for a delimiter that is not even its
 * own. It is the `<del>` case seen from the other side: two escapers meeting at
 * a seam neither can see across.
 */
function escapeTildes(text: string, seam: Seam): string {
  if (!text.includes('~')) return text;
  // One string, exactly as the bracket rule builds one: the line as it will be
  // read, with this node's own slice marked off. Every neighbour is then an
  // ordinary character to the flanking tests, and the offsets stay honest.
  const behind = seam.behind ?? '';
  const line = `${behind}${text}${seam.ahead ?? ''}`;
  const start = behind.length;
  const end = start + text.length;

  const runs = [...line.matchAll(/~+/g)].map((match) => {
    const at = match.index;
    const length = match[0].length;
    const before = line[at - 1];
    const after = line[at + length];
    return {
      at,
      length,
      // A run of two or more is a delimiter on its own account, whatever stands
      // around it: `~~x~~` is strikethrough and `~~~` at the head of a line is a
      // fence. It is still weighed for flanking below, because a run that pays
      // can be the closer some earlier tilde needs escaping against.
      pays: length > 1 || after === '`',
      opens: isLeftFlanking(before, after),
      closes: isRightFlanking(before, after),
    };
  });

  // An opener with a closer somewhere after it, and the mirror of that. Either
  // half is enough to settle the pair, and each is escaped by its own node.
  let openerBefore = false;
  for (const run of runs) {
    if (run.closes && openerBefore) run.pays = true;
    if (run.opens) openerBefore = true;
  }
  let closerAfter = false;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i]!;
    if (run.opens && closerAfter) run.pays = true;
    if (run.closes) closerAfter = true;
  }

  let out = '';
  let cursor = start;
  for (const run of runs) {
    // Only the part of the run inside this node: a run that grew across the seam
    // — `~` meeting a `<del>` — belongs half to somebody else.
    const from = Math.max(run.at, start);
    const to = Math.min(run.at + run.length, end);
    if (!run.pays || from >= to) continue;
    out += `${line.slice(cursor, from)}${'\\~'.repeat(to - from)}`;
    cursor = to;
  }
  return out + line.slice(cursor, end);
}

/**
 * Escapes a `==` the page prints where a partner can pair with it.
 *
 * The mirror of the highlight rule: `<mark>` writes `==`, so a run of two or more
 * `=` in the page's own text is now a delimiter wherever the file is read by
 * something that knows the marker. `x==y and C==C++` is a sentence full of
 * comparisons and no highlight at all, and unescaped it hands `y and C` to the
 * reader in yellow.
 *
 * Weighed like the tildes above and for the same reason: a `=` at an edge pairs
 * with nothing, and the page's `x = y` or a `====` rule under a heading costs
 * nothing. Only a run of two counts — a single `=` is not the marker in any
 * dialect that has one.
 *
 * Both halves pay, since a backslash on the opener does not stop the closer
 * closing something further along, and neither node can see the other.
 */
function escapeHighlightMarkers(text: string, seam: Seam): string {
  if (!text.includes('==')) return text;
  const behind = seam.behind ?? '';
  const line = `${behind}${text}${seam.ahead ?? ''}`;
  const start = behind.length;
  const end = start + text.length;

  const runs = [...line.matchAll(/={2,}/g)].map((match) => {
    const at = match.index;
    const length = match[0].length;
    const before = line[at - 1];
    const after = line[at + length];
    return {
      at,
      length,
      pays: false,
      opens: isLeftFlanking(before, after),
      closes: isRightFlanking(before, after),
    };
  });

  let openerBefore = false;
  for (const run of runs) {
    if (run.closes && openerBefore) run.pays = true;
    if (run.opens) openerBefore = true;
  }
  let closerAfter = false;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i]!;
    if (run.opens && closerAfter) run.pays = true;
    if (run.closes) closerAfter = true;
  }

  let out = '';
  let cursor = start;
  for (const run of runs) {
    const from = Math.max(run.at, start);
    const to = Math.min(run.at + run.length, end);
    if (!run.pays || from >= to) continue;
    // One backslash is enough to take the run apart — `\==` is a literal `=`
    // followed by a single one, and no dialect reads that as a delimiter — but
    // every `=` of the run is escaped so the run cannot re-form from what is left
    // when the neighbour escapes its own half.
    out += `${line.slice(cursor, from)}${'\\='.repeat(to - from)}`;
    cursor = to;
  }
  return out + line.slice(cursor, end);
}

// Link and image syntax: an opener, a label with no `]` in it, and a `](`. Only a
// bracket that reaches a paren is markup. A lone `[1]` — a footnote marker, and
// Wikipedia is full of them — renders as itself, so escaping it would be noise in
// the source for no gain.
const LINK_SYNTAX = /(!?\[)([^\]\n]*)(\]\()/g;

/**
 * Whether reading the text ahead could change what this node gets escaped. Only a
 * match that *starts* here is this node's to escape, and every match starts at a
 * `[` — so a node without one needs no lookahead, and that is almost every node on
 * almost every page. The parser asks before it walks: the walk is cheap but it is
 * per text node, and a paragraph of four thousand highlighter spans pays for it
 * four thousand times.
 */
export function mayOpenLink(text: string): boolean {
  return text.includes('[');
}

/**
 * The one inline mark whose meaning depends on characters that may be in another
 * node. `*` and `` ` `` are escaped wherever they appear, so a split cannot smuggle
 * them past; a bracket is only markup when a `](` follows, and the parser hands the
 * two halves over separately: `<span>[text]</span>(url)` was two harmless strings
 * that became a working link once joined. The page showed the brackets and the
 * reader lost them.
 *
 * So the match runs over this node's text plus `seam.ahead` — the page's own text
 * that will be joined onto it, gathered by the parser — and a backslash is written
 * only for a delimiter that lies inside this node. The other half is either its own
 * node's business or already gone: killing one delimiter kills the link.
 *
 * Looking at what actually follows is what keeps the footnotes clean. The cheap
 * defensive rule — escape a `[` that ends a node — cannot tell `[2]` in a span from
 * the first half of a link, and would put a backslash in front of every citation
 * marker on a wiki page. Reading the text costs a bounded walk instead, and charges
 * a backslash only where a link really assembles.
 *
 * What it does cost: the seam is the page's text, not the Markdown the surrounding
 * nodes will emit. A rule that wraps its text in markers can break a match this
 * sees — `[a` then `<code>x](y)</code>` renders as a code span, not a link — and
 * then the reader pays one backslash for a link that was never there. The reverse,
 * a rule that *creates* a `](` out of nothing, would be missed; only a link or an
 * image emits one, and both already carry their own brackets.
 *
 * Tildes are escaped last of the marks, because every pass before them inserts a
 * backslash and would double the one they write.
 */
export function escapeInlineMarkdown(text: string, seam: Seam = {}): string {
  const marks = escapeTildes(
    text
      // Backslash first, or the escapes below would read as literal pairs.
      .replace(/\\/g, '\\\\')
      .replace(/([*`])/g, '\\$1')
      // An underscore between word characters is not emphasis in CommonMark, so
      // `snake_case` renders as itself — escaping it is noise in the source.
      .replace(/_/g, (mark, index: number, text_: string) =>
        isWordChar(text_[index - 1]) && isWordChar(text_[index + 1]) ? mark : '\\_',
      ),
    seam,
  );
  return escapeLinkSyntax(escapeHighlightMarkers(marks, seam), seam.ahead ?? '');
}

/**
 * The passes above only ever insert backslashes, so a match found here sits at the
 * same characters it would in the raw text — and `upcoming` can be appended raw for
 * the search, since the escaping its own node will get cannot remove a `[` or a
 * `](` either.
 */
function escapeLinkSyntax(text: string, upcoming: string): string {
  let out = '';
  let cursor = 0;
  for (const match of `${text}${upcoming}`.matchAll(LINK_SYNTAX)) {
    const [, opener = '', label = '', closer = ''] = match;
    const open = match.index ?? 0;
    // The opener itself has crossed the seam, so the `[` belongs to the next node
    // and is escaped there, against its own lookahead. Every later match is further
    // right and belongs to it too.
    if (open + opener.length > text.length) break;
    // The backslash goes on the `[`, never on the `!` of an image: `\!` only demotes
    // the image to a link, which is still a link the page never had.
    out += `${text.slice(cursor, open)}${opener.slice(0, -1)}\\[`;
    cursor = open + opener.length;
    const close = cursor + label.length;
    if (close + closer.length <= text.length) {
      out += `${text.slice(cursor, close)}\\${closer}`;
      cursor = close + closer.length;
    }
  }
  return out + text.slice(cursor);
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
 *
 * The name is a letter followed by `[\w-]` — letters, digits, underscores and
 * hyphens — because that is what a renderer takes as a tag name: CommonMark says
 * letters, digits and hyphens, and marked, which draws the preview, says `[\w-]`.
 * Reading only the alphanumeric part let a custom element through, and a custom
 * element is required to carry a hyphen: `<x-foo style="position:fixed">` was
 * read as ordinary mathematics and reached the file as a working positioned
 * overlay, taking the formula's text off the screen with it. Widening it does not
 * touch a single inequality — `a < b`, `x <y`, `x <= y` have no name to widen —
 * and it costs only `a <b-1> c`, which was already the price of `a <b> c`.
 *
 * `\lt` and `\gt`, not `&lt;` and `&gt;`. An entity is not LaTeX: KaTeX renders
 * it as an error, in red, so a formula that had been made safe was also made
 * unreadable — the reader met `x < x-foo…> y` on the page and the panel showed
 * them `&lt;x-foo…&gt;` struck through in red. These two are LaTeX's own names
 * for the characters, understood by KaTeX and MathJax alike; they draw the `<`
 * and `>` the page drew, and the file holds no `<` for a Markdown renderer to
 * open a tag with. Measured against the bundled KaTeX: `\lt`/`\gt` render clean,
 * the entity errors.
 *
 * The trailing space is LaTeX's own delimiter and is eaten when the formula is
 * drawn — without it `\ltx-foo` is one unknown command.
 */
/**
 * Markup inside a formula: an opening tag, a closing one, or a comment opener.
 *
 * One spelling, because two readers ask about it — this file defuses it, and the
 * maths rules read it as the sign that the annotation is not what the page drew.
 * A second copy would answer differently the first time either moved.
 */
export const MATH_TAG_SHAPED = /<(?:[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>|\/[a-zA-Z][\w-]*\s*>|!--)/;

export function escapeMathTags(latex: string, continues = false): string {
  const escaped = latex.replace(
    new RegExp(MATH_TAG_SHAPED.source, 'g'),
    // Both delimiters, not just the opener: leaving the `>` behind produced
    // `\lt b>`, whose `>` still closes the tag the `<` no longer opens. A comment
    // opener has no `>` to pair with and keeps its text.
    (match) => {
      const inner = match.slice(1);
      return `\\lt ${inner.endsWith('>') ? `${inner.slice(0, -1)}\\gt ` : inner}`;
    },
  );
  if (!continues) return escaped;
  // A tag that is still being written when the node ends: the `<` alone, a name
  // and its attributes so far, or a comment opener half typed. `x <=` keeps its
  // `<` — nothing appended after `=` can make that a tag.
  return escaped.replace(
    /<(?:\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?|\/|!-?)?$/,
    (match) => `\\lt ${match.slice(1)}`,
  );
}
