// Markup a page showed as text must never come back to life.
//
// This is the guarantee that used to be provided at the far end of the pipeline,
// by the side panel escaping tags in the finished Markdown. That escaper could
// only guess which tags were the core's own output and which were the page's, and
// it guessed by re-parsing the string — so it both missed cases and mangled the
// core's own markup. It is gone; the core escapes page text where the origin is
// still known, and this file is what says that is enough.
//
// A leak here is not a style regression. It means a captured page can put a
// working <img onerror>, <script> or positioned overlay into the file and into
// the preview, so any new path that emits text has to be added to the contexts
// below before it can be trusted.
import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { installDOMAdapter, render } from './oracle';
import { toMarkdown } from '../../core/src/server.js';
import { CONVERSION_OPTIONS } from '../../src/content/raw-mathml-rule';

beforeAll(() => {
  installDOMAdapter();
});

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// What a page would have to display as characters for this to matter — and what
// it looks like when it does not stay characters.
const PAYLOAD = '<img src=x onerror=alert(1)><div style="position:fixed;inset:0">X</div>';
const SHOWN = escapeHtml(PAYLOAD);
const OWN_IMAGE = 'https://e.com/a.png';

// Anything that executes, loads, positions or navigates. Naming only `onerror`
// and `onclick` would let `onload`, `onfocus`, an <iframe> or a
// `javascript:` href through — and this function is the definition of the
// guarantee, so a gap here is a gap in the guarantee.
const DANGEROUS = [
  'script', 'iframe', 'object', 'embed', 'form', 'svg', 'link', 'meta', 'base',
  'img', 'video', 'audio', 'source', 'input', 'button', 'style',
].join(',');

function liveMarkup(html: string): string[] {
  const doc = parseHTML(`<html><body>${html}</body></html>`).document;
  const found = new Set<string>();
  for (const el of doc.querySelectorAll('*')) {
    const name = el.nodeName.toLowerCase();
    // The converter's own ![alt](url) legitimately becomes an <img>.
    const isOwnImage = name === 'img' && el.getAttribute('src') === OWN_IMAGE;
    if (DANGEROUS.split(',').includes(name) && !isOwnImage) found.add(el.nodeName);
    for (const attr of Array.from(el.attributes)) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith('on') || attrName === 'style') found.add(`${el.nodeName}[${attrName}]`);
      if ((attrName === 'href' || attrName === 'src') && /^\s*javascript:/i.test(attr.value)) {
        found.add(`${el.nodeName}[${attrName}=javascript]`);
      }
    }
  }
  return [...found];
}

describe('markup shown as text never becomes markup again', () => {
  it.each([
    ['paragraph', `<p>${SHOWN}</p>`],
    ['heading', `<h2>${SHOWN}</h2>`],
    ['list item', `<ul><li>${SHOWN}</li></ul>`],
    ['blockquote', `<blockquote>${SHOWN}</blockquote>`],
    ['definition list', `<dl><dt>${SHOWN}</dt><dd>${SHOWN}</dd></dl>`],
    ['figcaption', `<figure><figcaption>${SHOWN}</figcaption></figure>`],
    // Table cells reach the output through their own path in tables.ts, which
    // once bypassed the HTML escaping entirely.
    ['pipe table cell', `<table><tbody><tr><td>${SHOWN}</td><td>b</td></tr></tbody></table>`],
    ['table caption', `<table><caption>${SHOWN}</caption><tbody><tr><td>a</td></tr></tbody></table>`],
    [
      'html fallback cell',
      `<table><tbody><tr><td>${SHOWN}</td></tr><tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody></table>`,
    ],
    // Literal contexts are never Markdown-escaped, so each needs its own reason
    // to be inert: a fence, a code span, or a wrapper that makes one.
    ['inline code', `<p><code>${SHOWN}</code></p>`],
    ['kbd', `<p><kbd>${SHOWN}</kbd></p>`],
    ['samp', `<p><samp>${SHOWN}</samp></p>`],
    ['pre', `<pre>${SHOWN}</pre>`],
    // Tags the core emits itself, wrapping page text.
    ['sub', `<p><sub>${SHOWN}</sub></p>`],
    ['sup', `<p><sup>${SHOWN}</sup></p>`],
    // Attribute values reach the file through the converter's own syntax.
    ['link text', `<p><a href="https://e.com">${SHOWN}</a></p>`],
    ['image alt', `<p><img src="${OWN_IMAGE}" alt="${SHOWN}"></p>`],
    ['image title', `<p><img src="${OWN_IMAGE}" alt="a" title="${SHOWN}"></p>`],
    ['href value', `<p><a href="https://e.com/?a=${escapeHtml('"><img src=x>')}">t</a></p>`],
    // LaTeX is re-emitted verbatim between dollar signs.
    [
      'katex',
      `<p><span class="katex"><annotation encoding="application/x-tex">${SHOWN}</annotation></span></p>`,
    ],
    ['mathjax v2', `<p><script type="math/tex">${SHOWN}</script></p>`],
  ])('%s', (_name, html) => {
    const md = toMarkdown(html, { ...CONVERSION_OPTIONS });
    expect(liveMarkup(render(md))).toEqual([]);
  });
});

