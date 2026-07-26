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
  return text.replace(TAG, (match, slash, tagName, attrs, offset: number) => {
    // The core now escapes tags in page text itself, so `\<` already means "these
    // are characters, not markup". Escaping it again produced `\&lt;pre&gt;`,
    // which renders as the entity spelled out — the very thing this guards
    // against, caused by the guard.
    if (offset > 0 && text[offset - 1] === '\\') return match;
    if (INLINE_TAGS.has(String(tagName).toLowerCase()) && attrs === '') return match;
    return `&lt;${slash}${tagName}${attrs}&gt;`;
  });
}

// Code fences and code spans are shown as written, and a table block is our own
// markup — everything else is the page's text and gets escaped. All three are
// found in one left-to-right pass: splitting on code first cut a table whose cell
// text held backticks, and scanning tables first escaped a `<table>` that sat
// inside a fence.
function fenceEnd(md: string, start: number): number {
  const marker = md.slice(start).match(/^(`{3,}|~{3,})/)?.[1];
  if (!marker) return -1;
  const close = md.indexOf(`\n${marker}`, start + marker.length);
  if (close === -1) return md.length;
  const lineEnd = md.indexOf('\n', close + 1);
  return lineEnd === -1 ? md.length : lineEnd;
}

function spanEnd(md: string, start: number): number {
  const close = md.indexOf('`', start + 1);
  if (close === -1) return -1;
  const lineEnd = md.indexOf('\n', start);
  if (lineEnd !== -1 && close > lineEnd) return -1; // a span does not cross lines
  return close + 1;
}

export function escapeHtmlTagsInMarkdown(md: string): string {
  let out = '';
  let escapeFrom = 0;
  let pos = 0;

  const flush = (upTo: number): void => {
    out += escapeStrayTags(md.slice(escapeFrom, upTo));
  };

  while (pos < md.length) {
    const ch = md[pos];
    const atLineStart = pos === 0 || md[pos - 1] === '\n';

    if (ch === '`' || ch === '~') {
      const end = atLineStart && /^(`{3,}|~{3,})/.test(md.slice(pos)) ? fenceEnd(md, pos) : -1;
      const verbatimEnd = end !== -1 ? end : ch === '`' ? spanEnd(md, pos) : -1;
      if (verbatimEnd !== -1) {
        flush(pos);
        out += md.slice(pos, verbatimEnd);
        pos = verbatimEnd;
        escapeFrom = pos;
        continue;
      }
    }

    if (ch === '<' && md.startsWith('<table', pos)) {
      const end = coreTableBlockEnd(md, pos);
      if (end !== null) {
        flush(pos);
        out += md.slice(pos, end);
        pos = end;
        escapeFrom = pos;
        continue;
      }
    }

    pos += 1;
  }

  flush(md.length);
  return out;
}
