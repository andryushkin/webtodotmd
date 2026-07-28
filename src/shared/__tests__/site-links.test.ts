import { describe, test, expect } from 'bun:test';
import { siteLocale, siteUrl, REPO_URL, EXTENSION_PAGE_URL } from '../site-links';

describe('siteLocale', () => {
  test('a locale the site has is kept, in either spelling', () => {
    expect(siteLocale('de')).toBe('de');
    expect(siteLocale('pt-PT')).toBe('pt-PT');
    // The extension's own directory names use an underscore.
    expect(siteLocale('pt_PT')).toBe('pt-PT');
    expect(siteLocale('zh_TW')).toBe('zh-TW');
    expect(siteLocale('es_419')).toBe('es-419');
  });

  test('a region the site has no page for falls back to the language', () => {
    expect(siteLocale('en-GB')).toBe('en');
    expect(siteLocale('de-AT')).toBe('de');
    expect(siteLocale('fr-CA')).toBe('fr');
  });

  // The three the browser spells in more ways than the site has pages for.
  test('Portuguese, Chinese and Norwegian land on the page that exists', () => {
    expect(siteLocale('pt')).toBe('pt-BR');
    expect(siteLocale('pt-AO')).toBe('pt-BR');
    expect(siteLocale('zh')).toBe('zh-CN');
    expect(siteLocale('zh-HK')).toBe('zh-CN');
    expect(siteLocale('nb')).toBe('no');
    expect(siteLocale('nn-NO')).toBe('no');
  });

  // A 404 is worse than the wrong language: the reader arriving from an install
  // has no idea what happened.
  test('anything unknown is English rather than a 404', () => {
    expect(siteLocale('is')).toBe('en');
    expect(siteLocale('xx-YY')).toBe('en');
    expect(siteLocale('')).toBe('en');
  });
});

describe('siteUrl', () => {
  // The two pages the worker opens, and the only two the old site localizes:
  // `/welcome` and `/changelog` answer 200 in all 52, `/<locale>/` answers 404.
  test('the localized pages the worker opens', () => {
    expect(siteUrl('welcome', 'de')).toBe('https://2md.site/de/welcome');
    expect(siteUrl('changelog', 'zh_TW')).toBe('https://2md.site/zh-TW/changelog');
    expect(siteUrl('welcome', 'ru')).toBe('https://2md.site/ru/welcome');
  });
});

// Both were wrong once: the options page linked `2md.site/<locale>/`, a 404 in
// every language, and the product moved to a new domain. They are constants in one
// module so that a move is one edit, and asserted here so it is a deliberate one.
test('the outward links are the current ones', () => {
  expect(EXTENSION_PAGE_URL).toBe('https://dotmd.tools/html-to-md');
  expect(REPO_URL).toBe('https://github.com/andryushkin/webtodotmd');
});