// Escaping a formula costs the formula, so the rule that neutralizes tags in
// LaTeX has to leave ordinary mathematics alone.
describe('math escaping does not damage formulas', () => {
  it.each([
    ['a < b', true],
    ['x <y', true],
    ['a<b', true],
    ['x <= y', true],
    ['\\frac{a}{b} < c', true],
    ['x<!--oops', false],
    ['a </td> b', false],
  ])('%s', (latex, unchanged) => {
    const html = `<span class="katex"><annotation encoding="application/x-tex">${escapeHtml(
      latex,
    )}</annotation></span>`;
    expect(toMarkdown(html, { ...CONVERSION_OPTIONS }).includes(latex)).toBe(unchanged);
  });
});

// Cases a review found in the net itself. Each one is markup that reached the
// output alive through a path the table above did not name.
describe('paths the first version of this file missed', () => {
  it('escapes MathML the content script converts itself', () => {
    // The core's math rules got escapeMathTags; the extension's raw-MathML rule,
    // which runs at priority 1 in findRule(), did not.
    const html = `<p><math><mo>${escapeHtml(PAYLOAD)}</mo></math></p>`;
    expect(liveMarkup(render(toMarkdown(html, { ...CONVERSION_OPTIONS })))).toEqual([]);
  });

  it('escapes math with the library defaults, not just the extension options', () => {
    // With `math` falsy no math rule matches, so the text falls through to the
    // parser's literal handling — which used to hand it back untouched.
    const html = `<p><span class="katex"><annotation encoding="application/x-tex">${escapeHtml(
      PAYLOAD,
    )}</annotation></span></p>`;
    expect(liveMarkup(render(toMarkdown(html, {})))).toEqual([]);
  });

  it.each([
    ['samp', `<p><samp>a\n\n${escapeHtml(PAYLOAD)}</samp></p>`],
    ['kbd', `<p><kbd>a\n\n${escapeHtml(PAYLOAD)}</kbd></p>`],
    ['code', `<p><code>a\n\n${escapeHtml(PAYLOAD)}</code></p>`],
  ])('a blank line cannot break the code span that makes %s inert', (_name, html) => {
    // A code span cannot cross a blank line: it never closes, and everything
    // after it renders as markup.
    expect(liveMarkup(render(toMarkdown(html, { ...CONVERSION_OPTIONS })))).toEqual([]);
  });
});

// Escaping decides per text node, so a tag written across two of them was checked
// twice and caught neither time: `<` ends the first string with nothing after it
// to judge, and the second starts with a name that on its own is only a word.
// `normalize()` merges adjacent text nodes but cannot merge across an element, and
// an element between the two halves is exactly what syntax highlighting produces.
describe('split across nodes', () => {
  // Where a highlighter would put the token boundary: right after the bracket,
  // and inside the tag name.
  const split = (at: number): string => `<span>${SHOWN.slice(0, at)}</span>${SHOWN.slice(at)}`;

  it.each([
    ['at the bracket', `<p>${split(4)}</p>`],
    ['inside the tag name', `<p>${split(6)}</p>`],
    ['mid sentence', `<p>before ${split(4)} after</p>`],
    ['in a list item', `<li>${split(4)}</li>`],
    ['in a table cell', `<table><tbody><tr><td>${split(4)}</td><td>b</td></tr></tbody></table>`],
    // The converter writes its own text straight after the page's: `![` from an
    // image turns a dangling `<` into a comment opener.
    ['completed by the converter', `<p>a &lt;<img src="${OWN_IMAGE}" alt="t"> ${SHOWN}</p>`],
    // MathML splits by construction — `<mo>&lt;</mo>` is how a page writes the
    // less-than operator — and with no math rule claiming it the text nodes join.
    ['mathml operators', '<p><math><mi>a</mi><mo>&lt;</mo><mi>img</mi><mo>&gt;</mo></math></p>'],
  ])('%s', (_name, html) => {
    expect(liveMarkup(render(toMarkdown(html, { ...CONVERSION_OPTIONS })))).toEqual([]);
    expect(liveMarkup(render(toMarkdown(html, {})))).toEqual([]);
  });

  // A comment hides rather than executes, so `liveMarkup` cannot see it: what it
  // costs is the text, which the reader was shown and has to still be there.
  it('a comment opener does not swallow the sentence', () => {
    const html = '<p>before <span>&lt;</span>!-- note --&gt; after</p>';
    const rendered = render(toMarkdown(html, { ...CONVERSION_OPTIONS }));
    for (const word of ['before', 'note', 'after']) expect(rendered).toContain(word);
  });
});

// The code-span delimiter has to outrun the backticks inside it, or the span
// closes early and the rest of the cell is read as markup. Found in preInCell
// first; the inline-code rule had the same defect and had had it all along.
describe('a code span outruns the backticks inside it', () => {
  it.each([
    ['inline code', `<p><code>a \`\` b ${escapeHtml(PAYLOAD)}</code></p>`],
    ['kbd', `<p><kbd>a \`\` b ${escapeHtml(PAYLOAD)}</kbd></p>`],
    ['pre in a table cell', `<table><tr><td>h</td></tr><tr><td><pre>a \`\` b ${escapeHtml(PAYLOAD)}</pre></td></tr></table>`],
  ])('%s', (_name, html) => {
    expect(liveMarkup(render(toMarkdown(html, { ...CONVERSION_OPTIONS })))).toEqual([]);
  });
});
