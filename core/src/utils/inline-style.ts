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

/**
 * The mark a content script leaves on a container whose children the reader saw
 * side by side — a flex or grid row (`src/content/style-snapshot.ts`).
 *
 * It is not a `display` and is deliberately not written as one: the snapshot
 * stays silent about the `block` such a container derives onto its items,
 * because recording it turned a navigation row into one paragraph per link.
 * What that silence lost is the gap between the items, and markup has none to
 * give — `<a>c#</a><a>python</a>` is what a tag list is, and it came back
 * `c#python`.
 */
export const ROW_ATTR = 'data-s2md-row';

// A list whose items were laid along a line rather than down the page. The
// container is ordinary — `display:block` — so no snapshot marks it, and the
// items themselves are what the page inlined.
const LIST_CONTAINERS = new Set(['ul', 'ol', 'menu']);

/**
 * Whether this node is such a container: marked by a snapshot, or a list the
 * page laid out along a line.
 *
 * The second is the same class of loss with the mark unavailable. Stack Overflow
 * writes its tags as `<li class="d-inline mr4">`, five of them with not one
 * character between `</li>` and the next `<li>` — the gap on screen is a
 * `margin`, which no snapshot records and no clone can measure. The container is
 * a plain `<ul>`, so `blockifiesIntoRow` never sees it, and the tags arrived as
 * `javac++performancecpu-architecture`: four words a search will never find
 * again.
 *
 * An item of a list is a thing counted separately — that is what a list is — and
 * a page that lays its items along a line still shows the reader where one ends,
 * with a gap, a background or a border. Markdown can carry none of those, and it
 * does not have to: what it must not do is spell two of them as one word. Paying
 * a blank on a list that really did run its items together costs a character
 * nobody sees; refusing it costs the words.
 *
 * The first item answers for the list. The inlining comes from one rule over all
 * of them, so a mixed list is not a shape pages have, and asking every item
 * would be a walk of the whole list per text node inside it.
 */
export function laysARow(node: Node | null | undefined): boolean {
  if (node?.nodeType !== 1 /* ELEMENT_NODE */) return false;
  const el = node as Element;
  if (el.getAttribute?.(ROW_ATTR) != null) return true;
  if (!LIST_CONTAINERS.has(tagOf(el))) return false;
  for (let item = el.firstElementChild; item; item = item.nextElementSibling) {
    if (tagOf(item) !== 'li') continue;
    return statesDisplay(item) && displaysInline(item);
  }
  return false;
}

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
 *
 * The last declaration is flushed after the loop rather than by a branch inside
 * it. Inside the loop the flush sat *after* the test for an open quote, so it
 * was unreachable while one was open and the attribute's whole tail was thrown
 * away instead — an apostrophe in a font name (`font-family:Tom's`) is all it
 * took, and a trailing backslash could step the index past the end and lose the
 * tail with no quote open at all. CSS closes an unterminated string at the end
 * of input; so does this now, and a value that is then nonsense is rejected by
 * the readers below, which is where a nonsense value belongs.
 */
function parseDeclarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote !== '') {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === ';' && depth === 0) {
      addDeclaration(out, css.slice(start, i));
      start = i + 1;
    }
  }
  addDeclaration(out, css.slice(start));
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

/**
 * Whether either attribute is present at all — the cheapest question there is,
 * and the right one only for a walk that has to visit every ancestor anyway.
 *
 * Not exported, and not a gate for a rule: presence says nothing about whether
 * the work it guards can change a character of the output, and `color` is most
 * of what a page writes inline. `statesConversion()` below is that gate.
 */
