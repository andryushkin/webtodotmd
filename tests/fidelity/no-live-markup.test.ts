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

function liveMarkup(html: string): string[] {
  const doc = parseHTML(`<html><body>${html}</body></html>`).document;
  return [...doc.querySelectorAll('script, [onerror], [onclick], [style], img')]
    .filter((el) => el.nodeName !== 'IMG' || el.getAttribute('src') !== OWN_IMAGE)
    .map((el) => el.nodeName);
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
      `<table><tbody><tr><td colspan="2">${SHOWN}</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>`,
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
