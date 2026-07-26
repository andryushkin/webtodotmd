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
// opens with `<table>`, closes it, nests correctly, and contains nothing but the
// tags and attributes the serializer emits. Prose fails on the first stray tag or
// unbalanced close and gets escaped like any other text.

const PAIRED_TAGS = new Set(['table', 'caption', 'tr', 'th', 'td', 'pre', 'code', 'sub', 'sup']);
const VOID_TAGS = new Set(['br']);
const INLINE_TAGS = new Set(['sub', 'sup', 'br']);

// An attribute is enough to matter: `style` survives DOMPurify, so a literal
// `<table style="position:fixed;inset:0">` in captured text becomes an overlay.
const ALLOWED_ATTRS = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

/** Index just past the table block starting at `start`, or null if it is not one. */
function coreTableBlockEnd(md: string, start: number): number | null {
  const stack: string[] = [];
  const tag = new RegExp(TAG.source, 'g');
  tag.lastIndex = start;
  let textFrom = start;
  let match: RegExpExecArray | null;

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
      if (stack.length === 0) return match.index + full.length;
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

function escapePart(part: string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const start = part.indexOf('<table', pos);
    if (start === -1) break;
    const end = coreTableBlockEnd(part, start);
    if (end === null) {
      // Not our markup: escape up to and including this tag, then keep looking.
      const tagEnd = part.indexOf('>', start);
      const stop = tagEnd === -1 ? part.length : tagEnd + 1;
      out += escapeStrayTags(part.slice(pos, stop));
      pos = stop;
      continue;
    }
    out += escapeStrayTags(part.slice(pos, start)) + part.slice(start, end);
    pos = end;
  }
  return out + escapeStrayTags(part.slice(pos));
}

export function escapeHtmlTagsInMarkdown(md: string): string {
  return md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, i) => (i % 2 === 1 ? part : escapePart(part))) // code span or fence — untouched
    .join('');
}
