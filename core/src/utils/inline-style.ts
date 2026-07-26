/**
 * Two attributes, read for the few properties that decide what a reader sees as
 * text rather than where the box sits on the page: the page's own `style`, and a
 * snapshot of the computed style left behind by whoever held the live nodes.
 *
 * Attributes, and deliberately so. `getComputedStyle` is not available here: the
 * core runs against linkedom in its own tests and against a detached clone in the
 * extension, and neither has a layout engine, so a rule that needed it would hold
 * in one half of the product and not the other. What a class or a stylesheet says
 * is invisible from a clone for the same reason, which is why the side that does
 * have live nodes writes it down first — see `src/content/style-snapshot.ts`. No
 * snapshot is the ordinary case, not an error: the library converts a string for
 * callers that never had a browser.
 *
 * The property readers take a lookup rather than an element, because the same
 * properties arrive from both places: the same questions, asked twice. Everything
 * below the lookup — what `bolder` resolves to, where "bold enough" starts, which
 * `display` values break a line, which shapes clip a box to nothing — is the part
 * that must not be written twice.
 */

/** A style, asked one property at a time. Undefined means the style is silent. */
export type StyleReader = (property: string) => string | undefined;

/**
 * Where a computed style is written down for the clone to read.
 *
 * Its values are ordinary CSS declarations, so the same parser and the same
 * readers answer both attributes and neither side can invent a private spelling
 * the other has to be taught.
 */
export const SNAPSHOT_ATTR = 'data-s2md-style';

const NO_STYLE: StyleReader = () => undefined;

// A value that only points at another cascade level tells us nothing this file
// can act on, and `initial` is close enough to silence to be worth the same
// treatment: the tag default underneath is what it would resolve to anyway for
// every element the core has a rule for.
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/**
 * The declarations of a `style` attribute, property to value, both lower-cased.
 *
 * Split on the semicolons that really separate declarations: one inside quotes
 * or inside `url(…)` belongs to the value. None of the properties read here can
 * hold either, but a parser that answered a *different* property wrongly would
 * be a trap for whoever adds the next one. Later wins, as the cascade says.
 */
function parseDeclarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i <= css.length; i += 1) {
    const ch = css[i];
    if (quote !== '') {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === undefined || (ch === ';' && depth === 0)) {
      addDeclaration(out, css.slice(start, i));
      start = i + 1;
    }
  }
  return out;
}

function addDeclaration(out: Map<string, string>, text: string): void {
  const colon = text.indexOf(':');
  if (colon < 0) return;
  const property = text.slice(0, colon).trim().toLowerCase();
  if (property === '') return;
  // `!important` says how this declaration wins, not what it says.
  const value = text
    .slice(colon + 1)
    .replace(/!\s*important\s*$/i, '')
    .trim()
    .toLowerCase();
  if (value === '' || CSS_WIDE.has(value)) return;
  out.set(property, value);
}

// One element is read several times over: by the rule that asks what it shows, by
// the flanking check that asks the same of its neighbours, and once per ancestor
// for every styled descendant below it — which on a word-processor paste, where
// every run carries a `style`, is the whole document times its depth. The raw
// string is kept beside the parse so a rewritten attribute cannot be answered
// from a stale one; `rules/tables.ts` rewrites attributes on a clone, and a cache
// that only knew the element would have to be trusted about the order that
// happens in.
type Parsed = WeakMap<Element, { raw: string; reader: StyleReader }>;

const parsedInline: Parsed = new WeakMap();
const parsedSnapshot: Parsed = new WeakMap();

function attributeStyle(el: Element, name: string, cache: Parsed): StyleReader {
  const raw = el.getAttribute?.(name);
  if (!raw) return NO_STYLE;
  const cached = cache.get(el);
  if (cached !== undefined && cached.raw === raw) return cached.reader;
  const declarations = parseDeclarations(raw);
  const reader: StyleReader = (property) => declarations.get(property);
  cache.set(el, { raw, reader });
  return reader;
}

