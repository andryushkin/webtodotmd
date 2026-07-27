/**
 * What a stylesheet says, written onto the nodes so a clone can still read it.
 *
 * The core converts a detached fragment and has no layout engine behind it, so
 * everything a page states through a class — `font-bold`, `italic`, `sr-only`,
 * and the whole of Tailwind, Notion, Medium and Confluence with them — is
 * invisible by the time conversion starts. Only the content script holds live
 * nodes, and only for a moment; this is that moment being used. `getComputedStyle`
 * is called here and nowhere in `core/`, which keeps the library working the same
 * against linkedom on a server as it does in a tab.
 *
 * Three rules shape the result, each of them the reason something works:
 *
 * 1. **Read everything before writing anything.** Setting an attribute
 *    invalidates the style Chrome has cached for the subtree, so a walk that
 *    wrote as it went would pay for a recalculation on the next element it asked
 *    about. The walk collects; a second pass writes.
 * 2. **Write only what the tag and the ancestry do not already imply.** The
 *    attribute means "this element changes the face", never "this element is
 *    bold" — a `<span>` inside a bold heading inherits 700 and says nothing, so
 *    the `**` that a naive rule puts inside a `##` cannot be written at all. It
 *    is also what makes the snapshot survive being cut out of the page: a run
 *    whose weight came from a paragraph left behind carries no claim of its own.
 *    The parent's *layout* implies things too, and the same silence answers it:
 *    a flex or grid container blockifies its items, so the `display:block` an
 *    `<a>` in a row of them computes is the algorithm's word and not the page's.
 * 3. **Say it out loud where silence would let the attribute decide.** Rule 2
 *    has one exception, and it is the whole of what a snapshot can take back.
 *    The core reads the page's own `style` wherever this is silent, so a hiding
 *    declaration the cascade overruled — an `!important` rule, a transition that
 *    turns an `opacity: 0` into a reveal — has to be answered with the computed
 *    value. Silence there is the attribute deciding alone, and it decides to
 *    delete the element with everything under it. It runs the other way too, and
 *    costs the other way: an attribute claiming `visible` where the cascade hid
 *    the element keeps text nobody was shown.
 * 4. **Put the page back exactly as it was.** A capture is a read. The
 *    attribute's previous value is restored rather than removed, because the
 *    page may own the name — the same discipline `core/src/browser.ts` uses for
 *    its own marks, and for the same reason.
 *
 * `visibility` is the one property here a descendant can take back, so its mark
 * is the one that cannot be decided on the way down: the walk collects the
 * subtree's claims and settles them on the way out, where it knows whether
 * anything below can be seen. Reading it in document order kept a hidden
 * paragraph whenever a visible one happened to come after it. A box that has to
 * be kept for something visible inside it is then stated at both ends — hidden
 * on the box, visible on the descendant that took the property back — and never
 * at one: the box alone is removed with the text it was kept for, the descendant
 * alone leaves the box's own text in the file as prose nobody was shown.
 */

import {
  BOLD_THRESHOLD,
  BOLD_WEIGHT,
  CLIPPED_PROPERTIES,
  HIDING_PROPERTIES,
  LINE_ITEM_TAGS,
  NORMAL_WEIGHT,
  ONE_LINE_MARK,
  REVEAL_PROPERTIES,
  SNAPSHOT_ATTR,
  alignFrom,
  displayFrom,
  inlineStyle,
  invisibleFrom,
  isBlockTag,
  isBoldTag,
  isItalicTag,
  isStruckTag,
  italicFrom,
  removedFrom,
  revealsFrom,
  struckFrom,
  visuallyHiddenFrom,
  weightFrom,
  type StyleReader,
} from '../../core/src/utils/inline-style';

/**
 * The mark left on a container whose items the reader saw side by side.
 *
 * The snapshot says nothing about the `block` such a container derives onto its
 * items — that is rule 2 above, and recording it turned a navigation row into
 * one paragraph per link. The gap between the items is what that silence lost,
 * and markup has none to give: `<a>c#</a><a>python</a>` is what a tag list is,
 * and it came back `c#python`. One mark per container rather than per item, and
 * the core spends it in `convertChildren`.
 */
const ROW_ATTR = 'data-s2md-row';

/**
 * What that mark says when the row is only derived: a flex row, a grid more than
 * one column wide. It is the algorithm's word and it is right about the gap and
 * silent about everything else — a strip of cards three paragraphs tall reads the
 * same way, and a row the window was too narrow for reads that way and is wrong.
 * `ONE_LINE_MARK` is the same mark with a measurement behind it; the value the
 * core reads for that lives beside `ROW_ATTR` in the core, so the two sides
 * cannot spell it differently.
 */
const ROW_MARK = '1';

