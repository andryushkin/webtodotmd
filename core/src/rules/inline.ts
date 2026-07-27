import type { Rule, MarkItDownOptions } from '../types.js';
import {
  charAfter,
  charBefore,
  extractFlankingWhitespace,
  followsEmphasis,
  markerWorks,
} from '../utils/flanking.js';
import { isHtmlContext, lookAhead } from '../core/parser.js';
import { addedMarks, suppressedMarks } from '../utils/inline-style.js';
import {
  escapeBlockStarts,
  escapeHtmlSyntax,
  escapeInlineMarkdown,
  mayOpenLink,
} from '../core/escape.js';

/**
 * Emphasis, in the first form that will actually render.
 *
 * The preferred marker is kept wherever it works, so ordinary pages produce the
 * source they always did. Where CommonMark's flanking rules would leave the
 * delimiters as text — content starting or ending in punctuation, a wrapper
 * pressed against a word — the alternative marker is tried, and failing that an
 * HTML tag, which has no flanking rules at all. Dropping to a tag is rare and
 * still Markdown; emitting delimiters that do nothing is a silent loss of
 * formatting plus stray characters the reader never saw.
 */
function emphasis(
  el: Element,
  content: string,
  markers: string[],
  tag: string,
  options: MarkItDownOptions,
): string {
  const { leading, trimmed, trailing } = extractFlankingWhitespace(content);
  if (!trimmed) return content;

  // Inside an HTML block no delimiter would ever be parsed, so there is nothing
  // to choose between: the tag is the only spelling that renders.
  //
  // Two emphasis elements pressed together are the other case with no choice.
  // Their delimiters meet and merge into one run: `<em>a</em><em>b</em>` written
  // `*a**b*` is a single emphasis around `a**b`, so the second one is gone and
  // the reader gains two asterisks a page never showed; `<strong>` pairs make
  // `****` and `<del>` pairs `~~~~`. Picking a different marker cannot separate
  // them — rules run bottom-up and hand back finished strings, so this call
  // cannot learn which of `*`/`_` the neighbour chose, and `~~` has no second
  // spelling at all. The tag has no delimiter to merge with, so the element that
  // *follows* gives way: one break is enough to part the pair, and the one in
  // front keeps the lighter spelling. Whitespace of its own already parts them,
  // which is why `leading` excuses the test.
  if (!isHtmlContext(options) && (leading !== '' || !followsEmphasis(el))) {
    // Whitespace pulled outside the delimiters is what the marker sits against.
    const before = leading ? ' ' : charBefore(el);
    const after = trailing ? ' ' : charAfter(el);

    for (const marker of markers) {
      if (markerWorks(marker, trimmed, before, after)) {
        return `${leading}${marker}${trimmed}${marker}${trailing}`;
      }
    }
  }
  return `${leading}<${tag}>${trimmed}</${tag}>${trailing}`;
}

/**
 * The marks an element's `style` attribute shows that no tag around it records.
 *
 * Applied to the element's converted children, before its own rule runs, which
 * is what lets a `<div style="font-weight:bold">` keep both things it is: the
 * `**` goes inside the block the div rule writes, not around it. For a `<span>`
 * — the ordinary case — the rule is the default one and hands the content
 * straight back, so the marks end up exactly where they would have been had the
 * page used a tag.
 *
 * The emitter is `emphasis()` above and nothing else. A second one would have to
 * re-derive which of `_`, `**` or a tag renders here, and which neighbour it
 * would collide with; that logic is the expensive part, and having one copy of
 * it is also what makes the HTML table fallback work without a word — inside a
 * cell `emphasis()` already writes tags instead of delimiters.
 *
 * Italic inside strikethrough inside bold, so the delimiters nest the way a page
 * that used tags would have nested them.
 */
