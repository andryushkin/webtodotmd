type MessageEntry = { message: string };
type Messages = Record<string, MessageEntry>;

const cache = new Map<string, Messages>();
let currentLocale = 'en';

const SUPPORTED_LOCALES = [
  'en', 'de', 'fr', 'es', 'it', 'nl', 'sv', 'da', 'no', 'fi',
  'ar', 'id', 'ru', 'pt_PT', 'ja', 'fil', 'vi', 'tr', 'th', 'ko',
];

function normalizeLocale(lang: string): string {
  if (SUPPORTED_LOCALES.includes(lang)) return lang;
  const lower = lang.toLowerCase();
  if (SUPPORTED_LOCALES.includes(lower)) return lower;
  const underscored = lang.replace('-', '_');
  if (SUPPORTED_LOCALES.includes(underscored)) return underscored;
  const base = lang.split(/[-_]/)[0].toLowerCase();
  // Norwegian: nb/nn → no
  if (base === 'nb' || base === 'nn') return 'no';
  // Portuguese: pt-PT or pt-BR falls back to pt_PT (only pt_PT supported)
  if (base === 'pt') return 'pt_PT';
  if (SUPPORTED_LOCALES.includes(base)) return base;
  return 'en';
}

async function loadLocale(locale: string): Promise<Messages> {
  if (cache.has(locale)) return cache.get(locale)!;
  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const resp = await fetch(url);
    if (resp.ok) {
      const msgs: Messages = await resp.json();
      cache.set(locale, msgs);
      return msgs;
    }
  } catch {
    // ignore
  }
  cache.set(locale, {});
  return {};
}

export async function initI18n(uiLanguage: string): Promise<void> {
  const locale = uiLanguage === 'auto'
    ? normalizeLocale(chrome.i18n.getUILanguage())
    : uiLanguage;
  currentLocale = locale;
  await loadLocale(locale);
  if (locale !== 'en') await loadLocale('en');
}

export function t(key: string, ...args: (string | number)[]): string {
  const msgs = cache.get(currentLocale) ?? {};
  const fallback = cache.get('en') ?? {};
  let msg = (msgs[key] as MessageEntry | undefined)?.message
    ?? (fallback[key] as MessageEntry | undefined)?.message
    ?? key;
  args.forEach((arg, i) => {
    msg = msg.replace(`{${i + 1}}`, String(arg));
  });
  return msg;
}

export function applyI18n(): void {
  if (currentLocale === 'ar') {
    document.documentElement.setAttribute('dir', 'rtl');
  } else {
    document.documentElement.removeAttribute('dir');
  }
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')!;
    const attr = el.getAttribute('data-i18n-attr');
    const text = t(key);
    if (attr) el.setAttribute(attr, text);
    else el.textContent = text;
  });
}

export function getLocale(): string {
  return currentLocale;
}