/** This element's own inline style. Elements without one cost a single lookup. */
export function inlineStyle(el: Element): StyleReader {
  return attributeStyle(el, 'style', parsedInline);
}

/** The computed style someone else recorded for this element, if anyone did. */
export function snapshotStyle(el: Element): StyleReader {
  return attributeStyle(el, SNAPSHOT_ATTR, parsedSnapshot);
}

/**
 * Everything known about how this element was painted.
 *
 * The snapshot answers first: a computed style already has the inline one folded
 * into it, so where both speak the snapshot is the later word. It is written only
 * where it says something the tag and the ancestry do not already imply, so a
 * property missing from it is not a denial — the inline attribute is still asked.
 */
export function elementStyle(el: Element): StyleReader {
  const snapshot = snapshotStyle(el);
  if (snapshot === NO_STYLE) return inlineStyle(el);
  const inline = inlineStyle(el);
  if (inline === NO_STYLE) return snapshot;
  return (property) => snapshot(property) ?? inline(property);
}

/** Whether either attribute is present at all — the parser's cheap gate. */
export function hasStyle(el: Element): boolean {
  return el.getAttribute?.('style') != null || el.getAttribute?.(SNAPSHOT_ATTR) != null;
}

/** The first component of a value — `display: block flow` is a block. */
function firstToken(value: string): string {
  const space = value.search(/\s/);
  return space < 0 ? value : value.slice(0, space);
}

// ---------------------------------------------------------------------------
// The properties, in the terms the rules ask about.
// ---------------------------------------------------------------------------

/** CSS `normal`. */
export const NORMAL_WEIGHT = 400;
/** CSS `bold`, and what every bold tag is worth. */
export const BOLD_WEIGHT = 700;
/**
 * Where bold begins. 600 rather than 700 because variable fonts made
 * `font-weight: 600` ("semibold") an ordinary way to write emphasis, and 500
 * ("medium") an ordinary way to write body text that is merely not thin.
 */
export const BOLD_THRESHOLD = 600;

const NAMED_WEIGHTS: Readonly<Record<string, number>> = {
  normal: NORMAL_WEIGHT,
  bold: BOLD_WEIGHT,
};

// CSS Fonts 4: `bolder` and `lighter` step along the scale from whatever was
// inherited, they do not add a fixed amount.
function bolder(inherited: number): number {
  if (inherited < 350) return NORMAL_WEIGHT;
  if (inherited < 550) return BOLD_WEIGHT;
  return 900;
}

function lighter(inherited: number): number {
  if (inherited < 550) return 100;
  if (inherited < 750) return NORMAL_WEIGHT;
  return BOLD_WEIGHT;
}

/** The weight this style declares, or undefined when it declares none. */
export function weightFrom(read: StyleReader, inherited: number): number | undefined {
  const value = read('font-weight');
  if (value === undefined) return undefined;
  const named = NAMED_WEIGHTS[value];
  if (named !== undefined) return named;
  if (value === 'bolder') return bolder(inherited);
  if (value === 'lighter') return lighter(inherited);
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : undefined;
}

/** Whether this style declares a slant, and which way. */
export function italicFrom(read: StyleReader): boolean | undefined {
  const value = read('font-style');
  if (value === undefined) return undefined;
  // `oblique` and `oblique 14deg` are the same slant to a reader as `italic`.
  return value === 'italic' || firstToken(value) === 'oblique';
}

/**
 * Whether this style draws a line through the text.
 *
 * `text-decoration` is a shorthand — colour, style and thickness ride in it too
 * — so the keyword is looked for anywhere in the value rather than compared
 * against the whole of it. The longhand wins when both are written.
 */
export function struckFrom(read: StyleReader): boolean | undefined {
  const value = read('text-decoration-line') ?? read('text-decoration');
  if (value === undefined) return undefined;
  return /(?:^|\s)line-through(?:\s|$)/.test(value);
}