/**
 * What the walk read, written down beside what it decided — the HTML view's
 * answer to "why did it judge this element that way".
 *
 * Off unless the reader asked for the HTML view, because it is one attribute per
 * element and says nothing the conversion uses. Neither this nor the list below
 * existed while both were being referenced: the walk threw `ReferenceError` on
 * its first element, the `catch` around it swallowed that, and the capture went
 * on with *no* snapshot at all — no hiding, no derived rows, no styled emphasis.
 * Turning the HTML view on quietly turned the stylesheet off.
 */
const DIAGNOSTIC_ATTR = 'data-s2md-debug';

/**
 * Every property a verdict here rests on: the five this file reads itself, and
 * the ones the core's readers ask for through the same `read` — hiding, the
 * face, alignment, and the transition that says a box is on its way in.
 *
 * A list rather than "everything the style has", because a computed style has
 * some 340 properties and this runs per element.
 */
const DIAGNOSTIC_PROPERTIES = [
  'display',
  'visibility',
  'opacity',
  'position',
  'flex-direction',
  'grid-template-columns',
  'font-weight',
  'font-style',
  'text-decoration-line',
  'text-align',
  'clip',
  'clip-path',
  'text-indent',
  'overflow',
  'width',
  'height',
  'top',
  'left',
  'transition-property',
  'transition-duration',
  'animation-name',
];

/** How the walk asks for one element's computed style. */
export type ComputedStyleOf = (el: Element) => StyleReader;

/**
 * `getComputedStyle` behind the core's lookup.
 *
 * The window is a parameter because a test has no browser to reach for, and
 * because the only other way to write this is a global.
 */
export function computedStyleIn(view: {
  getComputedStyle(el: Element): { getPropertyValue(property: string): string };
}): ComputedStyleOf {
  return (el) => {
    const style = view.getComputedStyle(el);
    return (property) => {
      const value = style.getPropertyValue(property);
      // Lower-cased to match what the attribute parser will hand back when the
      // core reads the same declaration on the other side.
      return value === '' ? undefined : value.toLowerCase();
    };
  };
}

/**
 * One fragment of a line, as the layout drew it — a line box of text, or the box
 * of something replaced. Only the vertical span and whether anything was painted
 * are read, so a `DOMRect` satisfies this and a test can state one in four
 * numbers.
 */
export interface DrawnRect {
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

/** How the walk asks where an element's content was drawn. */
export type ContentRectsOf = (el: Element) => Iterable<DrawnRect>;

/** No layout engine behind the caller: every container answers "nothing seen". */
export const NOTHING_MEASURED: ContentRectsOf = () => [];

/**
 * `Range.getClientRects()` behind the walk's line count.
 *
 * A range over an element's contents hands back one rectangle per fragment the
 * layout actually drew — one per line box of text, one per replaced box — which
 * is the reader's own answer to "how many lines is this", asked without deriving
 * it from `flex-direction` or from anything else CSS was thinking. `document` is
 * a parameter for the same reason the window is on `computedStyleIn`: a test has
 * no browser, and the only other way to write it is a global.
 *
 * One `Range`, reused. The walk mutates nothing while it reads, so the range
 * cannot go stale between calls, and a live range per container would be a live
 * range per container for the rest of the capture.
 */
export function contentRectsIn(doc: Document): ContentRectsOf {
  let range: Range | undefined;
  return (el) => {
    range ??= doc.createRange();
    range.selectNodeContents(el);
    return range.getClientRects();
  };
}

/**
 * How much of the shorter fragment two rectangles must share vertically to count
 * as the same line.
 *
 * Not an equal `top`: text at two sizes on one baseline has two tops and two
 * heights, and a superscript has neither of the ones beside it. What such
 * fragments do have is most of the shorter one in common — a 12px run beside a
 * 30px one, baseline-aligned or centred, overlaps by the whole 12 — while two
 * consecutive lines of the same text overlap by nothing at all, since a line box
 * is at most its line height. Half is clear of both by a wide margin, which is
 * what a threshold on a page's own numbers has to be.
 */
const SAME_BAND = 0.5;

/**
 * Whether every fragment given was drawn on one band — one line, to the reader.
 *
 * Each rectangle is asked to overlap the *intersection* of the ones before it,
 * never merely the one before it. That is the whole of the difference between
 * this and a chain: a 200px picture beside five lines of text overlaps each of
 * the five, and a chain would fuse the five into one band on its account. Against
 * the running intersection the second line is asked about the first, finds no
 * overlap, and the answer is what the reader saw — several lines.
 *
 * `undefined` where nothing was drawn: an empty container, and every caller with
 * no layout engine at all. Zero-area rectangles are dropped first, or a box the
 * page laid out and painted nothing in would part two halves of a sentence.
 *
 * The intersection shrinks as it goes, so a different order of the same
 * rectangles can answer `false` where this answers `true`. That is the direction
 * the error is allowed to run in: `false` is the derived answer, which is what
 * the capture had before any of this.
 */
function drewOneBand(rects: Iterable<DrawnRect>): boolean | undefined {
  let top = 0;
  let bottom = 0;
  let started = false;
  for (const rect of rects) {
    const height = rect.bottom - rect.top;
    if (height <= 0 || rect.width <= 0) continue;
    if (!started) {
      top = rect.top;
      bottom = rect.bottom;
      started = true;
      continue;
    }
    const shared = Math.min(bottom, rect.bottom) - Math.max(top, rect.top);
    if (shared < SAME_BAND * Math.min(height, bottom - top)) return false;
    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }
  return started ? true : undefined;
}

/**
 * The most nodes a container may hold before the question is not worth asking.
 *
 * `getClientRects()` over a range is paid per fragment it draws, and a page shell
 * is a flex container as often as a byline is — asking it would collect every
 * line box on the page, once for every flex box on the way down. Past this budget
 * a container is not one line, and the derived answer is the one it already had.
 * Counted with an early exit, so what a container costs is the budget and not its
 * subtree.
 *
 * Set well above the shape being repaired rather than at it: a tweet is a run of
 * `<span>`s and a sentence with a mention in it is thirty or forty nodes, while a
 * page shell is thousands. Anything between those is a cheap measurement of a box
 * that turns out to have more than one line in it.
 */
const MEASURE_BUDGET = 256;

/**
 * Whether any item of this container is one the core could take into a line.
 *
 * The second half of the budget, and the sharper one: a row already derived from
 * `flex-direction` has the mark it needs for the gap, so measuring it buys
 * something only where an item would otherwise be written as a block — which is
 * to say only where it has a child in `LINE_ITEM_TAGS`. A navigation strip of
 * `<a>`, a toolbar of `<button>`, a row of `<img>`: nothing to spend the answer
 * on, so nothing is asked. Measured over four pages this refused between a
 * quarter and four fifths of the containers that pass the size budget.
 */
function holdsALineItem(el: Element): boolean {
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
    if (LINE_ITEM_TAGS.has(child.tagName.toLowerCase())) return true;
  }
  return false;
}