export function applyStyleEmphasis(
  el: Element,
  content: string,
  options: MarkItDownOptions,
): string {
  const marks = addedMarks(el);
  let out = content;
  if (marks.italic) out = emphasis(el, out, ['_', '*'], 'em', options);
  if (marks.strike) out = emphasis(el, out, ['~~'], 'del', options);
  if (marks.bold) out = emphasis(el, out, ['**', '__'], 'strong', options);
  return out;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;

const CODE_TAGS = new Set(['code', 'kbd', 'samp']);

// What Unicode has for a raised or a lowered run. Digits and the operators are
// complete in both; letters are a scattering, and the gaps are why `shifted()`
// refuses a partial mapping rather than filling in what it can.
const SUPERSCRIPT = new Map(
  Object.entries({
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸',
    '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ',
    'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
    'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ', ' ': ' ',
  }),
);

const SUBSCRIPT = new Map(
  Object.entries({
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈',
    '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ',
    'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ',
    'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', ' ': ' ',
  }),
);

/**
 * The run in shifted characters, or unchanged when Unicode cannot spell all of
 * it.
 *
 * All or nothing per element: `x` with `ab2` above it, half-mapped, would read
 * `xᵃᵇ2` — a different expression, stated confidently. Losing the raising is a
 * smaller error than stating the wrong thing.
 *
 * Anything already escaped is refused too. A backslash means the text carried a
 * Markdown character the escaper had to defuse, and there is no shifted spelling
 * of a defused character.
 */
function shifted(content: string, table: Map<string, string>): string {
  if (content === '' || content.includes('\\')) return content;
  let out = '';
  for (const ch of content) {
    // Matched exactly, never case-folded: Unicode has almost no capital shifted
    // letters, and answering `ABC` with `ᵃᵇᶜ` changes what the page said.
    const mapped = table.get(ch);
    if (mapped === undefined) return content;
    out += mapped;
  }
  return out;
}

type QuotePair = readonly [open: string, close: string];

/** A language's two levels: the pair it quotes with, and the pair it nests. */
type QuoteLevels = readonly [QuotePair, QuotePair];

// Nothing said which language this is in — a page that never wrote a `lang`, or
// a fragment cut out below the element that did. English's pair is the answer
// because it is also the one the largest family in the table below carries.
const DEFAULT_QUOTES: QuoteLevels = [
  ['“', '”'],
  ['‘', '’'],
];

// The marks a `<q>` draws, by content language.
//
// CSS's own default for the element is `quotes: auto`, which resolves against
// the language: the same markup shows “yes” on an English page, „ja“ on a German
// one and «да» on a Russian one. The language is an *attribute* — `lang` on the
// nearest ancestor that carries one — so this rule reads it the way the core
// reads everything else, with no layout engine behind it, and the extension and
// a library caller answer alike.
//
// The pairs are CLDR's `delimiters` — `quotationStart`/`quotationEnd` and the
// alternate pair beside them — which is the table `quotes: auto` is defined
// against and the one browsers build their own from. Taken from `cldr-json`
// (`cldr-misc-full/main/<lang>/delimiters.json`) rather than invented, and
// narrowed to the languages `public/_locales/` carries, plus English.
//
// Grouped by the pair, because the languages repeat far more than they differ:
// twenty-three of the fifty-two locales share the English row alone, and fifteen
// rows hold the lot. Each row says which family it is, and a script or region tag
// appears only where it disagrees with its own language.
const QUOTE_FAMILIES: ReadonlyArray<readonly [QuoteLevels, readonly string[]]> = [
  // “…‘…’…” — English and most of the world with it: Iberian, Indic, Malay,
  // Korean, Thai, Turkish, Vietnamese, simplified Chinese.
  [DEFAULT_QUOTES, [
    'en', 'bn', 'da', 'es', 'fil', 'gu', 'hi', 'id', 'kn', 'ko', 'lv', 'ml', 'mr', 'ms', 'pt',
    'sw', 'ta', 'te', 'th', 'tr', 'vi', 'zh',
  ]],
  // „…‚…‘…“ — the German family: the low opening mark, the high closing one.
  [[['„', '“'], ['‚', '‘']], ['de', 'cs', 'et', 'hr', 'sk', 'sl']],
  // «…“…”…» — guillemets outside, English marks within: the Mediterranean, and
  // European Portuguese, which quotes unlike Brazilian Portuguese above.
  [[['«', '»'], ['“', '”']], ['ca', 'el', 'it', 'pt-pt']],
  // «…„…“…» — guillemets outside, the German pair within: East Slavic.
  [[['«', '»'], ['„', '“']], ['ru', 'uk']],
  // ”…’…’…” — both marks are the closing one: Finnish, Swedish, Hebrew.
  [[['”', '”'], ['’', '’']], ['fi', 'sv', 'he']],
  // «…‹…›…» — guillemets at both levels, single ones within.
  [[['«', '»'], ['‹', '›']], ['am', 'fa']],
  // „…«…»…” — a low opening mark outside, guillemets within.
  [[['„', '”'], ['«', '»']], ['pl', 'ro']],
  // 「…『…』…」 — the CJK corner brackets: Japanese and traditional Chinese.
  [[['「', '」'], ['『', '』']], ['ja', 'zh-hant', 'zh-tw', 'zh-hk', 'zh-mo']],
  // „…“ at both levels — Bulgarian and Lithuanian nest the same pair.
  [[['„', '“'], ['„', '“']], ['bg', 'lt']],
  // «…‘…’…» — Norwegian, in both of its written forms.
  [[['«', '»'], ['‘', '’']], ['no', 'nb', 'nn']],
  // ”…’…‘…“ — Arabic, whose marks are the English ones the other way round.
  [[['”', '“'], ['’', '‘']], ['ar']],
  // «…» at both levels — French. CLDR carries no spaces inside the guillemets,
  // and the narrow ones French typography sets are the page's business, not this
  // rule's: inventing a space here would add a character no table asked for.
  [[['«', '»'], ['«', '»']], ['fr']],
  // „…»…«…” — Hungarian, whose inner guillemets point inward.
  [[['„', '”'], ['»', '«']], ['hu']],
  // ‘…’ at both levels — Dutch quotes with the single marks.
  [[['‘', '’'], ['‘', '’']], ['nl']],
  // „…’…’…” — Serbian.
  [[['„', '”'], ['’', '’']], ['sr']],
];

// A Map for the reason every lookup here is one: the page picks the key, and an
// object literal would answer `lang="constructor"` with something truthy.
const QUOTES = new Map<string, QuoteLevels>(
  QUOTE_FAMILIES.flatMap(([levels, languages]) =>
    languages.map((language) => [language, levels] as [string, QuoteLevels]),
  ),
);

/**
 * The pairs for a `lang` value, by the language tag's own fallback: `zh-Hant-TW`
 * asks for `zh-hant-tw`, then `zh-hant`, then `zh`. That is what makes the two
 * script keys above enough — `pt-BR` finds `pt` and `zh-CN` finds `zh`, while
 * `pt-PT` and `zh-TW` stop at a key of their own.
 */
function quotesFor(lang: string): QuoteLevels {
  let tag = lang.trim().toLowerCase().replace(/_/g, '-');
  while (tag !== '') {
    const found = QUOTES.get(tag);
    if (found) return found;
    const cut = tag.lastIndexOf('-');
    tag = cut < 0 ? '' : tag.slice(0, cut);
  }
  return DEFAULT_QUOTES;
}

/**
 * The language this element's content is in — `lang` on the nearest ancestor
 * that states one, which is how a browser resolves `quotes: auto` too.
 *
 * A blank `lang=""` states nothing and the walk carries on past it: it is how a
 * page says the language is unknown, and unknown is what the fallback answers.
 *
 * The walk stops where the fragment stops, and that is this rule's limit rather
 * than a fault in it. A selection is cloned out of the page, so a `lang="ru"` on
 * the `<html>` above it is not in what the core is handed, and a phrase captured
 * on its own from a Russian page is quoted with the English pair. Whole-document
 * conversion keeps the attribute and answers right.
 */
function contentLanguage(el: Element): string {
  for (let up: Element | null = el; up; up = up.parentElement) {
    const lang = up.getAttribute('lang');
    if (lang !== null && lang.trim() !== '') return lang;
  }
  return '';
}

/**
 * Whether this `<q>` stands inside another one, which decides which pair it
 * takes: the language's own at the top level, its second everywhere below —
 * `“a ‘b’”` in English, `«a „b“»` in Russian. A third level goes on using the
 * second, which is what CSS does when the depth runs past the end of the
 * `quotes` list.
 *
 * Only `<q>` counts. It is the element a UA stylesheet writes `open-quote` for;
 * a `<blockquote>` around it is a block, not a level.
 */
function insideQuote(el: Element): boolean {
  for (let up = el.parentElement; up; up = up.parentElement) {
    if (up.tagName.toLowerCase() === 'q') return true;
  }
  return false;
}

/**
 * Whether this element becomes a code span — the inline-code rule's own filter,
 * named because the merge below has to ask it about the neighbours too.
 *
 * One span, however deeply these nest. `<code>press <kbd>X</kbd></code>` wrapped
 * twice and the inner backticks came out as characters; a `code` inside a `pre`
 * is the same problem, already handled this way. Content that is empty or all
 * whitespace is not wrapped either, and a neighbour must not expect a backtick
 * from it.
 *
 * Exported because the text escaper has to expect one: a `~` the page showed
 * stops the span opening if it lands directly in front of the backtick.
 */
export function emitsCodeSpan(el: Element): boolean {
  if (!CODE_TAGS.has(el.tagName.toLowerCase()) || (el.textContent ?? '').trim() === '') {
    return false;
  }
  for (let up = el.parentElement; up; up = up.parentElement) {
    const tag = up.tagName.toLowerCase();
    if (tag === 'pre' || CODE_TAGS.has(tag)) return false;
  }
  return true;
}

/**
 * The characters a code span is meant to hold.
 *
 * The rule used to wrap the *converted* children, so `<code><strong>token</strong>`
 * came out as `` `**token**` `` and `<kbd><em>Ctrl</em></kbd>` as `` `_Ctrl_` ``:
 * nothing is parsed inside a code span, so those marks are literal characters the
 * page never showed. Inside a code span the page showed only the text.
 *
 * A `<br>` is the one child that is not text and is still something the reader
 * saw — a line break — so it becomes one, which the fold below turns into the
 * space it renders as. Anything else contributes its text and nothing more.
 */
function literalText(el: Element): string {
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === TEXT_NODE) text += child.textContent ?? '';
    else if (child.nodeType === ELEMENT_NODE) {
      const element = child as Element;
      text += element.tagName.toLowerCase() === 'br' ? '\n' : literalText(element);
    }
  }
  return text;
}

