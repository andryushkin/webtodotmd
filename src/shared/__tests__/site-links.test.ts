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
  // The locale goes in front, and `html-to-md` after it: the site localizes the
  // extension's onboarding pages and nothing else, so the product's own page —
  // `dotmd.tools/html-to-md` — is the one address with no locale in it.
  test('the localized pages the worker opens', () => {
    expect(siteUrl('welcome', 'de')).toBe('https://dotmd.tools/de/html-to-md/welcome');
    expect(siteUrl('changelog', 'zh_TW')).toBe('https://dotmd.tools/zh-TW/html-to-md/changelog');
    expect(siteUrl('welcome', 'ru')).toBe('https://dotmd.tools/ru/html-to-md/welcome');
  });

  // Static assets have no fallback routing: a locale the site did not build is
  // a 404, not English. Every locale this function can return has to exist as a
  // directory in the site's build, which is what `locales.all` there lists.
  test('every locale it can return is one the site builds', () => {
    const built = new Set([
      'en', 'de', 'fr', 'es', 'it', 'nl', 'sv', 'da', 'no', 'fi',
      'ar', 'he', 'fa', 'id', 'ru', 'pt-PT', 'pt-BR', 'ja', 'fil', 'vi', 'tr', 'th', 'ko',
      'bg', 'cs', 'hr', 'pl', 'ro', 'sk', 'sl', 'sr', 'uk',
      'zh-CN', 'zh-TW', 'el', 'hu', 'hi', 'ms', 'es-419',
      'et', 'lt', 'lv', 'ca', 'bn', 'gu', 'kn', 'ml', 'mr', 'ta', 'te', 'am', 'sw',
    ]);
    const asked = ['en-GB', 'pt', 'pt-AO', 'zh', 'zh-HK', 'nb', 'nn-NO', 'is', 'xx-YY', '', 'es_419', 'pt_PT'];
    for (const lang of asked) expect(built.has(siteLocale(lang))).toBe(true);
  });
});

// Both were wrong once: the options page linked `2md.site/<locale>/`, a 404 in
// every language, and the product moved to a new domain. They are constants in one
// module so that a move is one edit, and asserted here so it is a deliberate one.
test('the outward links are the current ones', () => {
  expect(EXTENSION_PAGE_URL).toBe('https://dotmd.tools/html-to-md');
  expect(REPO_URL).toBe('https://github.com/andryushkin/webtodotmd');
});