/**
 * What this style does to the line the element's content sits on.
 *
 * `'block'` puts it on a line of its own; `'inline'` keeps it in the one it is
 * already on; `'other'` is a value that does neither reliably —
 * `inline-block`, `table-cell` and `contents` all stay in the flow, and reading
 * any of them as a break would put a paragraph in the middle of a sentence.
 */
export function displayFrom(read: StyleReader): 'block' | 'inline' | 'other' | undefined {
  const value = read('display');
  if (value === undefined) return undefined;
  const outer = firstToken(value);
  if (BLOCK_DISPLAYS.has(outer)) return 'block';
  return outer === 'inline' ? 'inline' : 'other';
}

// The values that generate a block-level box, which is to say a line of its own.
// `table-row` and `table-cell` are absent on purpose: they are how a page fakes a
// table out of `<div>`s and `<span>`s, and those sit side by side.
const BLOCK_DISPLAYS = new Set(['block', 'flow-root', 'flex', 'grid', 'table', 'list-item']);

/** Whether this style takes the element out of the render entirely. */
export function hiddenFrom(read: StyleReader): boolean {
  const display = read('display');
  if (display !== undefined && firstToken(display) === 'none') return true;
  const visibility = read('visibility');
  // `collapse` is `hidden` everywhere except on a table row or column, where it
  // removes the row instead — invisible either way.
  if (visibility === 'hidden' || visibility === 'collapse') return true;
  const opacity = read('opacity');
  // Fully transparent, in either spelling: `0` and `0%`. A value merely close to
  // zero is left alone — the mistake that costs is deleting text a reader saw.
  return opacity !== undefined && Number.parseFloat(opacity) === 0;
}

/**
 * The properties `visuallyHiddenFrom` reads, named so a snapshot can carry
 * exactly the ones its verdict rests on and the two sides cannot drift apart.
 */
export const CLIPPED_PROPERTIES: readonly string[] = [
  'clip', 'clip-path', 'text-indent', 'position', 'left', 'top', 'width', 'height', 'overflow',
];

/** A length in pixels, or undefined for `auto`, a percentage, or a keyword. */
function px(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  return match ? Number.parseFloat(match[1]!) : undefined;
}

// Far enough off the canvas that nothing of the element is on screen. A round
// number rather than the viewport's edge, which no stylesheet knows: the idioms
// this catches are all written with four digits, and a box merely pushed a
// column's width to the left is a layout, not a hiding place.
const OFFSCREEN_PX = -1000;

// `clip: rect(0px, 0px, 0px, 0px)`, the CSS 2 spelling of "none of this". The
// property is deprecated and this is very nearly the only thing it is still
// written for; commas are optional in the legacy syntax, so both are accepted.
function clippedToNothing(value: string | undefined): boolean {
  const inside = value === undefined ? null : /^rect\(([^)]*)\)$/.exec(value.trim());
  if (!inside) return false;
  const sides = inside[1]!.split(/[\s,]+/).filter((side) => side !== '');
  return sides.length === 4 && sides.every((side) => px(side) === 0);
}

