/**
 * Where the extension points outside itself.
 *
 * One domain now: `dotmd.tools` carries the product's page and, since it grew
 * them, the localized install and update pages as well — `/<locale>/html-to-md/
 * welcome` and `/<locale>/html-to-md/changelog`, all 52 answering 200 (measured
 * 2026-07-29). Every published build up to 1.4.9 asks `2md.site` for those two,
 * so that site has to keep answering for as long as those installs exist; what
 * this module decides is only where the next build sends a reader.
 *
 * The site's pages are static assets, which have no fallback routing: a locale
 * missing from the build is a 404 rather than English, so `SITE_LOCALES` below
 * must stay a subset of `locales.all` in the site's `site.yaml`.
 *
 * The locale mapping is one module because two callers need it — the worker opens
 * those pages, and anything else linking the localized site would otherwise hold
 * a second copy that drifts, the only symptom being a reader sent to the wrong
 * language. The spelling is the site's, with hyphens, not the extension's
 * `_locales` directory names.
 */

export const REPO_URL = 'https://github.com/andryushkin/webtodotmd';

/**
 * The extension's own page. Not locale-prefixed: the marketing pages are
 * English-only, and only the two onboarding pages are localized — which is why
 * the locale goes in front of `html-to-md` there and nowhere near this one.
 */
export const EXTENSION_PAGE_URL = 'https://dotmd.tools/html-to-md';

const SITE_LOCALES = new Set([
  'en', 'de', 'fr', 'es', 'it', 'nl', 'sv', 'da', 'no', 'fi',
  'ar', 'he', 'fa', 'id', 'ru', 'pt-PT', 'pt-BR', 'ja', 'fil', 'vi', 'tr', 'th', 'ko',
  'bg', 'cs', 'hr', 'pl', 'ro', 'sk', 'sl', 'sr', 'uk',
  'zh-CN', 'zh-TW', 'el', 'hu', 'hi', 'ms', 'es-419',
  'et', 'lt', 'lv', 'ca', 'bn', 'gu', 'kn', 'ml', 'mr', 'ta', 'te', 'am', 'sw',
]);

/**
 * The site locale for a language tag, in either spelling.
 *
 * Takes a Chrome UI language (`pt-BR`, `en-GB`) or one of the extension's own
 * locale names (`pt_BR`), because the two callers have one each. Anything with no
 * page of its own falls back to the base language and then to English: a 404 is
 * worse than the wrong language, and the reader arriving from an install has no
 * idea what happened.
 */
export function siteLocale(lang: string): string {
  const dashed = lang.replace('_', '-');
  if (SITE_LOCALES.has(dashed)) return dashed;
  const base = dashed.split('-')[0].toLowerCase();
  // The three the browser spells in more ways than the site has pages for.
  if (base === 'pt') return dashed === 'pt-PT' ? 'pt-PT' : 'pt-BR';
  if (base === 'zh') return 'zh-CN'; // zh-TW is in the set and matched above
  if (base === 'nb' || base === 'nn') return 'no';
  if (SITE_LOCALES.has(base)) return base;
  return 'en';
}

/**
 * A localized onboarding page: `welcome` and `changelog`, the two the worker
 * opens. Nothing else on the site is localized, so `path` is one of those two;
 * link `EXTENSION_PAGE_URL` for the product's page.
 */
export function siteUrl(path: string, lang: string): string {
  return `https://dotmd.tools/${siteLocale(lang)}/html-to-md/${path}`;
}