// The tags that write something while holding no text at all: a `<br>` is a line
// break, an `<hr>` a rule, an `<img>` a picture, `<sub>`/`<sup>` their own tags —
// and a `<sup>` is also where a footnote marker comes from — an empty `<pre>` is
// still a fence, and a `<math alttext>` carries its formula in the attribute,
// as does a `<script type="math/tex">`.
//
// The list is the rule set read through rather than a guess, and that is what
// makes it complete: an element writes only what its rule writes, and a tag no
// rule matches falls to the default, which returns its children. A new rule that
// can write for an element holding no text belongs here too.
// `sub` and `sup` are deliberately absent: they used to write their tags around
// whatever they held, so an empty one still put characters between its
// neighbours and parted them. Shifting to Unicode made them write nothing at all
// when empty, and while this set still claimed otherwise two code spans with an
// empty `<sub>` between them stopped merging and ran their backticks together.
const WRITES_WITHOUT_TEXT = new Set(['br', 'hr', 'img', 'pre', 'math', 'script']);

/**
 * Whether this node puts nothing whatever into the output.
 *
 * Where the answer is uncertain it is "it writes something", because the two
 * mistakes cost differently: refusing a merge leaves two spans the page showed as
 * one, while merging across something visible also moves that something behind
 * the merged text.
 */
function writesNothing(node: Node): boolean {
  // A comment carries text and reaches the output in no form at all.
  if (node.nodeType === COMMENT_NODE) return true;
  if (node.nodeType !== ELEMENT_NODE) return (node.textContent ?? '') === '';
  const el = node as Element;
  if ((el.textContent ?? '') !== '') return false;
  if (WRITES_WITHOUT_TEXT.has(el.tagName.toLowerCase())) return false;
  // A wrapper is only as empty as what it holds: the picture in
  // `<picture><img></picture>` is written from inside two elements with no text.
  return Array.from(el.childNodes).every((child) => writesNothing(child));
}

/**
 * The code span directly against this one on the given side, if there is one.
 *
 * Direct siblings only. Reaching through a wrapper would move text across it —
 * in `<em><code>a</code></em><code>b</code>` the `b` would end up inside the
 * emphasis — and no rearrangement is worth that.
 *
 * Only a node that writes nothing may be stepped over on the way. Empty
 * `textContent` was the test for that and asks a different question: a `<br>` and
 * an `<img>` hold no text and are exactly what the reader saw between the two
 * spans. Stepping over them welded `<code>a</code><br><code>b</code>` into one
 * span and left the break stranded at the end of it — two lines on the page,
 * one in the file — and put the picture of
 * `<code>a</code><img><code>b</code>` behind text it had been standing in front
 * of.
 */
