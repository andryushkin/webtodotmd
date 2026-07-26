import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('footnotes', () => {
  it('footnote-ref: <sup><a href="#fn1"> → [^1]', () => {
    const html = '<p>Факт<sup><a href="#fn1">[1]</a></sup> в тексте.</p>';
    const result = toMarkdown(html, { footnotes: true });
    expect(result).toContain('[^1]');
  });

  it('footnote block: li[id=fn1] → [^1]: content', () => {
    const html = `
      <div class="footnotes">
        <ol>
          <li id="fn1"><p>Источник информации.</p></li>
        </ol>
      </div>
    `;
    const result = toMarkdown(html, { footnotes: true });
    expect(result).toContain('[^1]: Источник информации.');
  });

  it('inline + block together (full example)', () => {
    const html = `
      <p>Факт<sup><a href="#fn1">[1]</a></sup> в тексте.</p>
      <div class="footnotes">
        <ol>
          <li id="fn1"><p>Источник информации.</p></li>
        </ol>
      </div>
    `;
    const result = toMarkdown(html, { footnotes: true });
    expect(result).toContain('Факт[^1] в тексте.');
    expect(result).toContain('[^1]: Источник информации.');
  });

  it('footnotes: false (default) — no [^ in output', () => {
    const html = `
      <p>Факт<sup><a href="#fn1">[1]</a></sup> в тексте.</p>
      <div class="footnotes">
        <ol>
          <li id="fn1"><p>Источник информации.</p></li>
        </ol>
      </div>
    `;
    const result = toMarkdown(html);
    expect(result).not.toContain('[^');
  });

  it('multiple footnotes — [^1] and [^2] both present', () => {
    const html = `
      <p>First<sup><a href="#fn1">[1]</a></sup> and second<sup><a href="#fn2">[2]</a></sup>.</p>
      <div class="footnotes">
        <ol>
          <li id="fn1"><p>First source.</p></li>
          <li id="fn2"><p>Second source.</p></li>
        </ol>
      </div>
    `;
    const result = toMarkdown(html, { footnotes: true });
    expect(result).toContain('[^1]');
    expect(result).toContain('[^2]');
    expect(result).toContain('[^1]: First source.');
    expect(result).toContain('[^2]: Second source.');
  });

  it('back-link ↩ removed from definition', () => {
    const html = `
      <div class="footnotes">
        <ol>
          <li id="fn1"><p>Источник. <a href="#ref1">↩</a></p></li>
        </ol>
      </div>
    `;
    const result = toMarkdown(html, { footnotes: true });
    expect(result).not.toContain('↩');
    expect(result).toContain('[^1]: Источник.');
  });

  it('section[role=doc-endnotes] treated as footnotes block', () => {
    const html = `
      <p>Text<sup><a href="#fn1">[1]</a></sup>.</p>
      <section role="doc-endnotes">
        <ol>
          <li id="fn1"><p>Note content.</p></li>
        </ol>
      </section>
    `;
    const result = toMarkdown(html, { footnotes: true });
    expect(result).toContain('[^1]');
    expect(result).toContain('[^1]: Note content.');
    expect(result).not.toContain('doc-endnotes');
  });
});
