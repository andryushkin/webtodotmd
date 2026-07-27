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
//
// "Stays text" is two claims, and this file used to make only one of them. Every
// case asks `liveMarkup` whether anything in the output can act — and empty output
// can not, so a converter that dropped the payload passed as cleanly as one that
// escaped it. Each case now also states the text the reader must be left with.
import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { installDOMAdapter, render, visibleText } from './oracle';
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

// The other half of the guarantee, and the half that was missing for as long as
// this file existed. `liveMarkup` asks only whether anything in the output can
// act — and output with nothing in it satisfies that perfectly. Dropping the
// `</div>`, dropping a comment, dropping the payload entirely: every one of those
// passed, and every one of them is the converter failing to keep what the page
// showed. Escaping that works by deletion is not escaping.
//
// So each case below also says what the reader must be left with, and the two
// assertions together are the promise this file is named for: the characters are
// still there, and they are still only characters.
const SHOWN_TEXT = PAYLOAD;

describe('markup shown as text never becomes markup again', () => {
  it.each([
    // input,                                          what the reader is left with
    ['paragraph', `<p>${SHOWN}</p>`, SHOWN_TEXT],
    ['heading', `<h2>${SHOWN}</h2>`, SHOWN_TEXT],
    ['list item', `<ul><li>${SHOWN}</li></ul>`, SHOWN_TEXT],
    ['blockquote', `<blockquote>${SHOWN}</blockquote>`, SHOWN_TEXT],
    // Repaired: a term and its definition are separate blocks now, as the page
    // showed them. `dt`/`dd` were already in the parser's BLOCK_PARENTS, so the
    // escaper had assumed this while nothing downstream made it true.
    ['definition list', `<dl><dt>${SHOWN}</dt><dd>${SHOWN}</dd></dl>`, `${SHOWN_TEXT} ${SHOWN_TEXT}`],
    ['figcaption', `<figure><figcaption>${SHOWN}</figcaption></figure>`, SHOWN_TEXT],
    // A heading the markup states with a role rather than a tag: same emitter,
    // and the same line-opening `#` the page's own text must not join onto.
    ['aria heading', `<div role="heading" aria-level="3">${SHOWN}</div>`, SHOWN_TEXT],
    // The same tag inside a `<pre>`, which is a different emitter: there it is
    // the block's caption bar, and the code rule — which ignores its children,
    // so nothing else has escaped anything — writes it above the fence itself.
    [
      'caption bar of a code block',
      `<pre><figure><figcaption>${SHOWN}</figcaption><code>x = 1</code></figure></pre>`,
      `${SHOWN_TEXT} x = 1`,
    ],
    // Two rules that write characters of their own around the page's text. The
    // marks and the parentheses are this converter's, the text between them is
    // the page's and goes through the escaper like any other — but a rule that
    // wraps text is exactly where a wrapper could be mistaken for a delimiter,
    // so both spellings are pinned here rather than assumed.
    ['quotation marks', `<p><q>${SHOWN}</q></p>`, `“${SHOWN_TEXT}”`],
    // Wikipedia's wrapper is the fourth element whose rule writes a formula out
    // of a subtree the sanitizer no longer removes. Its LaTeX reaches the file
    // between dollar signs, which is not inert — an annotation is page text like
    // any other, and this is the payload arriving where a formula is expected.
    [
      'wikipedia maths wrapper',
      `<p><span class="mwe-math-element"><math alttext="${SHOWN}"><annotation encoding="application/x-tex">${SHOWN}</annotation></math><img class="mwe-math-fallback-image-inline" src="${OWN_IMAGE}" alt="${SHOWN}"></span></p>`,
      `$${SHOWN_TEXT}$`,
    ],
    ['ruby reading', `<p><ruby>word<rt>${SHOWN}</rt></ruby></p>`, `word(${SHOWN_TEXT})`],
    // A style is the second way to be a block, and `convert()` writes such an
    // element between blank lines — so its text opens a line exactly as a `<div>`
    // does, and everything a line start makes dangerous is dangerous here. Only
    // the tag was asked, so a `<span style="display:block">` holding the page's
    // own `# heading` put a real H1 in the file. Both spellings are here because
    // both reach the converter: the page's own attribute and the computed style
    // the content script records beside it.
    ['span displayed as a block', `<p>x<span style="display:block">${SHOWN}</span>y</p>`, `x ${SHOWN_TEXT} y`],
    [
      'snapshot displayed as a block',
      `<p>x<span data-s2md-style="display:block">${SHOWN}</span>y</p>`,
      `x ${SHOWN_TEXT} y`,
    ],
    // The text *after* one, which the same blank lines leave at the start of a
    // line without the styled element being its parent at all.
    [
      'text after a block-displayed span',
      `<p>x<span style="display:block">a</span>${SHOWN}</p>`,
      `x a ${SHOWN_TEXT}`,
    ],
    // Table cells reach the output through their own path in tables.ts, which
    // once bypassed the HTML escaping entirely.
    [
      'pipe table cell',
      `<table><tbody><tr><td>${SHOWN}</td><td>b</td></tr></tbody></table>`,
      `${SHOWN_TEXT} b`,
    ],
    [
      'table caption',
      `<table><caption>${SHOWN}</caption><tbody><tr><td>a</td></tr></tbody></table>`,
      `${SHOWN_TEXT} a`,
    ],
    // A nested table with the default `complexTableFallback`, which flattens
    // rather than reaching for HTML. This row used to be labelled `html fallback
    // cell` while passing no such option, so the HTML fallback had no coverage at
    // all and this path had it twice under the wrong name. The real HTML mode is
    // the block below.
    [
      'nested table, flattened',
      `<table><tbody><tr><td>${SHOWN}</td></tr><tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody></table>`,
      `${SHOWN_TEXT} n`,
    ],
    // Literal contexts are never Markdown-escaped, so each needs its own reason
    // to be inert: a fence, a code span, or a wrapper that makes one.
    ['inline code', `<p><code>${SHOWN}</code></p>`, SHOWN_TEXT],
    ['kbd', `<p><kbd>${SHOWN}</kbd></p>`, SHOWN_TEXT],
    ['samp', `<p><samp>${SHOWN}</samp></p>`, SHOWN_TEXT],
    ['pre', `<pre>${SHOWN}</pre>`, SHOWN_TEXT],
    // Tags the core emits itself, wrapping page text.
    ['sub', `<p><sub>${SHOWN}</sub></p>`, SHOWN_TEXT],
    ['sup', `<p><sup>${SHOWN}</sup></p>`, SHOWN_TEXT],
    // Attribute values reach the file through the converter's own syntax. The
    // payload was never text on the page here, so what the reader is left with is
    // the label around it — an `alt` shows nothing, a link shows its own words.
    // A converter that dropped the whole construct would satisfy `liveMarkup` and
    // fails this instead. What became of the value itself is the `attribute
    // values` block at the end of this file.
    ['link text', `<p><a href="https://e.com">${SHOWN}</a></p>`, SHOWN_TEXT],
    ['image alt', `<p><img src="${OWN_IMAGE}" alt="${SHOWN}"></p>`, ''],
    ['image title', `<p><img src="${OWN_IMAGE}" alt="a" title="${SHOWN}"></p>`, ''],
    ['href value', `<p><a href="https://e.com/?a=${escapeHtml('"><img src=x>')}">t</a></p>`, 't'],
    // LaTeX is re-emitted verbatim between dollar signs — the delimiters are the
    // converter's, and the page did not show them. Deliberate: a formula is not
    // judged by the characters it displayed, which is why the fidelity oracle
    // leaves math alone too.
    [
      'katex',
      `<p><span class="katex"><annotation encoding="application/x-tex">${SHOWN}</annotation></span></p>`,
      `$${SHOWN_TEXT}$`,
    ],
    ['mathjax v2', `<p><script type="math/tex">${SHOWN}</script></p>`, `$${SHOWN_TEXT}$`],
  ])('%s', (_name, html, shown) => {
    const rendered = render(toMarkdown(html, { ...CONVERSION_OPTIONS }));
    expect(liveMarkup(rendered)).toEqual([]);
    expect(visibleText(rendered)).toBe(shown);
  });
});