function adjacentCodeSpan(el: Element, side: 'prev' | 'next'): Element | undefined {
  for (
    let sibling = side === 'prev' ? el.previousSibling : el.nextSibling;
    sibling;
    sibling = side === 'prev' ? sibling.previousSibling : sibling.nextSibling
  ) {
    if (writesNothing(sibling)) continue;
    if (sibling.nodeType !== ELEMENT_NODE) return undefined;
    const element = sibling as Element;
    return emitsCodeSpan(element) ? element : undefined;
  }
  return undefined;
}

// The schemes a Markdown file can carry in an href. A link is there to be
// followed, so the only question each scheme has to answer is what happens then:
// `http`/`https` fetch a document, `ftp`/`ftps` name a file on a host, and
// `mailto`, `tel`, `callto`, `sms`, `cid`, `xmpp` and `matrix` hand an address to
// whatever application owns that kind of address. Not one of them can run code,
// and all of them occur in ordinary page markup — `tel:` sits in the header of
// nearly every business site, which is what made the narrower list expensive: the
// check began guarding the Markdown path as well as the HTML one, and a phone
// number that had always been a link became bare text.
//
// The list is DOMPurify's default set, unchanged. That is not borrowed authority
// for its own sake — it is the same set the side panel puts the finished render
// through, so anything shorter here would only name links the sanitizer downstream
// was going to keep anyway, and the two halves of the product would disagree about
// what a link is.
//
// `javascript:` and `vbscript:` stay out because following one runs code inside
// the reader's document, and `data:` because it carries a document of its own,
// `text/html` and all, which makes an href holding one a script wearing a label.
// An image `src` is a different question and keeps `data:` deliberately, with
// tests of its own: it is fetched, never navigated, and `data:image/…` is simply
// how a page inlines a picture. Everything unlisted loses its target and keeps its
// text — the safe way round for a scheme nobody here has thought about.
const RENDERABLE_SCHEME = /^(?:https?|ftps?|mailto|tel|callto|sms|cid|xmpp|matrix)$/i;

// A URL with no scheme is relative and always fine — including one that merely
// contains a colon, like `2024:notes.html` or `?filter=a:b`. Matching "no colon
// anywhere" instead dropped those links entirely.
const URL_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
function isRenderableUrl(url: string): boolean {
  // Whitespace and control characters come out before the scheme is read, because
  // that is what a URL parser does with them: `java\nscript:` is `javascript:` by
  // the time a browser acts on it, while the pattern above finds no scheme at all
  // in the raw string and would pass it on as relative. The percent-encoding below
  // happens to defuse that particular one — but a check that answers "no scheme
  // here" about a scheme is wrong in a way its next caller inherits.
  const scheme = URL_SCHEME.exec(url.replace(/[\u0000-\u0020\u007f]/g, ''));
  return scheme === null || RENDERABLE_SCHEME.test(scheme[1]!);
}

/** Whether anything else in this element's parent carries text of its own. */
function accompaniedByText(el: Element): boolean {
  const parent = el.parentElement;
  return parent !== null && (parent.textContent ?? '').trim() !== '';
}

function htmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A URL on its way into markup, out of an attribute the page controls entirely.
 *
 * These are exactly the characters a URL has to percent-encode anyway — the
 * WHATWG URL standard's fragment set, plus DEL — so encoding them still names
 * the same resource and only stops the syntax around it from ending early. Each
 * one is a way out of the construct: a space or a newline terminates a `(…)`
 * destination, a `<` in first position switches it to the angle-bracket form, a
 * backtick opens a code span, which CommonMark resolves before it resolves
 * links, and in the HTML table fallback a blank line closes the HTML block in
 * the middle of a tag.
 *
 * Percent-encoding rather than an angle-bracket destination `<…>`: that form
 * still cannot hold `<`, `>` or a newline, so it would need this pass anyway,
 * and it does nothing for the `href="…"` the fallback writes.
 */
