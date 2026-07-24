import { describe, test, expect } from 'bun:test';
import { decodeEntities, normalizePageTitle } from '../page-title';

describe('decodeEntities', () => {
  test('decodes named entities', () => {
    expect(decodeEntities('a&amp;b')).toBe('a&b');
    expect(decodeEntities('&laquo;Title&raquo;')).toBe('«Title»');
    expect(decodeEntities('10&nbsp;лет')).toBe('10 лет');
  });

  test('decodes numeric and hex references', () => {
    expect(decodeEntities('&#160;')).toBe('\u00a0');  // whitespace folding happens in normalizePageTitle
    expect(decodeEntities('&#x2014;')).toBe('—');
    expect(decodeEntities('&#8230;')).toBe('…');
  });

  test('leaves unknown names untouched', () => {
    expect(decodeEntities('AT&T')).toBe('AT&T');
    expect(decodeEntities('R&D budget')).toBe('R&D budget');
    expect(decodeEntities('Tom & Jerry')).toBe('Tom & Jerry');
  });

  test('decodes one level only', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('&amp;nbsp;')).toBe('&nbsp;');
  });

  test('keeps out-of-range and surrogate references as text', () => {
    expect(decodeEntities('&#0;')).toBe('&#0;');
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;');
  });
});

describe('normalizePageTitle', () => {
  // gazeta.ru: <meta name="twitter:title" content="10&amp;nbsp;самых…">
  test('resolves the double-encoded nbsp a site left in its metadata', () => {
    expect(normalizePageTitle('10&nbsp;самых красивых мужчин советского кинематографа'))
      .toBe('10 самых красивых мужчин советского кинематографа');
  });

  test('folds no-break spaces into plain ones', () => {
    expect(normalizePageTitle('10\u00a0самых')).toBe('10 самых');
    expect(normalizePageTitle('a\u202fb\ufeffc')).toBe('a b c');
  });

  test('collapses newlines, tabs and repeated spaces', () => {
    expect(normalizePageTitle('\n  Секс-символы СССР \n- Газета.Ru\n')).toBe('Секс-символы СССР - Газета.Ru');
    expect(normalizePageTitle('a b\tc')).toBe('a b c');
  });

  test('truncates to 200 chars with an ellipsis', () => {
    const long = normalizePageTitle('x'.repeat(250));
    expect(long.length).toBe(200);
    expect(long.endsWith('…')).toBe(true);
  });

  test('keeps a title that is exactly at the limit', () => {
    expect(normalizePageTitle('y'.repeat(200))).toBe('y'.repeat(200));
  });

  test('handles an empty title', () => {
    expect(normalizePageTitle('')).toBe('');
  });
});