// A style is the second way to be a block, and the one no tag gives away.
// `convert()` writes such an element between blank lines, so its text opens a
// line exactly as a `<div>`'s does — and everything that is only markup at the
// start of a line becomes markup there. Only the tag was being asked, so a
// `<span style="display:block">` holding the page's own `# heading` produced a
// real H1, `- item` a list, and `---` a rule that took the whole line with it.
//
// `liveMarkup` cannot see any of that: a heading executes nothing. What it costs
// is the characters, which is the other half of this file's promise and the half
// that catches it. Both spellings are here because both reach the converter — the
// page's own attribute, and the computed style the content script records beside
// it — and the pair is the standing proof they are read as one.
describe('a style that opens a line', () => {
  const inside = (style: string, text: string) =>
    `<p>x<span ${style}="display:block">${text}</span>y</p>`;
  const after = (style: string, text: string) =>
    `<p>x<span ${style}="display:block">a</span>${text}</p>`;

  it.each([
    ['heading marker', '# heading'],
    ['bullet', '- item'],
    ['numbering', '1. one'],
    ['quote', '&gt; quoted'],
    // The one that costs the line rather than a marker: a thematic break has no
    // text of its own, so the reader's `---` simply left the page.
    ['thematic break', '---'],
    ['setext underline', '==='],
  ])('%s', (_name, text) => {
    const shown = visibleText(`<p>${text}</p>`);
    for (const style of ['style', 'data-s2md-style']) {
      const within = render(toMarkdown(inside(style, text), { ...CONVERSION_OPTIONS }));
      expect(visibleText(within)).toBe(`x ${shown} y`);
      expect(liveMarkup(within)).toEqual([]);
      // The text after one is at the start of a line too, without the styled
      // element being its parent at all.
      const behind = render(toMarkdown(after(style, text), { ...CONVERSION_OPTIONS }));
      expect(visibleText(behind)).toBe(`x a ${shown}`);
    }
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

// The one path that reached the file from cell.textContent, with no rule
// between it and the reader. The extension never selects this mode, but the
// library ships it, and "the page's markup stays text" is not a promise the
// library gets to keep only in its default configuration.
describe('text fallback mode', () => {
  const TEXT_MODE = { ...CONVERSION_OPTIONS, complexTableFallback: 'text' as const };

  it.each([
    // colspan is what sends the table down the fallback in the first place.
    ['merged cell', `<table><tbody><tr><td colspan="2">${SHOWN}</td><td>b</td></tr></tbody></table>`],
    ['caption', `<table><caption>${SHOWN}</caption><tbody><tr><td colspan="2">a</td></tr></tbody></table>`],
    // Literal contexts lose their code span in this mode, so the text lands in
    // prose and has to be escaped rather than fenced.
    ['pre in a cell', `<table><tbody><tr><td colspan="2"><pre>${SHOWN}</pre></td></tr></tbody></table>`],
    ['code in a cell', `<table><tbody><tr><td colspan="2"><code>${SHOWN}</code></td></tr></tbody></table>`],
    [
      'nested table',
      `<table><tbody><tr><td colspan="2"><table><tbody><tr><td>${SHOWN}</td></tr></tbody></table></td></tr></tbody></table>`,
    ],
    [
      'katex',
      `<table><tbody><tr><td colspan="2"><span class="katex">` +
        `<annotation encoding="application/x-tex">${SHOWN}</annotation></span></td></tr></tbody></table>`,
    ],
  ])('%s', (_name, html) => {
    expect(liveMarkup(render(toMarkdown(html, TEXT_MODE)))).toEqual([]);
  });
});

// The mode that emits real HTML, which the table at the top of this file claimed
// to cover for as long as it existed and never did: the row was labelled `html
// fallback cell` and passed no `complexTableFallback` at all, so it measured the
// default flatten twice and this mode not once.
//
// It is the one output context where Markdown is not parsed, so nothing here is
// protected by escaping the way prose is — a cell's contents are written as tags,
// and the escaping is the other one, the HTML one. That inversion is exactly why
// running it by accident under the wrong name was worth nothing.
describe('html fallback mode', () => {
  const HTML_MODE = { ...CONVERSION_OPTIONS, complexTableFallback: 'html' as const };
  // A nested table is what forces the fallback; the payload rides beside it.
  const nested = '<table><tbody><tr><td>n</td></tr></tbody></table>';
  const forced = (inner: string) =>
    `<table><tbody><tr><td>${inner}</td></tr><tr><td>${nested}</td></tr></tbody></table>`;

  it.each([
    // input,                                  what the reader is left with
    ['cell text', forced(SHOWN), `${SHOWN_TEXT} n`],
    [
      'caption',
      `<table><caption>${SHOWN}</caption><tbody><tr><td>a</td></tr><tr><td>${nested}</td></tr></tbody></table>`,
      `${SHOWN_TEXT} a n`,
    ],
    // Literal contexts inside an HTML cell: a fence cannot open there, so each
    // one has to be inert as a tag instead.
    ['pre in a cell', forced(`<pre>${SHOWN}</pre>`), `${SHOWN_TEXT} n`],
    ['code in a cell', forced(`<code>${SHOWN}</code>`), `${SHOWN_TEXT} n`],
    ['kbd in a cell', forced(`<kbd>${SHOWN}</kbd>`), `${SHOWN_TEXT} n`],
    // Emphasis emits a tag here rather than `**`, which would show as asterisks.
    ['emphasis in a cell', forced(`<b>${SHOWN}</b>`), `${SHOWN_TEXT} n`],
    ['link text', forced(`<a href="https://e.com">${SHOWN}</a>`), `${SHOWN_TEXT} n`],
    // A link's scheme is checked before it becomes an `href` attribute.
    ['link scheme', forced('<a href="javascript:alert(1)">t</a>'), 't n'],
    // An image emits its alt as text here: letting `src` past the preview's
    // allow-list would widen it for a case that rendered nothing anyway. So the
    // alt becomes prose the page never showed — deliberate, and truncated at the
    // first character that could end the cell.
    [
      'image alt',
      forced(`<img src="${OWN_IMAGE}" alt="${SHOWN}">`),
      '<img src=x onerror=alert(1)><div style= n',
    ],
    [
      'katex',
      forced(
        `<span class="katex"><annotation encoding="application/x-tex">${SHOWN}</annotation></span>`,
      ),
      `$${SHOWN_TEXT}$ n`,
    ],
  ])('%s', (_name, html, shown) => {
    const rendered = render(toMarkdown(html, HTML_MODE));
    expect(liveMarkup(rendered)).toEqual([]);
    expect(visibleText(rendered)).toBe(shown);
  });
});

// The cases above put the payload in the page's text. These put it in an
// attribute — `href`, `src`, `alt`, `title`, `data-lang` — which reaches the file
// inside the converter's own syntax, `[text](href)` and `![alt](src 'title')` and
// the info string after a fence. A value that ends its construct from inside
// leaves everything after it in the document as markup, and an attribute never
// went near the text escaper, so nothing was stopping it.
describe('attribute values', () => {
  // The payload spelled for an attribute: the `style="…"` above carries double
  // quotes, which would close the attribute in the fixture and never reach the
  // converter at all. Unquoted, it still positions an overlay.
  const IN_ATTR = escapeHtml(`${PAYLOAD.split('<div')[0]}<div style=position:fixed>X</div>`);

  it.each([
    ['href newline', `<p><a href="https://e.com/x&#10;&#10;${IN_ATTR}">link</a> tail</p>`],
    ['href javascript', '<p><a href="javascript:alert(1)">click</a></p>'],
    ['href unbalanced paren', `<p><a href="https://e.com/a)b ${IN_ATTR}">link</a></p>`],
    ['href backtick', `<p><a href="https://e.com/a\`b\` ${IN_ATTR}">link</a></p>`],
    ['alt bracket', `<p><img src="${OWN_IMAGE}" alt="a](x) ${IN_ATTR}"></p>`],
    ['alt backtick', `<p><img src="${OWN_IMAGE}" alt="a\`b](x) ${IN_ATTR}"></p>`],
    ['title quote', `<p><img src="${OWN_IMAGE}" alt="a" title="Bob's ${IN_ATTR}"></p>`],
    // With no URL the alt is not a label any more, it is prose.
    ['alt without src', `<p><img alt="${IN_ATTR}"></p>`],
    ['code fence info string', `<pre><code data-lang="js&#10;\`\`\`&#10;${IN_ATTR}">safe</code></pre>`],
  ])('%s', (_name, html) => {
    expect(liveMarkup(render(toMarkdown(html, { ...CONVERSION_OPTIONS })))).toEqual([]);
  });

  it('src', () => {
    // `liveMarkup` recognises the converter's own image by its exact URL, and a
    // broken `src` is the whole point here — so this one counts elements instead:
    // one image, the one that was asked for, and nothing that escaped from it.
    const html = `<p><img src="https://e.com/a b.png?q=${IN_ATTR}" alt="a"></p>`;
    const rendered = render(toMarkdown(html, { ...CONVERSION_OPTIONS }));
    const doc = parseHTML(`<html><body>${rendered}</body></html>`).document;
    expect(doc.querySelectorAll('img').length).toBe(1);
    expect(doc.querySelector('img')!.getAttribute('onerror')).toBe(null);
    expect(doc.querySelectorAll('[style]').length).toBe(0);
  });
});