function hasStyle(el: Element): boolean {
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

// A Map, not an object literal, and for a reason that has nothing to do with
// taste: a plain object answers `constructor`, `toString` and every other name on
// `Object.prototype` with a function, and the lookups below test the answer
// against `undefined`. A CSS value is page text, so the page picks the key — and
// a lookup that says "yes, a number" while handing back `Object` puts a function
// where the rest of this file has declared a weight.
const NAMED_WEIGHTS = new Map<string, number>([
  ['normal', NORMAL_WEIGHT],
  ['bold', BOLD_WEIGHT],
]);

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
  const named = NAMED_WEIGHTS.get(value);
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

/**
 * The properties that say an element is on its way in rather than kept out.
 *
 * Named here so a snapshot can carry the evidence beside an `opacity: 0` it
 * decided to keep: the transition lives in the stylesheet and the `opacity` in
 * the attribute more often than not, and the clone reads only the attribute.
 */
export const REVEAL_PROPERTIES: readonly string[] = [
  'animation-name', 'transition-duration', 'transition-property',
  // `position` is not evidence of a reveal but of where the box sits, which is
  // what tells a section on its way in from an overlay standing by — see
  // `revealsInFlow`. It travels with the rest so the core can ask both halves.
  'position',
];

// A CSS time, the only token in a `transition` a duration can be.
const TIME = /^-?\d*\.?\d+m?s$/;

// Everything a `transition` part can hold that is not the property being
// transitioned: the easings, by keyword and by function.
const EASING = /^(?:linear|ease(?:-in)?(?:-out)?|step-start|step-end|allow-discrete|normal|cubic-bezier\(|steps\(|linear\()/;

// What a transition has to name to be evidence, one list per question it is
// asked. `all` is in both, and is also what a part naming no property means.
//
// They are not the same list, and the difference is not an oversight. A
// transition on `color` says nothing about an `opacity: 0` ever reaching 1, so
// the opacity question refuses everything but its own property. The visibility
// question takes `opacity` too, because the pair is written as one idiom and the
// duration sits on the opacity half of it: `transition: opacity .3s, visibility
// 0s .3s` is how a fade holds the box open until the fade has finished, and the
// only part of that declaration with a duration at all names `opacity`. Asking
// the narrow question there would delete every element written that way — which
// is a tooltip and a dropdown, but also every section a fade library reveals.
// The box test in `revealsInFlow` is what still tells those apart.
const REVEALS_OPACITY = /\ball\b|\bopacity\b/;
const REVEALS_VISIBILITY = /\ball\b|\bopacity\b|\bvisibility\b/;

/** Whether any time in a comma-separated CSS time list is above zero. */
function anyPositive(list: string): boolean {
  return list.split(',').some((part) => Number.parseFloat(part) > 0);
}

/**
 * The `transition` shorthand, which is how a `style` attribute writes it.
 *
 * A comma-separated list; each part carries a property name, a duration, an
 * easing and a delay in any order, and the name is optional — a part without one
 * transitions `all`. An easing function has commas of its own, so splitting on
 * commas cuts some parts in half; every half it produces is read the same way,
 * and a half that cannot name a property or a time simply answers no.
 */
function transitionReveals(value: string, revealed: RegExp): boolean {
  for (const part of value.split(',')) {
    let duration: number | undefined;
    let property: string | undefined;
    for (const token of part.trim().split(/\s+/)) {
      if (token === '') continue;
      // The first time is the duration; a second one is the delay.
      if (TIME.test(token)) duration ??= Number.parseFloat(token);
      else if (property === undefined && !EASING.test(token)) property = token;
    }
    if ((duration ?? 0) > 0 && revealed.test(property ?? 'all')) return true;
  }
  return false;
}

/**
 * Whether the element is on its way in rather than kept out — asked about the
 * property that hid it, because the evidence is not the same for both.
 *
 * `opacity: 0` is two different things on a modern page: text a script has put
 * beyond reach, and a section a reveal-on-scroll library has not animated in yet.
 * The second is most of an article below the fold, and dropping it would take
 * half of every such page out of a select-all. A declared transition or a running
 * animation is the difference between them.
 *
 * `visibility: hidden` splits the same way, and the two questions were once asked
 * with one answer: the transition had to name `opacity` whichever property was
 * hiding the element, so `transition: visibility 30s` — the plainest statement a
 * page can make that this box is about to be shown — was read as no evidence at
 * all and the paragraph went out of the file. An animation is still evidence for
 * both: a running animation says the element is on its way somewhere whatever it
 * animates, and it is `none` on everything that is merely hidden.
 *
 * The default is the opacity question, which is the one `removedFrom` asks and
 * the one an outside caller holding a computed style asks with it.
 *
 * Both spellings are read, because both sources spell it their own way: a
 * computed style always states the longhands, and a `style` attribute almost
 * always writes the shorthand.
 */
export function revealsFrom(read: StyleReader, hiddenBy: 'opacity' | 'visibility' = 'opacity'): boolean {
  const name = read('animation-name');
  if (name !== undefined) {
    if (name !== 'none') return true;
  } else {
    const animation = read('animation');
    if (animation !== undefined && firstToken(animation) !== 'none') return true;
  }
  const revealed = hiddenBy === 'visibility' ? REVEALS_VISIBILITY : REVEALS_OPACITY;
  const duration = read('transition-duration');
  // A property list too long for a snapshot to carry arrives as silence, and
  // CSS's own default for it is `all` — so silence reveals rather than hides.
  if (duration !== undefined) {
    return anyPositive(duration) && revealed.test(read('transition-property') ?? 'all');
  }
  const shorthand = read('transition');
  return shorthand !== undefined && transitionReveals(shorthand, revealed);
}

/** Whether this style takes the element out of the render, for good. */
export function removedFrom(read: StyleReader): boolean {
  const display = read('display');
  if (display !== undefined && firstToken(display) === 'none') return true;
  const opacity = read('opacity');
  // Fully transparent, in either spelling: `0` and `0%`. A value merely close to
  // zero is left alone — the mistake that costs is deleting text a reader saw,
  // and so is deleting the text they were half a scroll away from seeing.
  if (opacity === undefined || Number.parseFloat(opacity) !== 0) return false;
  return !revealsFrom(read);
}

/**
 * Whether this style makes the element invisible — the one of these a descendant
 * can take back, because `visibility` inherits and a child may declare it again.
 *
 * `collapse` is `hidden` everywhere except on a table row or column, where it
 * removes the row instead — invisible either way.
 */
export function invisibleFrom(read: StyleReader): boolean {
  const visibility = read('visibility');
  if (visibility !== 'hidden' && visibility !== 'collapse') return false;
  return !revealsInFlow(read);
}

/**
 * Whether a `visibility:hidden` under a transition is a section on its way in
 * rather than an overlay standing by.
 *
 * Both are written the same way, so the transition alone cannot tell them apart —
 * a dropdown, a tooltip and a modal all fade the same property. What separates
 * them is the box: an overlay has to be out of the flow, or it would hold space
 * open while it is closed. A section a reveal library has not animated in yet
 * stays where it will be read.
 *
 * The narrow half is the safe one. Judged wrong here, an overlay costs the file a
 * navigation menu; the other way costs it the article.
 */
function revealsInFlow(read: StyleReader): boolean {
  if (!revealsFrom(read, 'visibility')) return false;
  const position = read('position');
  return position !== 'absolute' && position !== 'fixed';
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

// A zero side of a `clip` rect, in either spelling. Zero is the one length CSS
// lets you write without a unit, so `rect(0, 0, 0, 0)` is not an oddity but the
// commoner half of the idiom — and reading only `0px` meant every page that
// spelled it that way had its screen-reader text copied into the file. The
// extension hid the gap, because a computed style always states `0px` and the
// snapshot is what the clone reads; a library caller reading a page's own
// `style` attribute walked straight into it.
//
// Deliberately not a widening of `px()`. That reader also answers for
// `text-indent`, `left`, `top`, `width` and `height`, where a bare number is not
// a length at all — `width: 1` is a typo CSS discards, not a one-pixel box, and
// taking it for pixels would let it call an element a pinhole and delete what is
// inside. Here the number is compared against zero and nothing else, where every
// unit agrees, so there is nothing a unitless one can be mistaken for. A unit
// this does not know stays unread rather than being assumed away: `0em` is zero
// too, but the direction that costs is the one that deletes.
const ZERO_SIDE = /^-?\d*\.?\d+(?:px)?$/;

function zeroSide(side: string): boolean {
  return ZERO_SIDE.test(side) && Number.parseFloat(side) === 0;
}

// `clip: rect(0, 0, 0, 0)`, the CSS 2 spelling of "none of this". The property is
// deprecated and this is very nearly the only thing it is still written for;
// commas are optional in the legacy syntax, so both are accepted.
function clippedToNothing(value: string | undefined): boolean {
  const inside = value === undefined ? null : /^rect\(([^)]*)\)$/.exec(value.trim());
  if (!inside) return false;
  const sides = inside[1]!.split(/[\s,]+/).filter((side) => side !== '');
  return sides.length === 4 && sides.every(zeroSide);
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
 * are what a page writes — so a converter that only knows `removedFrom` and
 * `invisibleFrom` copies "Skip to main content" and "opens in a new tab" into
 * the reader's file.
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

/**
 * Every property a hiding verdict rests on that a snapshot may have to answer.
 *
 * The core reads the `style` attribute wherever the snapshot is silent, which
 * means silence cannot take back what the page wrote there. Where a stylesheet
 * overruled the attribute — an `!important` rule, or a transition that turns an
 * `opacity: 0` into a reveal — whoever holds the live nodes has to say the
 * computed value out loud, or the attribute decides alone and takes the
 * element's whole subtree with it.
 *
 * `visibility` is deliberately absent: a descendant can take that one back, so
 * the two sides state it in their own terms rather than by copying a value.
 */
export const HIDING_PROPERTIES: readonly string[] = ['display', 'opacity', ...CLIPPED_PROPERTIES];

/**
 * Which edge this style lines its text up against, in the terms GFM has.
 *
 * `start` and `end` are the logical spellings of the same thing, and a computed
 * style states them in place of `left` and `right`. `justify` is neither, and a
 * pipe table has no way to write it.
 */
export function alignFrom(read: StyleReader): 'left' | 'center' | 'right' | undefined {
  const value = read('text-align');
  if (value === undefined) return undefined;
  const keyword = firstToken(value);
  if (keyword === 'center') return 'center';
  if (keyword === 'right' || keyword === 'end') return 'right';
  if (keyword === 'left' || keyword === 'start') return 'left';
  return undefined;
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

// Everything `convert()` acts on: the three properties above and the one that
// moves the element's content onto a line of its own or back off it. Anything
// else a page writes inline — and `color`, `margin` and `padding` are most of it
// — cannot change a character of the output, so an element carrying only those
// must cost no more than an element carrying nothing.
const AFFECTS_CONVERSION = /font-weight|font-style|text-decoration|display/i;
const AFFECTS_BOX = /display/i;

// A regex over the raw attributes rather than a parse. That is the whole point:
// these two are asked before any of the work they gate, so they have to be
// cheaper than it. Neither can answer *what* the style says, only that it is on
// the subject.
function states(el: Element, properties: RegExp): boolean {
  const raw = el.getAttribute?.('style');
  if (raw != null && properties.test(raw)) return true;
  const snapshot = el.getAttribute?.(SNAPSHOT_ATTR);
  return snapshot != null && properties.test(snapshot);
}

/**
 * Whether either attribute says anything the conversion reads — the parser's
 * gate, and the reason it is not `hasStyle`.
 *
 * Presence was the old test, and it charged every styled element the ancestor
 * walk that decides whether it sits in code or maths, plus a full parse of its
 * declarations, for a `color` no rule here has ever read. A page is full of
 * those.
 */
export function statesConversion(el: Element): boolean {
  return states(el, AFFECTS_CONVERSION);
}

/**
 * Whether either attribute mentions `display` — the gate for the narrower
 * question the escaper asks, and it asks it per sibling on every lookahead walk.
 * Without it a `color` on a `<span>` paid for a parse of its declarations once
 * for every text node that walked past it.
 */
export function statesDisplay(el: Element): boolean {
  return states(el, AFFECTS_BOX);
}

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
  return !states(el, AFFECTS_TYPEFACE);
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
    bold:
      weight >= BOLD_THRESHOLD &&
      baseWeight < BOLD_THRESHOLD &&
      reachesText(el, (child) => (weightFrom(elementStyle(child), weight) ?? weight) < BOLD_THRESHOLD),
    italic: italic && !baseItalic && reachesText(el, (child) => italicFrom(elementStyle(child)) === false),
    strike: struck && !baseStruck && reachesText(el, (child) => struckFrom(elementStyle(child)) === false),
  };
}

/**
 * Whether any of this element's text is still wearing the mark by the time it is
 * drawn — that is, whether a run reaches a text node without a descendant taking
 * the mark back on the way.
 *
 * A container states a weight its own children then decline, and only the
 * children have any text: Reddit's comment header is a `<summary>` at
 * `font-weight:700` whose every child is a `<div>` back at 400, with the author's
 * name inside declaring 700 again for itself. Read off the `<summary>` alone,
 * that is bold — so the file bolded the whole header line, and the name, already
 * bold in its own right, came out `**[**name**](…)**`. Nothing on screen was
 * bold but the name.
 *
 * The walk stops at the first declaration that takes the mark back, and at the
 * first text that still carries it, which is the ordinary case and one step deep:
 * a `<span style="font-weight:700">word</span>` answers on its first child.
 */
function reachesText(el: Element, declines: (child: Element) => boolean): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === TEXT_NODE) {
      if ((node.textContent ?? '').trim() !== '') return true;
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const child = node as Element;
    if (declines(child)) continue;
    if (reachesText(child, declines)) return true;
  }
  return false;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

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

/**
 * Whether this element's style keeps its content in the line its tag would leave.
 *
 * The mirror of `displaysAsBlock` and gated the same way round: a tag that was
 * never going to draw a block has nothing to decline, and reading `inline` off
 * one would strip the marks an `<em>` or a `<code>` writes for a declaration
 * that agrees with them. `style-snapshot.ts` records the value on exactly this
 * condition, which is the other half of the same agreement.
 */
export function displaysInline(el: Element): boolean {
  if (!BLOCK_TAGS.has(tagOf(el))) return false;
  return displayFrom(elementStyle(el)) === 'inline';
}

// `visibility` inherits and a descendant can declare it back, so the nearest
// declaration on the way up is the one that decides — asking the element alone
// leaves every child of a hidden box reading as visible. The gate is `hasStyle`
// rather than a parse: this runs for every element the sanitizer looks at, and
// almost none of them has an ancestor that declares anything at all.
function invisibleAbove(el: Element): boolean {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    if (!hasStyle(node)) continue;
    const visibility = elementStyle(node)('visibility');
    if (visibility === 'visible') return false;
    if (visibility === 'hidden' || visibility === 'collapse') return true;
  }
  return false;
}

// Anything below that declares itself visible again. Only a styled element can,
// so the search is over those rather than over the subtree.
function revealedBelow(el: Element): boolean {
  const styled = el.querySelectorAll?.(`[style],[${SNAPSHOT_ATTR}]`);
  if (styled === undefined) return false;
  for (const descendant of Array.from(styled)) {
    if (elementStyle(descendant)('visibility') === 'visible') return true;
  }
  return false;
}

/**
 * What a style leaves of an element: nothing, all of it, or the box alone.
 *
 * `'removed'` takes the element and its subtree. `'invisible-but-kept'` is the
 * one box that cannot be removed while being invisible — it holds something that
 * declared itself visible again, and removal takes the subtree, so the box stays
 * and the visible part with it. Nothing under such a box is painted except what
 * declares itself back, which is a claim about the element's own text as much as
 * about its children, and only a caller holding the node can act on it.
 *
 * One function rather than two predicates beside each other, for a reason that is
 * measurable rather than tidy: the derivation walks the ancestors for every
 * element that declares no `visibility` of its own, which is very nearly every
 * element on a page. The sanitizer needs both answers about every element it
 * visits, and two predicates would charge it that walk twice.
 */
export type Hiding = 'shown' | 'removed' | 'invisible-but-kept';

export function hidingVerdict(el: Element): Hiding {
  const read = elementStyle(el);
  if (removedFrom(read) || visuallyHiddenFrom(read)) return 'removed';
  const own = read('visibility');
  const invisible = own === undefined ? invisibleAbove(el) : invisibleFrom(read);
  if (!invisible) return 'shown';
  return revealedBelow(el) ? 'invisible-but-kept' : 'removed';
}

/**
 * Whether this element is styled out of the render, or out of sight.
 *
 * `visibility` is the one property here that a descendant can take back, and
 * removing an element removes everything under it: a box that hid itself and
 * then let a child be seen again has to stay, or the text the reader was looking
 * at goes with the box. What is still hidden inside it says so for itself —
 * `visibility` inherits, so a child that declares nothing is invisible too. Every
 * child *element*, that is: a text node has no style to be asked about, which is
 * what `'invisible-but-kept'` above is for.
 */
export function hiddenByStyle(el: Element): boolean {
  return hidingVerdict(el) === 'removed';
}
