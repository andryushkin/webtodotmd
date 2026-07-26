import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { sanitize } from '../src/core/sanitizer.js';

function makeDoc(html: string): Document {
  return parseHTML(`<html><body>${html}</body></html>`).document as unknown as Document;
}

function bodyText(doc: Document): string {
  return (doc.body as Element).textContent ?? '';
}

function bodyHTML(doc: Document): string {
  return (doc.body as Element).innerHTML;
}

beforeAll(() => {
  // setDOMAdapter не нужен — sanitize работает с готовым DOM
});

describe('sanitizer', () => {
  it('removes script tags', () => {
    const doc = makeDoc('<script>alert(1)</script><p>text</p>');
    sanitize(doc.body as Element);
    expect(bodyHTML(doc)).not.toContain('script');
    expect(bodyText(doc)).toContain('text');
  });

  it('removes hidden elements (hidden attribute)', () => {
    const doc = makeDoc('<p hidden>скрытый</p><p>видимый</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('скрытый');
    expect(bodyText(doc)).toContain('видимый');
  });

  it('removes aria-hidden elements', () => {
    const doc = makeDoc('<p aria-hidden="true">hidden</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('hidden');
    expect(bodyText(doc)).toContain('visible');
  });

  it('removes display:none elements', () => {
    const doc = makeDoc('<p style="display:none">hidden</p><p>visible</p>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).not.toContain('hidden');
    expect(bodyText(doc)).toContain('visible');
  });

  it('removes empty div wrappers', () => {
    const doc = makeDoc('<div></div><p>текст</p>');
    sanitize(doc.body as Element);
    expect(bodyHTML(doc)).not.toContain('<div>');
    expect(bodyText(doc)).toContain('текст');
  });

  it('removes nav in full mode', () => {
    const doc = makeDoc('<nav>меню</nav><p>контент</p>');
    sanitize(doc.body as Element, 'full');
    expect(bodyHTML(doc)).not.toContain('nav');
    expect(bodyText(doc)).toContain('контент');
  });

  it('keeps nav in selection mode', () => {
    const doc = makeDoc('<nav>меню</nav><p>контент</p>');
    sanitize(doc.body as Element, 'selection');
    expect(bodyHTML(doc)).toContain('nav');
  });

  it('does NOT collapse whitespace inside pre/code', () => {
    const doc = makeDoc('<pre><code>  spaces  \n  preserved  </code></pre>');
    sanitize(doc.body as Element);
    expect(bodyText(doc)).toContain('  spaces  ');
  });
});
