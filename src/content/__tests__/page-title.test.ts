import { describe, test, expect } from 'bun:test';
import { decodeEntities, normalizePageTitle } from '../page-title';

describe('decodeEntities', () => {
  test('decodes the standard named entities, case-sensitively', () => {
    expect(decodeEntities('Caf&eacute;')).toBe('Café');
    expect(decodeEntities('&Eacute;cole')).toBe('École');
    expect(decodeEntities('Sch&ouml;ne Gr&uuml;&szlig;e')).toBe('Schöne Grüße');
    expect(decodeEntities('&aacute;&ntilde;&ccedil;&oslash;')).toBe('áñçø');
    expect(decodeEntities('&laquo;Title&raquo; &mdash; 2026')).toBe('«Title» — 2026');
    expect(decodeEntities('&alpha;&beta; &micro;m &frac12; &euro;')).toBe('αβ \u00b5m ½ €');
    expect(decodeEntities('a&amp;b')).toBe('a&b');
  });

  test('decodes entities to their character, leaving whitespace folding to normalizePageTitle', () => {
    expect(decodeEntities('10&nbsp;лет')).toBe('10\u00a0лет');
    expect(decodeEntities('&#160;')).toBe('\u00a0');
  });

  test('decodes numeric and hex references', () => {
    expect(decodeEntities('&#x2014;')).toBe('—');
    expect(decodeEntities('&#8230;')).toBe('…');
    expect(decodeEntities('&#x1F600;')).toBe('😀');
  });

  test('remaps Windows-1252 numeric references the way HTML parsers do', () => {
    expect(decodeEntities('Don&#146;t')).toBe('Don’t');
    expect(decodeEntities('&#147;quoted&#148;')).toBe('“quoted”');
    expect(decodeEntities('a&#151;b')).toBe('a—b');
  });

  test('leaves unknown names untouched', () => {
    expect(decodeEntities('AT&T')).toBe('AT&T');
    expect(decodeEntities('R&D budget')).toBe('R&D budget');
    expect(decodeEntities('Tom & Jerry')).toBe('Tom & Jerry');
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
    // outside the shipped blocks — documented limitation, must stay verbatim
    expect(decodeEntities('&boxDL;')).toBe('&boxDL;');
  });

  test('follows HTML on the missing semicolon: legacy names only', () => {
    expect(decodeEntities('10&nbsp самых')).toBe('10\u00a0 самых');
    expect(decodeEntities('Caf&eacute au lait')).toBe('Café au lait');
    // &hellip is not in HTML's semicolon-less list
    expect(decodeEntities('wait&hellip and see')).toBe('wait&hellip and see');
  });

  test('decodes one level only', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('&amp;nbsp;')).toBe('&nbsp;');
    expect(decodeEntities('&amp;eacute;')).toBe('&eacute;');
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
    expect(normalizePageTitle('a b\tc')).toBe('a b c');
  });

  test('truncates to 200 code units with an ellipsis', () => {
    const long = normalizePageTitle('x'.repeat(250));
    expect(long.length).toBe(200);
    expect(long.endsWith('…')).toBe(true);
  });

  test('never leaves a lone surrogate at the cut', () => {
    const cut = normalizePageTitle('x'.repeat(198) + '😀' + 'y');
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut).toBe('x'.repeat(198) + '…');
    expect([...cut].every(ch => {
      const cp = ch.codePointAt(0)!;
      return cp < 0xd800 || cp > 0xdfff;
    })).toBe(true);
  });

  test('keeps an emoji whole when it fits', () => {
    const cut = normalizePageTitle('x'.repeat(197) + '😀' + 'y'.repeat(10));
    expect(cut).toBe('x'.repeat(197) + '😀' + '…');
    expect(cut.length).toBe(200);
  });

  test('does not split a ZWJ sequence', () => {
    const family = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}'; // 8 code units
    const cut = normalizePageTitle('x'.repeat(195) + family + 'z'.repeat(10));
    expect(cut).toBe('x'.repeat(195) + '…');
    expect(cut.includes('\u200d')).toBe(false);
  });

  test('keeps a title that is exactly at the limit', () => {
    expect(normalizePageTitle('y'.repeat(200))).toBe('y'.repeat(200));
  });

  test('handles an empty title', () => {
    expect(normalizePageTitle('')).toBe('');
  });
});
