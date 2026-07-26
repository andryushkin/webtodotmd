// The preview renders Markdown with `html: true`, so a tag in captured text would
// render as markup unless it is escaped first. Escaping everything is not an
// option either: the conversion core emits some HTML on purpose.
//
// Exactly what the core emits is what passes: the inline three, plus the tags of
// its HTML table fallback (a table with merged cells, a nested table or
// preformatted text takes that path, and escaping it showed the user markup
// instead of a table). No thead/tbody/tfoot — the core never writes them.
const ALLOWED_HTML_TAGS = new Set([
  'sub',
  'sup',
  'br',
  'table',
  'tr',
  'th',
  'td',
  'caption',
  'pre',
  'code',
  'kbd',
  'samp',
]);

// The core writes these bare, except a cell's colspan/rowspan. Matching on the
// tag name alone would let a page's own text through as live markup: a literal
// `<table style="position:fixed;inset:0">` becomes a real overlay, since `style`
// survives DOMPurify.
const ALLOWED_HTML_ATTRS = /^(?:\s+(?:colspan|rowspan)="\d{1,5}")*$/;

export function escapeHtmlTagsInMarkdown(md: string): string {
  const parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code span or fence — leave untouched
      return part.replace(/<(\/?)(([a-zA-Z][a-zA-Z0-9]*))([^>]*)>/g, (match, slash, tagName, _tn, attrs) => {
        if (ALLOWED_HTML_TAGS.has(String(tagName).toLowerCase()) && ALLOWED_HTML_ATTRS.test(attrs)) {
          return match;
        }
        return `&lt;${slash}${tagName}${attrs}&gt;`;
      });
    })
    .join('');
}