function withinBudget(el: Element): boolean {
  let budget = MEASURE_BUDGET;
  const stack: Node[] = [el];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (budget <= 0) return false;
      budget -= 1;
      stack.push(child);
    }
  }
  return true;
}

/** What an element inherits from the box it sits in. */
interface Context {
  weight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right' | undefined;
  /**
   * Whether the ancestry above this element is invisible. `visibility` inherits,
   * so every box under a hidden one computes `hidden` until something declares
   * itself back — which is what makes this a fact about the ancestry and not
   * about the element, and so what it travels with the rest of the inheritance
   * for. Both marks the kept-box case writes are decided by it: the box states
   * the hiding only where the hiding starts, and the element that takes the
   * property back states that only where there was something to take back.
   * Asked of the element alone, the first would be a mark on every box under a
   * hidden one, and the second could not be asked at all — "visible" is news
   * only against an ancestry that is not.
   */
  invisible: boolean;
  /**
   * Whether a `block` computed on this element is the layout algorithm's doing
   * rather than the page's. A flex or grid container *blockifies* its items —
   * every in-flow child of a `<nav style="display:flex">` computes
   * `display:block` with nothing in the page having said so — and along a row
   * that is the opposite of what the reader was shown: one line, not a paragraph
   * each. It travels with the inheritance because it is a fact about the parent,
   * and it is a fact only this side of the product can have: the core reads a
   * detached fragment, where the container's computed style is not.
   */
  derivedBlock: boolean;
}

const PLAIN: Context = {
  weight: NORMAL_WEIGHT,
  italic: false,
  align: undefined,
  invisible: false,
  derivedBlock: false,
};

interface Pending {
  el: Element;
  declarations: string[];
  /**
   * Where a `visibility:hidden` sits in `declarations`, so an ancestor that turns
   * out to be hidden as a whole can take it back and speak once for the lot.
   * `visibility` is the one property here a descendant can override, so it is the
   * one whose mark cannot be decided until the subtree below it has been read.
   * Nothing else needs this: no descendant of a `display:none`, an `opacity:0` or
   * a clipped box can be seen either, and the walk stops at those.
   */
  retractable: number;
}

const NOT_RETRACTABLE = -1;

// Subtrees with nothing in them a mark could be written on. Code and maths are
// the parser's literal set (`inLiteral`), where a `**` would be two characters of
// the sample rather than emphasis — and they are also where a syntax highlighter
// puts one `<span>` per token, so this is most of what a walk over a
// documentation page would otherwise cost. The rest the sanitizer removes whole.
// The element itself is still judged: a `<pre>` can be hidden like anything else.
const OPAQUE = new Set([
  'pre', 'code', 'kbd', 'samp', 'math', 'mjx-container', 'annotation',
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'embed',
  'textarea', 'select',
]);

/** The first component of a value — `display: block flow` is a block. */
function firstWord(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const space = value.indexOf(' ');
  return space < 0 ? value : value.slice(0, space);
}

