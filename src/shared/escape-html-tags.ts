// The preview renders Markdown with `html: true`, so a tag in captured text would
// render as markup unless it is escaped first. Two kinds of tags arrive:
//
//   - the three the core emits inline — `sub`, `sup`, `br` — which must render;
//   - a whole HTML table, which the core falls back to when GFM cannot express a
//     table (merged cells, a nested table, preformatted text). Escaping it showed
//     the user markup instead of a table.
//
// Everything else is the page's own text. The distinction cannot be made tag by
// tag: a page written *about* HTML — the kind this extension gets used on — has
// bare `<table>` and `<pre>` in its prose, indistinguishable from ours. Nor by
// matching the block's lines, which was tried and missed the serializer's own
// output: a nested table and a multi-line `<code>` both span several lines.
//
// So a candidate block is walked tag by tag with a stack, and accepted only if it
// opens with `<table>` on its own line, closes it, nests correctly, and contains
// nothing but the tags and attributes the serializer emits. Prose fails on the
// first stray tag or unbalanced close and gets escaped like any other text.
//
// The allowed set is imported from the core rather than restated: a restatement
// drifts, and a drifted one escapes the whole table, not just the new tag.
import {
  FALLBACK_ATTR_PATTERN,
  FALLBACK_INLINE_TAGS,
  FALLBACK_TAGS,
  FALLBACK_VOID_TAGS,
} from '../../core/src/fallback-tags';

const VOID_TAGS = new Set<string>(FALLBACK_VOID_TAGS);
const INLINE_TAGS = new Set<string>(FALLBACK_INLINE_TAGS);
const PAIRED_TAGS = new Set<string>(
  [...FALLBACK_TAGS, ...FALLBACK_INLINE_TAGS].filter((tag) => !VOID_TAGS.has(tag)),
);

// An attribute is enough to matter: `style` survives DOMPurify, so a literal
// `<table style="position:fixed;inset:0">` in captured text becomes an overlay.
const ALLOWED_ATTRS = FALLBACK_ATTR_PATTERN;

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

/** Index just past the table block starting at `start`, or null if it is not one. */
function coreTableBlockEnd(md: string, start: number): number | null {
  const stack: string[] = [];
  const tag = new RegExp(TAG.source, 'g');
  tag.lastIndex = start;
  let textFrom = start;
  let match: RegExpExecArray | null;

  // The serializer writes <table> at the start of a line and </table> at the end
  // of one. A page quoting a snippet inside a sentence does not, and that snippet
  // is content to show, not markup to render.
  if (start !== 0 && md[start - 1] !== '\n') return null;

  while ((match = tag.exec(md)) !== null) {
    // A stray '<' between tags means this is prose, not our markup: the core
    // escapes page text inside a fallback table, so '<' only appears in tags.
    if (md.slice(textFrom, match.index).includes('<')) return null;

    const [full, slash, rawName, attrs] = match;
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_ATTRS.test(attrs ?? '')) return null;

    if (VOID_TAGS.has(name)) {
      if (slash) return null;
    } else if (!PAIRED_TAGS.has(name)) {
      return null;
    } else if (slash) {
      if (stack.pop() !== name) return null;
      if (stack.length === 0) {
        const end = match.index + full.length;
        return end === md.length || md[end] === '\n' ? end : null;
      }
    } else {
      if (stack.length === 0 && name !== 'table') return null;
      stack.push(name);
    }
    textFrom = match.index + full.length;
  }
  return null;
}

function escapeStrayTags(text: string): string {
  return text.replace(TAG, (match, slash, tagName, attrs) => {
    if (INLINE_TAGS.has(String(tagName).toLowerCase()) && attrs === '') return match;
    return `&lt;${slash}${tagName}${attrs}&gt;`;
  });
}

function escapeOutsideCode(text: string): string {
  return text
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, i) => (i % 2 === 1 ? part : escapeStrayTags(part))) // code span or fence — untouched
    .join('');
}

export function escapeHtmlTagsInMarkdown(md: string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const start = md.indexOf('<table', pos);
    if (start === -1) break;
    const end = coreTableBlockEnd(md, start);
    if (end === null) {
      const tagEnd = md.indexOf('>', start);
      const stop = tagEnd === -1 ? md.length : tagEnd + 1;
      out += escapeOutsideCode(md.slice(pos, stop));
      pos = stop;
      continue;
    }
    // A cell's text may hold backticks, so the block has to be taken out before
    // the code-span split — otherwise the split cut the table in half and both
    // halves were escaped as unbalanced markup.
    out += escapeOutsideCode(md.slice(pos, start)) + md.slice(start, end);
    pos = end;
  }
  return out + escapeOutsideCode(md.slice(pos));
}
