// The preview renders Markdown with `html: true`, so a tag in captured text would
// render as markup unless it is escaped first. Two kinds of tags arrive:
//
//   - the three the core emits inline — `sub`, `sup`, `br` — which must render;
//   - a whole HTML table, which the core falls back to when GFM cannot express a
//     table (merged cells, a nested table, preformatted text). Escaping that
//     showed the user markup instead of a table.
//
// Everything else is the page's own text. That distinction cannot be made tag by
// tag: a page written *about* HTML — the kind this extension gets used on — has
// bare `<table>` and `<pre>` in its prose, indistinguishable from ours. So the
// fallback is recognized as a complete block and lifted out before escaping,
// while prose that merely mentions a tag is escaped like any other text.

const INLINE_TAGS = new Set(['sub', 'sup', 'br']);

// Inside a fallback table only these appear, bare or with a numeric span. An
// attribute is enough to matter: `style` survives DOMPurify, so a literal
// `<table style="position:fixed;inset:0">` in captured text becomes an overlay.
const TABLE_TAGS = new Set(['table', 'caption', 'tr', 'th', 'td', 'pre', 'code']);
const TABLE_ATTRS = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;

const TABLE_BLOCK = /^<table>\n(?:.*\n)*?<\/table>$/gm;
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

// The shape serializeStructuralTable() produces: <table> on its own line, then
// one <caption> or <tr> per line, then </table>. Prose does not look like this.
function isCoreTableBlock(block: string): boolean {
  const body = block.split('\n').slice(1, -1);
  if (body.length === 0) return false;
  if (!body.every((line) => /^<tr>.*<\/tr>$/.test(line) || /^<caption>.*<\/caption>$/.test(line))) {
    return false;
  }
  for (const [, , tagName, attrs] of block.matchAll(TAG)) {
    if (!TABLE_TAGS.has(String(tagName).toLowerCase())) return false;
    if (!TABLE_ATTRS.test(attrs ?? '')) return false;
  }
  return true;
}

// Must not occur in the input: substituting back cannot tell a placeholder the
// page wrote from one this function inserted. Candidates grow by a character, so
// the search ends within the length of the input.
function mintPlaceholder(text: string): string {
  let token = '\uE000t\uE000';
  for (let padding = 1; text.includes(token); padding += 1) {
    token = `\uE000t${'\uE001'.repeat(padding)}\uE000`;
  }
  return token;
}

function escapeStrayTags(text: string): string {
  return text.replace(TAG, (match, slash, tagName, attrs) => {
    if (INLINE_TAGS.has(String(tagName).toLowerCase()) && attrs === '') return match;
    return `&lt;${slash}${tagName}${attrs}&gt;`;
  });
}

export function escapeHtmlTagsInMarkdown(md: string): string {
  const token = mintPlaceholder(md);
  const blocks: string[] = [];

  const withoutTables = md.replace(TABLE_BLOCK, (block) => {
    if (!isCoreTableBlock(block)) return block;
    blocks.push(block);
    return `${token}${blocks.length - 1}${token}`;
  });

  const escaped = withoutTables
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, i) => (i % 2 === 1 ? part : escapeStrayTags(part))) // code span or fence — untouched
    .join('');

  return escaped.replace(
    new RegExp(`${token}(\\d+)${token}`, 'g'),
    (_match, index: string) => blocks[Number(index)] ?? '',
  );
}