const URL_MUST_ENCODE = /[\u0000-\u0020\u007f"<>`]/g;
function encodeUrl(url: string): string {
  return url.replace(
    URL_MUST_ENCODE,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/** CommonMark's own condition for leaving parentheses in a destination alone. */
function parensBalanced(url: string): boolean {
  let depth = 0;
  for (const ch of url) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * The destination of `[text](dest)`.
 *
 * CommonMark reads parentheses there only as balanced pairs, so a single `)`
 * from the page — `https://e.com/a)b` — closes the link early and the rest of
 * the URL is left standing as text. Backslash-escaping them is exact, since the
 * renderer strips the backslash again, but it is only done where the URL would
 * otherwise break: `…/Foo_(bar)` is most of Wikipedia, it has always rendered,
 * and a backslash there is a character the reader pays for and gains nothing by.
 *
 * `](` is the other way out, and unlike a stray paren it does not need the URL to
 * be malformed. A renderer finds the end of the label by counting brackets from
 * the opening `[`, and an unescaped `[` in the page's own text ahead of the link
 * throws that count off — the text escaper leaves such a bracket alone on purpose,
 * since `[1]` is a footnote marker and Wikipedia is full of them. The next `](`
 * the scan meets is then taken for the label boundary, and the link is cut open in
 * the middle of its own address: `[[x](https://e.com/a](x)b)` renders as a link to
 * `x` labelled `[x](https://e.com/a`, with `b)` left standing as prose — the
 * target lost, the address on screen, and the tail as text. One backslash on the
 * `]` puts the boundary back where it belongs. Only a `]` that a `(` follows is
 * escaped, which is the line the text escaper already draws: a bracket on its own
 * is not link syntax and ends nothing.
 *
 * The backslash itself is always escaped, and first. A URL ending in one would
 * otherwise escape the closing delimiter, and a URL containing `\(` would have
 * the renderer read the parenthesis as escaped and hand back a different URL.
 */
function markdownUrl(url: string): string {
  const escaped = encodeUrl(url)
    .replace(/\\/g, '\\\\')
    .replace(/\](?=\()/g, '\\$&');
  return parensBalanced(escaped) ? escaped : escaped.replace(/[()]/g, '\\$&');
}

/**
 * The label of `[text](…)` and `![alt](…)`, which is parsed as inline content.
 *
 * Link text arrives already escaped — it is page text and went through the text
 * escaper — but `alt` is an attribute and has never been near it. An unmatched
 * bracket or a lone backtick swallows the `](` that follows, and the image
 * collapses into visible source: the reader loses the picture *and* gains the
 * markup. Only the three characters that can do that are escaped. Emphasis
 * marks cannot break the label, and a backslash in front of one would surface in
 * the alt text a reader sees when the image fails to load.
 */
function markdownLabel(text: string): string {
  return text.replace(/[\\[\]`]/g, '\\$&');
}

/**
 * The title of `![alt](src 'title')`.
 *
 * An apostrophe from the page — `Bob's photo` — closes the title early, and a
 * blank line inside it ends the paragraph and leaves the whole construct as
 * text. Whitespace is folded the way `alt` is already folded, because a title is
 * a tooltip and has no lines; the quote is backslash-escaped, which CommonMark
 * undoes, so the reader still gets the apostrophe.
 */
function markdownTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().replace(/[\\']/g, '\\$&');
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl || url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

// The three ways a page puts a player in an article. `<object>` and `<embed>` are
// not here: both are removed before conversion, and what they carry is a plugin
// document rather than a film — a `data` URL naming a PDF viewer is not something
// a reader was watching.
const EMBEDS_MEDIA = new Set(['video', 'audio', 'iframe']);

/**
 * The address a player points at, or `''` when it names none.
 *
 * `<video>` and `<audio>` state it either on themselves or in the `<source>`
 * children they offer a browser to pick from — the first is what the page listed
 * first, which is the one it wanted played. An `<iframe>` has only `src`; a
 * `srcdoc` one carries its document inline and there is nothing to link to.
 */
function mediaUrl(el: Element): string {
  const own = (el.getAttribute('src') ?? '').trim();
  if (own) return own;
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
    if (child.tagName.toLowerCase() !== 'source') continue;
    const src = (child.getAttribute('src') ?? '').trim();
    if (src) return src;
  }
  return '';
}

/**
 * What the link says. The page's own name for the player first — `title` is what
 * a screen reader announces and what YouTube's embed code fills in — then the
 * tail of the address, which is a file name often enough to be worth reading and
 * is never invented.
 *
 * Never a word this converter made up. "Video" would be English on a page that is
 * not, and the library has no locale to pick one in.
 */
function mediaLabel(el: Element, src: string): string {
  const named = (el.getAttribute('title') ?? el.getAttribute('aria-label') ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (named) return named;
  const path = (src.split(/[?#]/)[0] ?? '').split('/').filter((part) => part !== '');
  const tail = path[path.length - 1] ?? '';
  try {
    return decodeURIComponent(tail);
  } catch {
    // A malformed escape — `%zz`, or a stray `%` a CMS left in a file name.
    return tail;
  }
}

function isPlaceholder(src: string): boolean {
  return (
    src.startsWith('data:image/') ||
    /placeholder|spacer|1x1|blank|loading/i.test(src) ||
    (src.length < 50 && src.startsWith('data:'))
  );
}

function parseSrcset(srcset: string): string {
  const candidates = srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let bestUrl = '';
  let bestValue = -1;
  for (const candidate of candidates) {
    const parts = candidate.split(/\s+/);
    const url = parts[0] ?? '';
    const descriptor = parts[1] ?? '';
    const value = descriptor ? parseFloat(descriptor) : 1;
    if (value > bestValue) {
      bestValue = value;
      bestUrl = url;
    }
  }
  return bestUrl;
}

/**
 * The address the page gives an image, or `''` when it gives none.
 *
 * Every candidate is trimmed, and a whitespace-only one counts as absent:
 * whitespace is not an address. A browser strips it before parsing a URL, so
 * `src=" "` names nothing — yet untrimmed it is truthy, which both hid the
 * no-URL case from the caller and let a lazy-load attribute holding a single
 * space shadow the real `src` beside it.
 */
function extractImageUrl(img: Element): string {
  const attr = (name: string) => (img.getAttribute(name) ?? '').trim();

  // 1. data-src варианты (lazy-load)
  const lazySrc =
    attr('data-src') ||
    attr('data-original') ||
    attr('data-lazy-src') ||
    attr('data-full-src') ||
    attr('data-hi-res-src');
  if (lazySrc) return lazySrc;

  // 2. srcset — выбрать максимальное разрешение
  const srcset = attr('data-srcset') || attr('srcset');
  if (srcset) {
    const best = parseSrcset(srcset);
    if (best) return best;
  }

  // 3. src — проверить что не placeholder
  const src = attr('src');
  if (src && !isPlaceholder(src)) return src;

  // 4. noscript fallback — src из соседнего <noscript> (сохранён санитайзером в data-noscript-src)
  const noscriptSrc = attr('data-noscript-src');
  if (noscriptSrc) return noscriptSrc;

  return src;
}

// A tag says what the page meant; the style attribute says what it showed. Where
// the two disagree the reader saw the style — a `<strong style="font-weight:400">`
// is not bold on screen, and `**` around it claims a formatting the page withheld.
// The mark is dropped, never the content.
export const INLINE_RULES: Rule[] = [
  {
    name: 'bold',
    filter: ['strong', 'b'],
    replacement: (el, childContent, options) =>
      suppressedMarks(el).bold
        ? childContent
        : emphasis(el, childContent, ['**', '__'], 'strong', options),
  },
  {
    name: 'italic',
    filter: ['em', 'i'],
    replacement: (el, childContent, options) =>
      suppressedMarks(el).italic
        ? childContent
        : emphasis(el, childContent, ['_', '*'], 'em', options),
  },
  {
    name: 'strikethrough',
    filter: ['del', 's'],
    replacement: (el, childContent, options) =>
      suppressedMarks(el).strike
        ? childContent
        : emphasis(el, childContent, ['~~'], 'del', options),
  },
  // A raised or lowered run is written with the characters Unicode has for it,
  // never with a tag: the product converts HTML into Markdown, so a `<sup>` in
  // the result is work not finished. `H₂O` and `x²` are plain text — they need no
  // parser to render, survive being copied out of the file, and are what the
  // reader saw.
  //
  // Markdown has no syntax of its own here. Pandoc's `H~2~O` is worse than
  // absent: GFM reads a single `~` as strikethrough, so it renders `H̶2̶O`, which
  // corrupts the meaning rather than losing it. `x^2^` renders as its own
  // characters.
  //
  // Unicode covers digits and the common operators; letters only in patches
  // (`ᵃᵇᶜⁿ`, `ₐₑₒₓ`). Where a character is missing the run stays plain, because a
  // half-mapped `x₂ab` reads as a different formula, not as an approximation of
  // one — all or nothing, per element.
  {
    name: 'subscript',
    filter: 'sub',
    replacement: (_el, childContent) => shifted(childContent, SUBSCRIPT),
  },
  {
    name: 'superscript',
    filter: 'sup',
    replacement: (_el, childContent) => shifted(childContent, SUPERSCRIPT),
  },
  // A ruby annotation is the reading of the word it stands over: furigana above
  // Japanese, pinyin above Chinese, bopomofo beside it. No rule claimed `<rt>`,
  // so the default one handed back its text and the reading was welded onto the
  // word — `<ruby>漢字<rt>かんじ</rt></ruby>` arrived as `漢字かんじ`. Nothing in
  // that string says where the word ends and its reading begins, and a search
  // for either one now fails on the joined form. That is a corruption on the
  // pages ruby is actually used for, not a blemish.
  //
  // Parentheses are how plain text has always carried a reading, and they keep
  // both strings whole and separable. Markdown has no ruby syntax of its own,
  // and inventing one would state something the page did not; parentheses state
  // exactly what the page did.
  //
  // Per element, so the commonest real shape falls out on its own: a per-
  // character `<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>` writes `漢(かん)字(じ)`,
  // each reading beside the character it belongs to, which is where the reader
  // saw it. `<rb>` — the base, in the older spelling — needs no rule at all: the
  // default one hands back its children, and its children are the word. `<rtc>`
  // is the same when it wraps `<rt>` elements, which is how it is written.
  {
    name: 'ruby-annotation',
    filter: 'rt',
    replacement: (el, childContent, options) => {
      // An annotation of nothing is nothing. `()` around a whitespace-only or
      // empty `<rt>` is two characters the page never showed, and the reader saw
      // no reading above the word. The flanking whitespace goes with it: it
      // belonged to the line above the word, never to the base line, so keeping
      // it would open a gap in a word the reader saw closed.
      //
      // The content is the converted children, not their text, so an annotation
      // with markup of its own keeps it: an `<em>` inside an `<rt>` is emphasis
      // like any other, and the parentheses go outside it.
      const { trimmed } = extractFlankingWhitespace(childContent);
      if (trimmed === '') return '';
      // The text escaper cannot see a parenthesis this rule invents. It judges a
      // `]` by the page's own text ahead of it and finds no `(` there, so a base
      // ending in one assembled `[x](y)`: a working link whose target is the
      // reading, whose brackets left the page, and whose label is the word. One
      // backslash puts all three back, and CommonMark renders `\(` as `(`, so the
      // reader sees the character either way. Not inside an HTML block, where a
      // backslash is a backslash and no link is being parsed.
      const open = !isHtmlContext(options) && charBefore(el) === ']' ? '\\(' : '(';
      return `${open}${trimmed})`;
    },
  },
  // `<rp>` holds the parentheses a browser *without* ruby support would show,
  // and every browser that has ruby hides it — `rp { display: none }` is in the
  // HTML standard's own UA stylesheet. So a page that writes `<rp>(</rp>` is
  // already carrying the characters the rule above adds, and emitting both gives
  // `漢字((かんじ))`. It is dropped, and that answers for the reader whose browser
  // showed them too: those parentheses and these are the same two characters in
  // the same place, so either reader ends up with the string they saw.
  //
  // Dropped here rather than left to the hiding pass, because that pass cannot
  // reach it everywhere. In the extension the content script's snapshot records
  // the UA `display:none` and the sanitizer takes the element; a library caller
  // brings no snapshot, sees nothing hidden, and kept the page's own parentheses
  // — so the two paths answered differently about the same document until this
  // rule made them agree.
  {
    name: 'ruby-parenthesis',
    filter: 'rp',
    replacement: () => '',
  },
  // The same idea as the two above, for the marks a `<q>` shows: characters the
  // reader saw, written as characters. Here they were never in the document at
  // all — every UA stylesheet draws them from `q::before { content: open-quote }`
  // — so the element converted to its text alone and `He said <q>quoted</q>` came
  // out as `He said quoted`, a sentence that now claims nobody was quoted. The
  // marks are not decoration around the words; they are the whole of what the tag
  // draws.
  //
  // `cite` is not read. It is a URL saying where the quotation came from, and no
  // browser draws it — the reader saw the marks and the words between them and
  // nothing else, so writing it out would put an address in the file that was
  // never on the page. A `<q>` the page itself wrapped in an `<a>` still becomes a
  // link, because that is the page's own markup and the link rule owns it.
  //
  // An empty `<q>` writes nothing, and this is the one place the rule knowingly
  // says less than the screen: a browser does paint `“”` there. Two marks with
  // nothing between them quote nothing, an empty one is a template with no text
  // to put in it, and the characters would press against whatever stands on
  // either side — the way an empty `<sub>` used to part two code spans. Content
  // that is only whitespace is the same case, and the whitespace is handed back
  // untouched.
  //
  // What the rule cannot see is a page that turned the marks off. `q { quotes:
  // none }`, or a `q::before { content: none }`, is a stylesheet rule; the core
  // reads attributes, and the content script's snapshot records computed
  // *properties* on the element, never generated content, so nothing carries that
  // fact across. Such a page gets two marks the reader was not shown. That is the
  // trade taken deliberately: two characters added on a page that styled the
  // quoting away, against a quotation silently unmarked on every ordinary one.
  {
    name: 'quotation',
    filter: 'q',
    replacement: (el, childContent) => {
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      const levels = quotesFor(contentLanguage(el));
      const [open, close] = insideQuote(el) ? levels[1] : levels[0];
      return `${leading}${open}${trimmed}${close}${trailing}`;
    },
  },
  {
    name: 'inline-code',
    // `kbd` and `samp` belong here too. They are in the parser's literal set, so
    // their text is never escaped — but nothing wrapped it either, and it went
    // into the file raw: a page documenting `<div onclick=…>` inside <samp> put
    // working markup in the output. A code span is both the right rendering and
    // the thing that makes the text inert.
    filter: emitsCodeSpan,
    replacement: (el, childContent, options) => {
      if (isHtmlContext(options)) {
        // An HTML block carries the children's own tags, so `<code><strong>x`
        // renders there as the page had it and the converted content is right.
        const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
        if (!trimmed) return childContent;
        return `${leading}<code>${trimmed}</code>${trailing}`;
      }
      // Two code spans pressed together run their backticks into one string:
      // `` `word` `` and `` `hello world` `` become `` `word``hello world` ``,
      // one span whose text carries two backticks the page never showed. No
      // spelling separates them — a backtick run is matched by a run of exactly
      // the same length, and a joined run is never that length, whatever
      // delimiters the two sides pick — and unlike emphasis there is no tag to
      // fall back to, because an HTML `<code>` does not make its content inert
      // and this text is never escaped. So the run is written as the single span
      // the page already looked like: the first element takes the text of the
      // ones behind it, and they emit nothing.
      if (adjacentCodeSpan(el, 'prev')) return '';
      let text = literalText(el);
      for (let next = adjacentCodeSpan(el, 'next'); next; next = adjacentCodeSpan(next, 'next')) {
        text += literalText(next);
      }
      const { leading, trimmed, trailing } = extractFlankingWhitespace(text);
      if (!trimmed) return text;
      // A code span cannot cross a blank line: the line ends the paragraph, the
      // opening backtick is left as a literal, and whatever followed renders as
      // markup. Newlines inside a span collapse to spaces when rendered anyway,
      // so folding them here changes nothing a reader would see.
      const oneLine = trimmed.replace(/\s*\n\s*/g, ' ');
      // The delimiter must outrun the longest backtick run inside. Using `` for
      // any content that merely contains a backtick closed the span early on
      // ``a `` b``, and whatever followed — page text — was read as markup.
      const longest = Math.max(0, ...Array.from(oneLine.matchAll(/`+/g), (m) => m[0].length));
      const delim = '`'.repeat(longest + 1);
      // A span whose content touches a backtick needs padding spaces; CommonMark
      // strips one from each end, so the reader never sees them.
      const inner = longest > 0 ? ` ${oneLine} ` : oneLine;
      return `${leading}${delim}${inner}${delim}${trailing}`;
    },
  },
  {
    name: 'link',
    filter: (el) => el.tagName.toLowerCase() === 'a' && el.hasAttribute('href'),
    replacement: (el, childContent, options: MarkItDownOptions) => {
      const href = resolveUrl(el.getAttribute('href') ?? '', options.baseUrl);
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      // An unusable scheme costs the link, not the text it was wrapping. The
      // check guarded the HTML fallback only, so `javascript:` was refused on the
      // rare path and written straight into `[text](href)` on the ordinary one —
      // the wrong way round, since almost every link takes the ordinary one.
      if (!isRenderableUrl(href)) return `${leading}${trimmed}${trailing}`;
      if (isHtmlContext(options)) {
        return `${leading}<a href="${htmlAttr(encodeUrl(href))}">${trimmed}</a>${trailing}`;
      }
      return `${leading}[${trimmed}](${markdownUrl(href)})${trailing}`;
    },
  },
  {
    name: 'source',
    filter: 'source',
    replacement: () => '',
  },
  // A player is content, and Markdown has no spelling for one. Nothing was
  // written for either of the two ways a page embeds one — `<iframe>` was deleted
  // outright and `<video>` had no rule, so it fell to the default one, which
  // hands back its children and a player has none. A Notion help page with three
  // videos in it came back with three blank places, and every YouTube embed on
  // every blog was a hole the reader could not even see.
  //
  // A link is what is left: the address is the one thing about a player that
  // survives into text, and it still takes the reader to what they were looking
  // at. No preview picture — an `<img>` beside the link would state that the
  // still is the content, and on a `<video poster>` the reader saw a frame of the
  // film rather than a picture of it.
  {
    name: 'embedded-media',
    filter: (el) => EMBEDS_MEDIA.has(el.tagName.toLowerCase()),
    // The children of one of these are the fallback for a browser that cannot
    // play it, and every browser a capture comes from can. It is `<details>`
    // again: markup that is there and was never on screen.
    ignoresChildContent: true,
    replacement: (el, _childContent, options: MarkItDownOptions) => {
      const url = mediaUrl(el);
      if (!url) return '';
      const src = resolveUrl(url, options.baseUrl);
      // Same answer a link gives an unusable scheme, for the same reason — except
      // that here nothing is wrapped, so an unusable one leaves nothing at all.
      if (!isRenderableUrl(src)) return '';
      const label = mediaLabel(el, src);
      if (isHtmlContext(options)) {
        return `<a href="${htmlAttr(encodeUrl(src))}">${htmlAttr(label)}</a>`;
      }
      // The label comes from an attribute or from the address, and neither has
      // ever been near the text escaper. Inside `[…]` it is parsed as inline
      // content, so a `title` holding `<img onerror=…>` would render as that
      // image — the one position where the page's own markup can act, and the
      // reason `alt` is escaped the same way where it lands in prose. No block
      // pass: the `[` in front of it means this text never opens a line.
      return `[${escapeHtmlSyntax(escapeInlineMarkdown(label))}](${markdownUrl(src)})`;
    },
  },
  {
    name: 'picture',
    filter: 'picture',
    replacement: (_el, childContent) => childContent.trim(),
  },
  {
    name: 'image',
    filter: 'img',
    replacement: (el, _childContent, options: MarkItDownOptions) => {
      // An image with nothing to point at is not handed the base. Resolving is
      // the step that invents an address: `new URL('', base).href` *is* the base,
      // so a src-less `<img>` became `![alt](the-page-being-captured)` — a broken
      // image whose target is the article the reader was reading, and the
      // extension always passes `baseUrl: document.baseURI`, so that was every
      // capture rather than a corner.
      //
      // The refusal belongs here rather than in `resolveUrl`, because an empty
      // URL is not meaningless everywhere. `<a href="">` genuinely addresses the
      // current document — that is where the reader's click went — so a link must
      // go on resolving to the page. Only an image must not: a page is not a
      // picture of itself, and what the reader got from it was the alt text.
      const url = extractImageUrl(el);
      const src = url ? resolveUrl(url, options.baseUrl) : '';
      const alt = (el.getAttribute('alt') ?? '').replace(/[\n\r]+/g, ' ').trim();
      // An `alt` that is there and empty is the markup saying so: HTML defines it
      // as "this image is not part of the content", which is how a favicon in a
      // citation pill, a spacer and an icon beside a label are all written. A
      // *missing* `alt` says nothing of the kind — the author forgot — and that
      // image stays. Google's AI answers put a 2.5 KB base64 favicon in the
      // middle of a sentence this way, and a dozen 1×1 gifs after it.
      //
      // Only where something else survives on the line: an image alone in its
      // parent is all that was there, and dropping it would leave an empty link
      // or an empty paragraph — deleting what the reader saw to save a few
      // characters, which is the trade this project refuses everywhere else.
      if (el.hasAttribute('alt') && alt === '' && accompaniedByText(el)) return '';
      // Inside an HTML block `![alt](src)` would not render, but emitting an
      // <img> would mean allowing `src` and `alt` through the preview's
      // allow-list — a real widening of what counts as the core's own markup,
      // for a case that is rare and already showed nothing. The alt text is what
      // a reader would have got from a broken image anyway. The cell escapes it.
      if (isHtmlContext(options)) return alt || '';
      // With no URL the alt is all that survives, and it lands in the document as
      // ordinary text — so it needs everything ordinary text gets, in the order
      // the parser applies it: inline marks, then HTML, then the constructs that
      // only bite at the start of a line. It had none of it to begin with, because
      // an attribute never passes the text escaper: an `alt` holding
      // `<img onerror=…>` went into the file as working markup, and one holding
      // `# heading` became a real H1 — a heading the page never had, swallowing
      // the picture's description into the document's outline.
      //
      // The block pass runs unconditionally here, where a text node gets it only
      // when it opens a line. `opensBlock()` is that question and it lives
      // unexported in the parser; without it the whole cost is one backslash, and
      // only on an image that had no usable src, whose alt starts with `#`, `>`, a
      // bullet or a number, and that sits mid-sentence rather than at the front of
      // one. The backslash renders as nothing; the heading it prevents was a
      // structural claim invented out of an attribute.
      if (!src) {
        if (!alt) return '';
        // With the same lookahead a text node gets: this alt lands in the document
        // as prose, so an alt ending in `[` assembled a link with the page's own
        // text after it — `<img alt="see [">` followed by ` ](url)` gave a working
        // link whose opener came from an attribute and whose target came from
        // elsewhere on the page.
        const ahead = lookAhead(el, mayOpenLink(alt), alt.includes('~'));
        return escapeBlockStarts(
          escapeHtmlSyntax(escapeInlineMarkdown(alt, { ahead: ahead.text }), ahead.continues),
        );
      }
      const title = el.getAttribute('title');
      const dest = markdownUrl(src);
      const urlPart = title ? `${dest} '${markdownTitle(title)}'` : dest;
      return `![${markdownLabel(alt)}](${urlPart})`;
    },
  },
];
