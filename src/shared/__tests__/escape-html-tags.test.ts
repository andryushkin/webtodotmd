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

  // An allowed tag name is not enough: a page can write these as literal text,
  // and `style` survives DOMPurify — a fixed-position table becomes an overlay
  // over the panel.
  test.each([
    ['style', '<table style="position:fixed;inset:0">'],
    ['class', '<table class="c">'],
    ['event handler', '<td onclick="steal()">'],
    ['unparseable span', '<td colspan="abc">'],
    ['extra attribute next to a span', '<td colspan="2" title="t">'],
  ])('escapes an allowed tag carrying %s', (_name, tag) => {
    expect(escapeHtmlTagsInMarkdown(tag)).toBe(tag.replace('<', '&lt;').replace(/>$/, '&gt;'));
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
