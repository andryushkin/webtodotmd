import { describe, test, expect } from 'bun:test';
import { parseHTML } from 'linkedom';
import { BLOCK_TAGS, findHighlightTarget } from '../highlight-target';

function makeDoc(html: string) {
  return parseHTML(`<html><body>${html}</body></html>`).document;
}

describe('BLOCK_TAGS', () => {
  test('contains UL and OL', () => {
    expect(BLOCK_TAGS.has('UL')).toBe(true);
    expect(BLOCK_TAGS.has('OL')).toBe(true);
  });

  test('contains standard block elements', () => {
    for (const tag of ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'FIGURE', 'SECTION', 'ARTICLE', 'DETAILS']) {
      expect(BLOCK_TAGS.has(tag)).toBe(true);
    }
  });
});

describe('findHighlightTarget', () => {
  test('click on <p> returns <p>', () => {
    const doc = makeDoc('<p id="p">text</p>');
    const p = doc.getElementById('p')!;
    expect(findHighlightTarget(p as unknown as Element)).toBe(p);
  });

  test('click on <span> inside <p> returns <p>', () => {
    const doc = makeDoc('<p id="p"><span id="sp">text</span></p>');
    const span = doc.getElementById('sp')!;
    const p = doc.getElementById('p')!;
    expect(findHighlightTarget(span as unknown as Element)).toBe(p);
  });

  test('click on <li> returns <li>', () => {
    const doc = makeDoc('<ul><li id="li">item</li></ul>');
    const li = doc.getElementById('li')!;
    expect(findHighlightTarget(li as unknown as Element)).toBe(li);
  });

  test('click on <a> inside <li> returns <li>', () => {
    const doc = makeDoc('<ul><li id="li"><a id="a" href="#">link</a></li></ul>');
    const a = doc.getElementById('a')!;
    const li = doc.getElementById('li')!;
    expect(findHighlightTarget(a as unknown as Element)).toBe(li);
  });

  test('click on <ul> returns <ul> (was broken before UL added to BLOCK_TAGS)', () => {
    const doc = makeDoc('<section><ul id="ul"><li>item</li></ul></section>');
    const ul = doc.getElementById('ul')!;
    expect(findHighlightTarget(ul as unknown as Element)).toBe(ul);
  });

  test('click on <ol> returns <ol>', () => {
    const doc = makeDoc('<section><ol id="ol"><li>item</li></ol></section>');
    const ol = doc.getElementById('ol')!;
    expect(findHighlightTarget(ol as unknown as Element)).toBe(ol);
  });

  test('click on <strong> inside <p> inside <blockquote> returns <p>', () => {
    const doc = makeDoc('<blockquote id="bq"><p id="p"><strong id="s">bold</strong></p></blockquote>');
    const strong = doc.getElementById('s')!;
    const p = doc.getElementById('p')!;
    expect(findHighlightTarget(strong as unknown as Element)).toBe(p);
  });

  test('click on <strong> directly inside <blockquote> returns <blockquote>', () => {
    const doc = makeDoc('<blockquote id="bq"><strong id="s">bold</strong></blockquote>');
    const strong = doc.getElementById('s')!;
    const bq = doc.getElementById('bq')!;
    expect(findHighlightTarget(strong as unknown as Element)).toBe(bq);
  });

  test('click on element with no block ancestor returns the element itself', () => {
    const doc = makeDoc('<span id="sp">text</span>');
    const span = doc.getElementById('sp')!;
    expect(findHighlightTarget(span as unknown as Element)).toBe(span);
  });
});