// `clip-path: inset(50%)` and anything deeper: half the box taken off every side
// leaves nothing between them. Percentages only — an inset in pixels needs the
// box's size to judge, and that is not in a style.
function insetToNothing(value: string | undefined): boolean {
  const match = value === undefined ? null : /^inset\(\s*(\d*\.?\d+)%/.exec(value.trim());
  return match !== null && Number.parseFloat(match[1]!) >= 50;
}

// A box one pixel across that clips what it cannot fit. Both sides, not either:
// a strip zero pixels high and the full width of the page is a collapsed panel,
// which a reader opens, and this must not decide it was never there.
function pinhole(read: StyleReader): boolean {
  const overflow = read('overflow');
  if (overflow === undefined || !/hidden|clip/.test(overflow)) return false;
  const width = px(read('width'));
  const height = px(read('height'));
  return width !== undefined && width <= 1 && height !== undefined && height <= 1;
}

// Positioned out past the edge of the canvas, the oldest of these idioms.
function positionedOffscreen(read: StyleReader): boolean {
  const position = read('position');
  if (position !== 'absolute' && position !== 'fixed') return false;
  const left = px(read('left'));
  const top = px(read('top'));
  return (left !== undefined && left <= OFFSCREEN_PX) || (top !== undefined && top <= OFFSCREEN_PX);
}

/**
 * Whether the element is drawn somewhere no reader can look.
 *
 * This is the shape `.sr-only` and `.visually-hidden` take: the text is left in
 * the tree on purpose, for a screen reader, and clipped, indented or pushed off
 * the canvas so that nobody else meets it. `display:none` would take it away from
 * the screen reader too, which is exactly why these classes exist and why they
 * are what a page writes — so a converter that only knows `hiddenFrom` copies
 * "Skip to main content" and "opens in a new tab" into the reader's file.
 *
 * Each test is the whole idiom rather than one of its parts, and each threshold
 * is set where no layout would land by accident. The cost of a false positive
 * here is text a person saw and no longer has, which is worse than the text they
 * did not see and now have.
 */
export function visuallyHiddenFrom(read: StyleReader): boolean {
  return (
    clippedToNothing(read('clip')) ||
    insetToNothing(read('clip-path')) ||
    (px(read('text-indent')) ?? 0) <= OFFSCREEN_PX ||
    positionedOffscreen(read) ||
    pinhole(read)
  );
}

// ---------------------------------------------------------------------------
// From properties to what the element shows, and from that to what the output
// does not already say.
// ---------------------------------------------------------------------------

// The tags whose own output is already bold: `<strong>` and `<b>` write `**`,
// and a heading or a table header is painted bold by every renderer there is.
// This set is the reason a `<h2 style="font-weight:700">` gains nothing — the
// weight it declares is the weight it already had.
const BOLD_TAGS = new Set(['strong', 'b', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ITALIC_TAGS = new Set(['em', 'i']);
const STRUCK_TAGS = new Set(['del', 's']);

// Asked from outside by whoever records a computed style: what it has to compare
// against is what this file would have assumed without it, so the sets have to be
// the same sets. Predicates rather than the sets themselves, so nothing outside
// can add a tag to them.
/** Whether the tag alone is already bold. */
export const isBoldTag = (tag: string): boolean => BOLD_TAGS.has(tag);
/** Whether the tag alone is already italic. */
export const isItalicTag = (tag: string): boolean => ITALIC_TAGS.has(tag);
/** Whether the tag alone is already struck through. */
export const isStruckTag = (tag: string): boolean => STRUCK_TAGS.has(tag);

// Tags whose conversion already puts their content on a line of its own, so a
// `display` saying the same thing has nothing to add. Anything unlisted counts
// as inline, which is the safe direction: the cost of a wrong break is a blank
// line, the cost of a missing one is two paragraphs welded into a sentence.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'br', 'caption', 'dd',
  'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'html', 'legend',
  'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

/** Whether the tag's own conversion already puts its content on a line of its own. */
export const isBlockTag = (tag: string): boolean => BLOCK_TAGS.has(tag);

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

// The walk up the tree is what makes "bolder than its context" answerable, and it
// is also the only expensive thing in this file. It runs for an element whose own
// style mentions one of these three properties and for no other, which is why the
// test is a regex over the raw attribute rather than a parse.
const AFFECTS_TYPEFACE = /font-weight|font-style|text-decoration/i;

/** What the reader sees at a point in the tree: all three answers at once. */
interface Face {
  weight: number;
  italic: boolean;
  struck: boolean;
}

const PLAIN: Face = { weight: NORMAL_WEIGHT, italic: false, struck: false };

// One walk, not three. Asking the three questions separately re-read every
// ancestor's style attribute once per question, which on a document where every
// element is styled is the depth of the tree paid three times over for every run.
function ownFace(el: Element, inherited: Face): Face {
  const read = elementStyle(el);
  const tag = tagOf(el);
  return {
    weight: weightFrom(read, inherited.weight) ?? (BOLD_TAGS.has(tag) ? BOLD_WEIGHT : inherited.weight),
    italic: italicFrom(read) ?? (ITALIC_TAGS.has(tag) || inherited.italic),
    struck: struckFrom(read) ?? (STRUCK_TAGS.has(tag) || inherited.struck),
  };
}

function inheritedFace(el: Element): Face {
  const parent = el.parentElement;
  return parent === null ? PLAIN : ownFace(parent, inheritedFace(parent));
}

export interface StyleMarks {
  bold: boolean;
  italic: boolean;
  strike: boolean;
}

const NO_MARKS: StyleMarks = { bold: false, italic: false, strike: false };

function silent(el: Element): boolean {
  const raw = el.getAttribute?.('style');
  if (raw && AFFECTS_TYPEFACE.test(raw)) return false;
  const snapshot = el.getAttribute?.(SNAPSHOT_ATTR);
  return !snapshot || !AFFECTS_TYPEFACE.test(snapshot);
}

/**
 * What this element's style shows that its surroundings do not already.
 *
 * Not "font-weight ≥ 600 means bold": a heading, a table header and a `<strong>`
 * are already bold, and every one of them is routinely given the weight it
 * already has — by a CMS, by a paste from a word processor, by a theme. Emitting
 * `**` for those puts asterisks inside a `##` and doubles the marks on a
 * `<strong>`, neither of which the page showed. What is worth a mark is the run
 * that is *heavier than the block it sits in*, so both weights are worked out and
 * compared: the one the element declares, and the one it would have had without
 * the declaration.
 *
 * Italic and strikethrough are the same question with a simpler scale.
 */
export function addedMarks(el: Element): StyleMarks {
  if (silent(el)) return NO_MARKS;
  const read = elementStyle(el);
  const tag = tagOf(el);
  const context = inheritedFace(el);

  // The face the element would have had with no style of its own, which is what
  // the declaration has to beat to be worth a mark.
  const baseWeight = BOLD_TAGS.has(tag) ? BOLD_WEIGHT : context.weight;
  const baseItalic = ITALIC_TAGS.has(tag) || context.italic;
  const baseStruck = STRUCK_TAGS.has(tag) || context.struck;

  const weight = weightFrom(read, context.weight) ?? baseWeight;
  const italic = italicFrom(read) ?? baseItalic;
  const struck = struckFrom(read) ?? baseStruck;

  return {
    bold: weight >= BOLD_THRESHOLD && baseWeight < BOLD_THRESHOLD,
    italic: italic && !baseItalic,
    strike: struck && !baseStruck,
  };
}

/**
 * What this element's style takes back from what its tag would emit.
 *
 * `<strong style="font-weight:normal">` is a real shape — a template writes the
 * tag for its meaning and the stylesheet then declines the weight — and the
 * reader saw no bold text. Writing `**` there is the same defect as dropping it,
 * pointing the other way: the file claims something the page did not show.
 */
export function suppressedMarks(el: Element): StyleMarks {
  if (silent(el)) return NO_MARKS;
  const read = elementStyle(el);
  return {
    // Only a declaration can decline anything; the default here is the weight the
    // tag would have had, which declines nothing.
    bold: (weightFrom(read, inheritedFace(el).weight) ?? BOLD_WEIGHT) < BOLD_THRESHOLD,
    italic: italicFrom(read) === false,
    strike: struckFrom(read) === false,
  };
}

/** Whether this element's style puts its content on a line its tag would not. */
export function displaysAsBlock(el: Element): boolean {
  if (BLOCK_TAGS.has(tagOf(el))) return false;
  return displayFrom(elementStyle(el)) === 'block';
}

/** Whether this element's style keeps its content in the line its tag would leave. */
export function displaysInline(el: Element): boolean {
  return displayFrom(elementStyle(el)) === 'inline';
}

/** Whether this element is styled out of the render, or out of sight. */
export function hiddenByStyle(el: Element): boolean {
  const read = elementStyle(el);
  return hiddenFrom(read) || visuallyHiddenFrom(read);
}
