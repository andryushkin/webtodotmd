import { describe, test, expect } from 'bun:test';
import { escapeHtmlTagsInMarkdown } from '../escape-html-tags';

describe('escapeHtmlTagsInMarkdown', () => {
  test('keeps the inline tags the core emits', () => {
    const md = 'x<sub>1</sub><sup>2</sup><br>y';
    expect(escapeHtmlTagsInMarkdown(md)).toBe(md);
  });

  test('keeps the HTML table fallback intact, spans included', () => {
    const md = '<table>\n<tr><td colspan="2" rowspan="0"><pre>code</pre></td></tr>\n</table>';
    expect(escapeHtmlTagsInMarkdown(md)).toBe(md);
  });

  // A page written about HTML has bare <table> and <pre> in its prose, which is
  // exactly what the core's own fallback looks like tag by tag. Only a complete
  // block in the core's shape renders; a mention stays text.
  test.each([
    ['bare tag names in prose', 'The <table> element and <pre> too'],
    ['a lone row', '<tr><td>x</td></tr>'],
    ['an unclosed table', '<table>\n<tr><td>x</td></tr>'],
    ['a table with a style attribute', '<table>\n<tr><td style="position:fixed">x</td></tr>\n</table>'],
    ['a table with an event handler', '<table>\n<tr><td onclick="steal()">x</td></tr>\n</table>'],
    ['a table holding a foreign tag', '<table>\n<tr><td><div>x</div></td></tr>\n</table>'],
  ])('escapes %s', (_name, md) => {
    expect(escapeHtmlTagsInMarkdown(md)).not.toContain('<table>');
    expect(escapeHtmlTagsInMarkdown(md)).toContain('&lt;');
  });

  test('escapes tags the core never emits', () => {
    expect(escapeHtmlTagsInMarkdown('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtmlTagsInMarkdown('<div>x</div>')).toBe('&lt;div&gt;x&lt;/div&gt;');
  });

  test('leaves code spans and fences untouched', () => {
    expect(escapeHtmlTagsInMarkdown('`<div>`')).toBe('`<div>`');
    expect(escapeHtmlTagsInMarkdown('```\n<div>\n```')).toBe('```\n<div>\n```');
  });
});
