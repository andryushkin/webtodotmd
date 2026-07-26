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
 * 3. **Put the page back exactly as it was.** A capture is a read. The
 *    attribute's previous value is restored rather than removed, because the
 *    page may own the name — the same discipline `core/src/browser.ts` uses for
 *    its own marks, and for the same reason.
 */

import {
  BOLD_THRESHOLD,
  BOLD_WEIGHT,
  CLIPPED_PROPERTIES,
  NORMAL_WEIGHT,
  SNAPSHOT_ATTR,
  displayFrom,
  isBlockTag,
  isBoldTag,
  isItalicTag,
  isStruckTag,
  italicFrom,
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
  visibility: string;
}

const PLAIN: Context = { weight: NORMAL_WEIGHT, italic: false, visibility: 'visible' };

interface Pending {
  el: Element;
  declarations: string[];
  /**
   * Where a `visibility:hidden` sits in `declarations`, so a visible descendant
   * can take it back. `visibility` is the one property here that a child can
   * override after its parent has already been decided, and the sanitizer drops
   * an element with everything under it — so an ancestor marked hidden would
   * take a visible child with it. Nothing else needs this: no descendant of a
   * `display:none`, an `opacity:0` or a clipped box can be seen either.
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

/** Whether any time in a comma-separated CSS time list is non-zero. */
function anyPositive(list: string | undefined): boolean {
  return (list ?? '').split(',').some((part) => Number.parseFloat(part) > 0);
}

/**
 * Whether the element is on its way in rather than kept out.
 *
 * `opacity: 0` is two different things on a modern page: text a script has put
 * beyond reach, and a section that a reveal-on-scroll library has not animated
 * in yet. Both look identical to a style attribute, and the second is most of the
 * page below the fold — dropping it would take an article's second half out of a
 * select-all. A declared transition or a running animation is the difference, and
 * it is a difference only a computed style can see.
 */
function reveals(read: StyleReader): boolean {
  if ((read('animation-name') ?? 'none') !== 'none') return true;
  if (!anyPositive(read('transition-duration'))) return false;
  return /\ball\b|\bopacity\b/.test(read('transition-property') ?? '');
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

/** The declarations a clipped-away element's verdict rests on. */
function clippedDeclarations(read: StyleReader): string[] {
  const all: string[] = [];
  for (const property of CLIPPED_PROPERTIES) carry(all, property, read(property));
  // Most of those are the property's initial value and travel for nothing; they
  // are collected only because the list has to be the list the verdict is made
  // from. Which ones carried it is not reasoned about — the short set is asked
  // the same question, and kept only if it still answers yes.
  const kept = all.filter((declaration) => !INERT.test(declaration));
  if (kept.length > 0 && visuallyHiddenFrom(readerOf(kept))) return kept;
  // The short set could not carry the verdict, or the value limits above left
  // nothing to carry at all. The verdict still holds — the reader saw none of
  // this — so the whole set travels, and failing that the shape is named.
  return all.length > 0 ? all : ['clip:rect(0px, 0px, 0px, 0px)'];
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

  function walk(el: Element, context: Context, retractable: Pending[]): void {
    if (seen.has(el)) return;
    seen.add(el);
    const read = computed(el);
    const tag = el.tagName.toLowerCase();

    // Out of the render, and nothing below can bring it back: stop here rather
    // than mark a whole hidden menu one element at a time.
    if (firstWord(read('display')) === 'none') {
      record(el, ['display:none']);
      return;
    }
    if (visuallyHiddenFrom(read)) {
      record(el, clippedDeclarations(read));
      return;
    }
    const opacity = read('opacity');
    if (opacity !== undefined && Number.parseFloat(opacity) === 0 && !reveals(read)) {
      record(el, ['opacity:0']);
      return;
    }
    if (OPAQUE.has(tag) || el.classList?.contains('katex')) {
      record(el, []);
      return;
    }

    const declarations: string[] = [];
    let retraction = NOT_RETRACTABLE;

    const visibility = read('visibility') ?? 'visible';
    if (visibility === 'visible' && context.visibility !== 'visible') {
      // The page reveals here what an ancestor hid. Every claim above this point
      // is wrong about at least this element, and the sanitizer would delete it
      // along with them.
      for (const entry of retractable) {
        if (entry.retractable !== NOT_RETRACTABLE) {
          entry.declarations[entry.retractable] = '';
          entry.retractable = NOT_RETRACTABLE;
        }
      }
      retractable = [];
    } else if (
      (visibility === 'hidden' || visibility === 'collapse') &&
      // No ancestor's claim is still standing over this element — either none was
      // made, or a visible cousin took it back and this branch has to speak for
      // itself. Asking the inherited value instead would leave the hidden sibling
      // of a revealed one unmarked.
      !retractable.some((entry) => entry.retractable !== NOT_RETRACTABLE)
    ) {
      retraction = declarations.length;
      declarations.push(`visibility:${visibility}`);
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

    const entry = record(el, declarations, retraction);
    const below =
      entry !== undefined && retraction !== NOT_RETRACTABLE
        ? [...retractable, entry]
        : retractable;

    const next: Context = { weight, italic, visibility };
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
      walk(child, next, below);
    }
    // A shadow tree is styled by rules nobody outside it can see, and the content
    // script flattens it by copying `innerHTML` — which carries attributes and
    // nothing else. Without this pass web components arrive as unstyled text.
    const shadow = (el as Element & { shadowRoot?: { firstElementChild: Element | null } | null })
      .shadowRoot;
    if (shadow) {
      for (let child = shadow.firstElementChild; child; child = child.nextElementSibling) {
        walk(child, next, below);
      }
    }
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
    visibility: read('visibility') ?? 'visible',
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