// A declaration is one property of a style attribute, so a value carrying a
// semicolon would silently become two — and a value long enough to matter is a
// gradient or a data URI, neither of which any reader here asks about.
const MAX_VALUE = 100;

// Not named `declare`: a statement beginning with that word is an ambient
// declaration to a TypeScript parser, and the call is erased along with the types
// — silently, leaving a function nothing ever invokes.
function carry(out: string[], property: string, value: string | undefined): void {
  if (value === undefined || value === '' || value.length > MAX_VALUE) return;
  if (value.includes(';')) return;
  out.push(`${property}:${value}`);
}

// A property sitting at its initial value, which no verdict can rest on.
const INERT = /:(?:auto|none|static|visible|normal|0px)$/;

function readerOf(declarations: string[]): StyleReader {
  const map = new Map(
    declarations.map((declaration) => {
      const colon = declaration.indexOf(':');
      return [declaration.slice(0, colon), declaration.slice(colon + 1)] as const;
    }),
  );
  return (property) => map.get(property);
}

// `clip: rect(0px, 0px, 0px, 0px)` says "none of this" in one declaration and no
// other property has to agree with it, which is what makes it the shape to fall
// back on when the element's own declarations cannot be carried.
const HIDDEN_SHAPE = 'clip:rect(0px, 0px, 0px, 0px)';

// Every UA stylesheet centres a table header, so a computed `center` there is
// the tag speaking rather than the page.
const CENTRED_TAGS = new Set(['th', 'caption']);

function isCentredTag(tag: string): boolean {
  return CENTRED_TAGS.has(tag);
}

// The containers whose children CSS blockifies: a flex or grid container
// computes `block` on every in-flow item of its own, whatever the page wrote or
// left unwritten — "automatic box type transformations" in CSS Display 3, stated
// again by the flexbox and grid specs for their items. Nothing else that lays
// content out does it, and that was measured in Chrome rather than read off the
// spec and hoped for: `table`, `table-row` and `table-cell` wrap stray inline
// content in anonymous boxes and leave its `display` alone, `flow-root`,
// `list-item` and `ruby` are ordinary containers, and the legacy `-webkit-box`
// that line-clamped text still uses blockifies nothing. A suffix test, so that
// the spellings of one box all answer alike — `flex`, `inline-flex`,
// `-webkit-flex` and the two-value `inline flex` are the same container.
const BLOCKIFIES = /(?:^|[\s-])(?:flex|grid)$/;
const IS_GRID = /(?:^|[\s-])grid$/;

// A grid track of no width, which `repeat(auto-fit, …)` leaves behind for every
// column it collapsed and which nothing was laid out in.
const EMPTY_TRACK = /^0(?:\.0+)?(?:px)?$/;

/**
 * How many columns a grid ended up with.
 *
 * `grid-template-columns` computes to the *used* track list once the grid has
 * been laid out — `740px` for the single column a grid falls back to, `370px
 * 370px` for two — and this runs on live nodes, which is the one place that
 * value can be had. Line names are not tracks and a collapsed track is not a
 * column. A style that says nothing counts as one, which is the answer that
 * leaves the mark where it already was.
 */
function gridColumns(value: string | undefined): number {
  if (value === undefined) return 1;
  const tracks = value
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter((track) => track !== '' && !EMPTY_TRACK.test(track));
  return Math.max(tracks.length, 1);
}

/**
 * Whether a box reading like this blockifies its children *and* lays them out
 * side by side — the two halves of the question the `display` mark rests on.
 *
 * Blockification alone is not the answer, because a flex column and a
 * single-column grid stack their items, and there the derived `block` and the
 * screen agree: each item did open a line of its own, and the mark is what keeps
 * it. Only a row disagrees, and a row is what a chip list, a toolbar, a tag
 * strip and a page's navigation are made of. `above` is the same answer for this
 * box's own parent, which a `display:contents` box hands straight on: it
 * generates no box, so the items of the container above it are its children —
 * Chrome computes `block` on the `<a>` of a `flex > contents > a` for that
 * reason.
 */
function blockifiesIntoRow(
  display: string | undefined,
  read: StyleReader,
  above: boolean,
): boolean {
  if (!blockifies(display, above)) return false;
  if (display === 'contents') return true;
  if (IS_GRID.test(display!)) return gridColumns(read('grid-template-columns')) > 1;
  return !(read('flex-direction') ?? 'row').startsWith('column');
}

/**
 * The first half on its own: whether this box blockifies its children at all,
 * whichever way it then lays them out.
 *
 * That is the set of boxes where the line count is worth measuring, and it is
 * exactly the set where the derived answer can be wrong in either direction — a
 * row that wrapped, a column holding one item. Nothing else derives a `block`, so
 * nothing else has anything for a measurement to take back.
 */
