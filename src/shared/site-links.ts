/**
 * Where the extension points outside itself.
 *
 * Two domains, on purpose and for now. The product's page lives on the new site,
 * `dotmd.tools`, which is one language and has no locale prefixes: measured
 * 2026-07-29, `/html-to-md` answers 200 and `/html-to-md/<locale>` answers 404 for
 * all 52. The install and update pages still live on `2md.site`, where all 52
 * locales of `/welcome` and `/changelog` answer 200 — moving them before the new
 * site has those pages would greet every install with a 404.
 *
 * The locale mapping is one module because two callers need it — the worker opens
 * those pages, and anything else linking the localized site would otherwise hold
 * a second copy that drifts, the only symptom being a reader sent to the wrong
 * language. The spelling is the site's, with hyphens, not the extension's
 * `_locales` directory names.
 */

export const REPO_URL = 'https://github.com/andryushkin/webtodotmd';

/**
 * The extension's own page. Not locale-prefixed: the new site is English-only,
 * and `/html-to-md/<locale>` is a 404 in every one of the 52 — which is what the
 * options page linked at `2md.site/<locale>/` was, in every language, for the one
 * commit that shipped it.
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
 * A localized page on the old site: `welcome` and `changelog`, the two the worker
 * opens. There is no localized home page — `2md.site/<locale>/` is a 404 — so
 * `path` is never empty; link `EXTENSION_PAGE_URL` instead.
 */
export function siteUrl(path: string, lang: string): string {
  return `https://2md.site/${siteLocale(lang)}/${path}`;
}
