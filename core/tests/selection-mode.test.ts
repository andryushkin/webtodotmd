import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';
import { toMarkdown as toMarkdownBrowser } from '../src/browser.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

function domAdapter(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

// Wrapped in <body> so the sanitizer walks one root: linkedom hands a multi-root
// fragment string back in a shape the traversal reads differently, which has
// nothing to do with what is being tested here.
const page = (inner: string): string => `<body>${inner}</body>`;

const FURNITURE: Array<[string, string, string]> = [
  ['nav', '<nav><a href="/a">Home</a></nav>', 'Home'],
  ['header', '<header><p>Masthead</p></header>', 'Masthead'],
  ['footer', '<footer><p>Copyright</p></footer>', 'Copyright'],
  ['aside', '<aside><p>Sidebar note</p></aside>', 'Sidebar note'],
];

describe('selection mode: structural tags follow who asked for them', () => {
  for (const [tag, html, text] of FURNITURE) {
    it(`drops <${tag}> by default — a page brings its own furniture`, () => {
      expect(toMarkdown(page(html))).not.toContain(text);
    });

    it(`keeps <${tag}> in selection mode — a person pointed at it`, () => {
      expect(toMarkdown(page(html), { mode: 'selection' })).toContain(text);
    });
  }

  it('keeps furniture a selection merely crossed, along with the prose', () => {
    const html = page('<p>Above</p><aside><p>Pull quote</p></aside><p>Below</p>');
    const md = toMarkdown(html, { mode: 'selection' });
    expect(md).toContain('Above');
    expect(md).toContain('Pull quote');
    expect(md).toContain('Below');
  });

  it("an explicit 'full' is the same as saying nothing", () => {
    const html = page('<nav><a href="/a">Home</a></nav><p>Body</p>');
    expect(toMarkdown(html, { mode: 'full' })).toBe(toMarkdown(html));
  });

  it('the browser build reads the option too', () => {
    const html = page('<nav><a href="/a">Home</a></nav><p>Body</p>');
    expect(toMarkdownBrowser(html, { domAdapter })).not.toContain('Home');
    expect(toMarkdownBrowser(html, { domAdapter, mode: 'selection' })).toContain('Home');
  });
});