function blockifies(display: string | undefined, above: boolean): boolean {
  if (display === undefined) return false;
  if (display === 'contents') return above;
  return BLOCKIFIES.test(display);
}

/**
 * Answers a hiding declaration in the `style` attribute that the cascade overruled.
 *
 * The snapshot is the later word only where it speaks: the core falls back on the
 * attribute for every property this is silent about, so silence here cannot take
 * anything back. An `!important` rule that lifts a `display:none`, or a
 * stylesheet transition that turns an `opacity:0` into a section on its way in —
 * both leave the attribute saying the opposite of what the reader saw, and the
 * attribute deciding alone deletes the element with everything under it.
 *
 * Only the properties the attribute actually claims are answered, so this costs
 * nothing on the elements — almost all of them — that claim nothing.
 */
function answerOverruledAttribute(el: Element, read: StyleReader, out: string[]): void {
  const own = inlineStyle(el);
  if (!removedFrom(own) && !visuallyHiddenFrom(own)) return;
  for (const property of HIDING_PROPERTIES) {
    if (own(property) !== undefined) carry(out, property, read(property));
  }
  // The evidence for a reveal is in the stylesheet and the `opacity: 0` is in the
  // attribute, which is exactly the split this case is about.
  if (revealsFrom(read)) {
    for (const property of REVEAL_PROPERTIES) carry(out, property, read(property));
  }
}

/** The declarations a clipped-away element's verdict rests on. */
function clippedDeclarations(read: StyleReader): string[] {
  const all: string[] = [];
  for (const property of CLIPPED_PROPERTIES) carry(all, property, read(property));
  // Most of those are the property's initial value and travel for nothing; they
  // are collected only because the list has to be the list the verdict is made
  // from. Which ones carried it is not reasoned about — each set is asked the
  // same question, and kept only if it still answers yes.
  const kept = all.filter((declaration) => !INERT.test(declaration));
  if (kept.length > 0 && visuallyHiddenFrom(readerOf(kept))) return kept;
  // The full set is asked too, and not assumed: `carry` drops a value longer than
  // it can spell or one carrying a semicolon, so the declaration the verdict
  // actually rested on may be the one missing. A set that no longer reads as
  // hidden would let the element through with the text nobody saw still in it —
  // which is the whole of what this function exists to prevent.
  if (all.length > 0 && visuallyHiddenFrom(readerOf(all))) return all;
  // Nothing that could be carried carries the verdict. It still holds — the
  // reader saw none of this — so the shape is named instead.
  return [HIDDEN_SHAPE];
}

/**
 * Records the computed style of everything under `roots` that says something new.
 *
 * Returns the undo. Call it once the fragment has been cloned — and from a
 * `finally`, because until it runs the page is carrying attributes it did not
 * ask for.
 */
