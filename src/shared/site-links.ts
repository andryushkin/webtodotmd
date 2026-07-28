/**
 * Where the extension points outside itself: the site and the repository.
 *
 * The site is localized per `docs/website-welcome-changelog.md` — the URL locale
 * is part of a contract with it, and every locale in the set below must answer
 * with a page rather than a 404. The spelling is the site's, with hyphens, not
 * the extension's `_locales` directory names.
 *
 * One module because there were two callers about to hold two copies: the worker
 * opens the welcome and changelog pages, the options page links the home page,
 * and a second spelling of this mapping would drift silently — the only symptom
 * being a reader sent to a page in the wrong language.
 */

export const REPO_URL = 'https://github.com/andryushkin/webtodotmd';

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

/** A page on the site, in the reader's language. `path` may be empty for home. */
export function siteUrl(path: string, lang: string): string {
  return `https://2md.site/${siteLocale(lang)}/${path}`;
}
