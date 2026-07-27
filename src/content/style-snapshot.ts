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
 * 3. **Say it out loud where silence would let the attribute decide.** Rule 2
 *    has one exception, and it is the whole of what a snapshot can take back.
 *    The core reads the page's own `style` wherever this is silent, so a hiding
 *    declaration the cascade overruled — an `!important` rule, a transition that
 *    turns an `opacity: 0` into a reveal, a box a descendant makes visible again
 *    — has to be answered with the computed value. Silence there is the
 *    attribute deciding alone, and it decides to delete the element with
 *    everything under it.
 * 4. **Put the page back exactly as it was.** A capture is a read. The
 *    attribute's previous value is restored rather than removed, because the
 *    page may own the name — the same discipline `core/src/browser.ts` uses for
 *    its own marks, and for the same reason.
 *
 * `visibility` is the one property here a descendant can take back, so its mark
 * is the one that cannot be decided on the way down: the walk collects the
 * subtree's claims and settles them on the way out, where it knows whether
 * anything below can be seen. Reading it in document order kept a hidden
 * paragraph whenever a visible one happened to come after it.
 */

import {
  BOLD_THRESHOLD,
  BOLD_WEIGHT,
  CLIPPED_PROPERTIES,
  HIDING_PROPERTIES,
  NORMAL_WEIGHT,
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

/** What an element inherits from the box it sits in. */
interface Context {
  weight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right' | undefined;
}

const PLAIN: Context = { weight: NORMAL_WEIGHT, italic: false, align: undefined };

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
export function snapshotStyles(roots: Iterable<Element>, computed: ComputedStyleOf): () => void {
  const pending: Pending[] = [];
  const seen = new WeakSet<Element>();

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
    const tag = el.tagName.toLowerCase();

    // Out of the render, and nothing below can bring it back: stop here rather
    // than mark a whole hidden menu one element at a time.
    if (firstWord(read('display')) === 'none') {
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
    // back on wherever the snapshot is silent.
    const claimsInvisible = invisibleFrom(inlineStyle(el));

    const declarations: string[] = [];
    answerOverruledAttribute(el, read, declarations);

    // Nothing inside can carry a mark, but the element is judged like any other:
    // a hidden code sample is hidden, and one the page hid in its own attribute
    // and the stylesheet showed again has to say so.
    if (OPAQUE.has(tag) || el.classList?.contains('katex')) {
      if (invisible) declarations.push(`visibility:${visibility}`);
      else if (claimsInvisible) declarations.push('visibility:visible');
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
    const box = displayFrom(read);
    if (box === 'block' && !isBlockTag(tag)) declarations.push('display:block');
    else if (box === 'inline' && isBlockTag(tag)) declarations.push('display:inline');

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

    const next: Context = { weight, italic, align };
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

    // Something in here is visible, or this element is. Either way the box stays
    // — and if its own attribute hides it, the snapshot has to say so, because
    // removal would take the visible part with it. What is genuinely hidden
    // inside has already marked itself.
    if (claimsInvisible) declarations.push('visibility:visible');
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
      walk(root, parent === null ? PLAIN : contextOf(computed(parent), parent), []);
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

  return restore;
}

function contextOf(read: StyleReader, el: Element): Context {
  const tag = el.tagName.toLowerCase();
  return {
    weight: weightFrom(read, NORMAL_WEIGHT) ?? (isBoldTag(tag) ? BOLD_WEIGHT : NORMAL_WEIGHT),
    italic: italicFrom(read) ?? isItalicTag(tag),
    align: alignFrom(read),
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