export function snapshotStyles(
  roots: Iterable<Element>,
  computed: ComputedStyleOf,
  diagnostics = false,
  contentRects: ContentRectsOf = NOTHING_MEASURED,
): () => void {
  const pending: Pending[] = [];
  const rows: Array<{ el: Element; mark: string }> = [];
  const diagnosed: Array<{ el: Element; text: string }> = [];
  const seen = new WeakSet<Element>();

  /**
   * How many lines this container's content was drawn on, as one question: was
   * it one? `undefined` where the answer was not had — no layout engine, nothing
   * drawn, or a container too large to be one line and so not worth measuring.
   *
   * The measurement is the only thing in this walk that reaches outside a
   * computed style, and it is still a read. It costs one forced layout — the
   * walk writes nothing until it has read everything, so that layout is computed
   * once and every container after the first is only the fragments it draws.
   * Measured over the whole `<body>` of four pages, the fragments came to
   * 0.4–9.7 ms and the whole snapshot pass went from 5.9–53.5 ms to 6.1–58.6 ms;
   * a capture walks a selection's scope rather than a document.
   */
  const oneLine = (el: Element): boolean | undefined => {
    if (!withinBudget(el)) return undefined;
    try {
      return drewOneBand(contentRects(el));
    } catch {
      // A caller's measurement that faults is a capture with no measurement, not
      // a failed capture — the same bargain the walk itself is written under.
      return undefined;
    }
  };

  const record = (
    el: Element,
    declarations: string[],
    retractable = NOT_RETRACTABLE,
  ): Pending | undefined => {
    // An element the page had already written this attribute on gets an entry
    // even with nothing to say, so that its own value cannot be read back as one
    // of ours. The undo puts it right back.
    if (declarations.length === 0 && el.getAttribute(SNAPSHOT_ATTR) === null) return undefined;
    const entry: Pending = { el, declarations, retractable };
    pending.push(entry);
    return entry;
  };

  /**
   * Walks `el`, appending to `marks` the entries in this subtree that claim
   * `visibility:hidden`, and answering whether anything in it can be seen.
   *
   * That answer is what decides the one property here a descendant can take
   * back, and it can only be given on the way out — which is why the marks
   * travel with it. A box that is hidden with nothing visible under it absorbs
   * its subtree's marks and speaks once; a box that is hidden with something
   * visible under it leaves them where they are and says nothing itself.
   */
  function walk(el: Element, context: Context, marks: Pending[]): boolean {
    // A second root inside the first. Reading it as visible is the safe answer:
    // the worst it does is leave an ancestor's claim unmade.
    if (seen.has(el)) return true;
    seen.add(el);
    const read = computed(el);
    if (diagnostics) diagnosed.push({ el, text: everythingRead(read) });
    const tag = el.tagName.toLowerCase();
    // Read once: the hiding check below, the mark this element writes and the
    // question its children ask about their parent are all the same property.
    const display = read('display');

    // Out of the render, and nothing below can bring it back: stop here rather
    // than mark a whole hidden menu one element at a time.
    if (firstWord(display) === 'none') {
      record(el, ['display:none']);
      return false;
    }
    if (visuallyHiddenFrom(read)) {
      record(el, clippedDeclarations(read));
      return false;
    }
    const opacity = read('opacity');
    if (opacity !== undefined && Number.parseFloat(opacity) === 0 && !revealsFrom(read)) {
      record(el, ['opacity:0']);
      return false;
    }

    const visibility = read('visibility') ?? 'visible';
    // Asked of the core, not spelled again here: a `visibility:hidden` sitting in
    // the flow under a transition is a section on its way in, and the two sides
    // have to agree about that or the snapshot would mark what the core keeps.
    const invisible = invisibleFrom(read);
    // What the `style` attribute says on its own, which is what the core falls
    // back on wherever the snapshot is silent — in both directions: an attribute
    // claiming `visible` under an ancestry the cascade hid decides for itself
    // too, and decides against the screen.
    const own = inlineStyle(el);
    const claimsInvisible = invisibleFrom(own);
    const claimsVisible = own('visibility') === 'visible';

    const declarations: string[] = [];
    answerOverruledAttribute(el, read, declarations);

    // Nothing inside can carry a mark, but the element is judged like any other:
    // a hidden code sample is hidden, and one the page hid in its own attribute
    // and the stylesheet showed again has to say so.
    if (OPAQUE.has(tag) || el.classList?.contains('katex')) {
      if (invisible) declarations.push(`visibility:${visibility}`);
      // `context.invisible` for the same reason as the branch at the end of the
      // walk: a code sample the page made visible again inside a hidden box is
      // the whole reason that box is kept, and a kept box with nothing marked
      // visible under it is one the core removes whole.
      else if (claimsInvisible || context.invisible) declarations.push('visibility:visible');
      record(el, declarations);
      return !invisible;
    }

    // The face, against what this element would have shown with no stylesheet at
    // all: its tag's own contribution over what it inherits. That comparison is
    // `ownFace()` in the core, and it has to be the same one — the core recomputes
    // it on the clone, and a snapshot measured against anything else would either
    // double a mark or hide one.
    const weight = weightFrom(read, context.weight) ?? context.weight;
    const baseWeight = isBoldTag(tag) ? BOLD_WEIGHT : context.weight;
    // Compared as the decision, not as the number: 700 beside 800 is the same
    // bold to a reader and to Markdown, and writing it down would put an
    // attribute on every themed heading for nothing.
    if (weight >= BOLD_THRESHOLD !== (baseWeight >= BOLD_THRESHOLD)) {
      declarations.push(`font-weight:${weight}`);
    }

    const italic = italicFrom(read) ?? context.italic;
    if (italic !== (isItalicTag(tag) || context.italic)) {
      declarations.push(`font-style:${italic ? 'italic' : 'normal'}`);
    }

    // Strikethrough is measured against the tag alone, never the ancestry: a line
    // through a box is painted over everything inside it, but the computed
    // `text-decoration-line` of a child says `none` all the same. Inheriting the
    // context here would read every child of a `<del>` as declining the line.
    const struck = struckFrom(read) ?? false;
    if (struck !== isStruckTag(tag)) {
      declarations.push(`text-decoration-line:${struck ? 'line-through' : 'none'}`);
    }

    // Only the two answers the core acts on. `inline-block`, `table-cell` and
    // `contents` all convert exactly as the tag alone would, so recording them
    // would be weight with no consequence.
    //
    // And only where `block` is the page speaking. Under a flex or grid row it
    // is the layout algorithm instead, and the reader saw the opposite of a
    // paragraph: the twelve `<a>` of a `<nav style="display:flex">` are one line
    // on screen and came back as twelve paragraphs, one per link. An author's
    // own `display:block` on such an item computes the same `block` and cannot
    // be told apart from the derived one, so both are dropped here — what that
    // costs is a page restating a break the container was already making, and in
    // a row it was never a break at all. Where the page states it in the
    // element's own `style` attribute nothing is lost either way: the core reads
    // that attribute itself, and silence here is not a denial.
    const box = displayFrom(read);
    if (box === 'block' && !isBlockTag(tag) && !context.derivedBlock) {
      declarations.push('display:block');
    } else if (box === 'inline' && isBlockTag(tag)) {
      // No transformation runs the other way into this branch: what a ruby
      // container inlinifies computes `inline-block`, which is `other` here.
      declarations.push('display:inline');
    }

    // Which edge the text lines up against, for the one thing that reads it: a
    // pipe table's separator row. It inherits, so it is measured against the
    // context the way the weight is, and worth writing down only where it is the
    // page aligning this element — never the centring every UA stylesheet hands a
    // `<th>`, which would put `:---:` under every header of every table nobody
    // aligned at all. The price is an explicitly centred header reading as one
    // the browser centred; the alternative is the whole page paying for it.
    const align = alignFrom(read) ?? context.align;
    if (align !== undefined && align !== context.align && !(isCentredTag(tag) && align === 'center')) {
      declarations.push(`text-align:${align}`);
    }

    // A row is recorded on the container, once, rather than on each item: what
    // the core needs from it is the gap between the items, and the items
    // themselves are told nothing — recording the `block` they derive is exactly
    // what turned a navigation row into one paragraph per link. Markup writes
    // nothing between them, so without this mark `<a>c#</a><a>python</a>` is
    // `c#python` in the file and two words apart on the page.
    //
    // Measured first where it can be measured, derived where it cannot. A
    // container drawn on one band is a row whatever `flex-direction` says: the
    // column holding a single mention draws on the same band as the words either
    // side of it, and there is nothing left to reason about — the `block` its
    // item derives is a line the reader never met. It travels as a stronger value
    // of the same mark, because the core has a second use for it that the derived
    // answer cannot carry: a wrapper written as a block breaks a sentence, and
    // only a measurement can say the sentence was one line.
    //
    // Asked only where the answer can change the file: of a container that does
    // not read as a row, where it can make one, and of one that does, only where
    // an item of it is something a line could take back.
    const derivedRow = blockifiesIntoRow(display, read, context.derivedBlock);
    const measured =
      blockifies(display, context.derivedBlock) && (!derivedRow || holdsALineItem(el))
        ? oneLine(el)
        : undefined;
    const laysARow = measured === true || derivedRow;
    if (laysARow) rows.push({ el, mark: measured === true ? ONE_LINE_MARK : ROW_MARK });

    const next: Context = {
      weight,
      italic,
      align,
      invisible,
      derivedBlock: laysARow,
    };
    const below: Pending[] = [];
    let seenBelow = false;
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
      seenBelow = walk(child, next, below) || seenBelow;
    }
    // A shadow tree is styled by rules nobody outside it can see, and the content
    // script flattens it by copying `innerHTML` — which carries attributes and
    // nothing else. Without this pass web components arrive as unstyled text.
    const shadow = (el as Element & { shadowRoot?: { firstElementChild: Element | null } | null })
      .shadowRoot;
    if (shadow) {
      for (let child = shadow.firstElementChild; child; child = child.nextElementSibling) {
        seenBelow = walk(child, next, below) || seenBelow;
      }
    }

    if (invisible && !seenBelow) {
      // Nothing under here can be seen, so the whole of it goes with one mark.
      // The subtree said the same thing element by element on the way down —
      // each of them had no visible descendant either — and this takes those
      // back, which is the only reason they could wait to be written.
      for (const entry of below) {
        if (entry.retractable === NOT_RETRACTABLE) continue;
        entry.declarations[entry.retractable] = '';
        entry.retractable = NOT_RETRACTABLE;
      }
      const retraction = declarations.length;
      declarations.push(`visibility:${visibility}`);
      const entry = record(el, declarations, retraction);
      if (entry !== undefined) marks.push(entry);
      return false;
    }

    // Something in here is visible, or this element is. Either way the box stays,
    // and what it is has to be said in full: the two marks below are one claim
    // written in two places, and half of it is worse than none. A box marked
    // invisible with nothing below it marked visible is a box the core removes
    // whole, which takes the text the reader could see with it.
    if (invisible) {
      // Kept and invisible. Every hidden element inside says so for itself, but
      // the box's own text nodes have no style to say it with, so this mark is
      // the only thing that can speak for them — without it they walk into the
      // file as prose nobody was shown. Written where the hiding starts and not
      // below it: `visibility` inherits, so a box under a marked one is already
      // answered, and this is a page-sized budget where a mark per element is
      // what it cannot pay. The exception is an element whose own attribute
      // claims the opposite, where the ancestry is not what the core reads.
      if (!context.invisible || claimsVisible) declarations.push(`visibility:${visibility}`);
    } else if (claimsInvisible || context.invisible) {
      // Visible where the ancestry is not: either the page's own attribute hid
      // this element and the cascade overruled it, or this is the element that
      // takes `visibility` back — the one the box above is kept for. Unmarked,
      // it is invisible by inheritance to the core, and the mark above deletes
      // it along with the box.
      declarations.push('visibility:visible');
    }
    record(el, declarations);
    marks.push(...below);
    return true;
  }

  const undo: Array<() => void> = [];
  const restore = (): void => {
    for (let index = undo.length - 1; index >= 0; index -= 1) undo[index]!();
  };

  // Nothing here throws out of the function, in either phase. A capture that
  // failed over a stylesheet would be a worse failure than the conversion this
  // improves — and a write that stopped half way must still hand back the undo
  // for the half that happened, or the page keeps attributes forever.
  try {
    for (const root of roots) {
      const parent = root.parentElement;
      walk(root, parent === null ? PLAIN : contextOf(computed(parent), parent, oneLine), []);
    }
  } catch {
    /* whatever was collected before the fault is still worth writing */
  }

  try {
    for (const entry of pending) {
      const text = entry.declarations.filter((declaration) => declaration !== '').join(';');
      const previous = entry.el.getAttribute(SNAPSHOT_ATTR);
      if (text === '' && previous === null) continue;
      undo.push(
        previous === null
          ? () => entry.el.removeAttribute(SNAPSHOT_ATTR)
          : () => entry.el.setAttribute(SNAPSHOT_ATTR, previous),
      );
      if (text === '') entry.el.removeAttribute(SNAPSHOT_ATTR);
      else entry.el.setAttribute(SNAPSHOT_ATTR, text);
    }
  } catch {
    /* `restore` already knows about every attribute that was written */
  }

  try {
    for (const { el, text } of diagnosed) {
      if (text === '') continue;
      const previous = el.getAttribute(DIAGNOSTIC_ATTR);
      undo.push(
        previous === null
          ? () => el.removeAttribute(DIAGNOSTIC_ATTR)
          : () => el.setAttribute(DIAGNOSTIC_ATTR, previous),
      );
      el.setAttribute(DIAGNOSTIC_ATTR, text);
    }
  } catch {
    /* same: every attribute already written is in `undo` */
  }

  try {
    for (const { el, mark } of rows) {
      // The page may own this attribute the way it may own the style one, so the
      // undo restores its value rather than removing what it finds.
      const previous = el.getAttribute(ROW_ATTR);
      undo.push(
        previous === null
          ? () => el.removeAttribute(ROW_ATTR)
          : () => el.setAttribute(ROW_ATTR, previous),
      );
      el.setAttribute(ROW_ATTR, mark);
    }
  } catch {
    /* same: every attribute already written is in `undo` */
  }

  return restore;
}

/** Every property the walk consults, as declarations, skipping the silent ones. */
function everythingRead(read: StyleReader): string {
  const out: string[] = [];
  for (const property of DIAGNOSTIC_PROPERTIES) {
    const value = read(property);
    if (value !== undefined && value !== '') out.push(`${property}:${value}`);
  }
  return out.join(';');
}

function contextOf(
  read: StyleReader,
  el: Element,
  oneLine: (el: Element) => boolean | undefined,
): Context {
  const tag = el.tagName.toLowerCase();
  const display = read('display');
  return {
    weight: weightFrom(read, NORMAL_WEIGHT) ?? (isBoldTag(tag) ? BOLD_WEIGHT : NORMAL_WEIGHT),
    italic: italicFrom(read) ?? isItalicTag(tag),
    align: alignFrom(read),
    // Visible whatever the parent computes, unlike everything above. The parent
    // is not in the fragment the core reads, so its hiding cannot reach the root
    // from there and the root's own claim would go unstated — the one place
    // where deferring to the ancestry loses the verdict instead of implying it.
    invisible: false,
    // Asked of the parent even though it is outside the capture: a selection
    // that starts on one chip of a row is a root whose `block` the row derived,
    // and the mark would be as wrong there as anywhere. A `display:contents`
    // parent is answered `false` rather than walked further up — the container
    // is then two boxes away, and a selection landing on that is worth neither
    // the walk nor the reading.
    // Measured on the same terms as any other container, since a selection that
    // starts on the mention of the defect has exactly this parent. The derived
    // answer is asked first and settles it where it says yes, which is also what
    // keeps the measurement off every root whose parent is an ordinary row.
    derivedBlock:
      blockifiesIntoRow(display, read, false) ||
      (blockifies(display, false) && oneLine(el) === true),
  };
}

/**
 * The part of the page a capture of this range can reach.
 *
 * The range's own common ancestor, except that a selection inside a table is
 * given back its header row from above it (`enrichRange`) — so a range in a table
 * is snapshotted from the table down. Nothing else in the capture reads outside
 * the common ancestor, and walking the whole document instead would spend the
 * cost of every element on a page to convert a paragraph of it.
 */
export function snapshotScope(range: Range): Element | null {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return el?.closest?.('table') ?? el;
}
