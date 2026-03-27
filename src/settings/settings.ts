import { getSettings, saveSettings } from '../shared/settings-store';
import { initI18n, applyI18n, t } from '../shared/i18n';

const autoMetadata = document.getElementById('auto-metadata') as HTMLInputElement;
const showBubble = document.getElementById('show-bubble') as HTMLInputElement;
const defaultView = document.getElementById('default-view') as HTMLSelectElement;
const highlighterColor = document.getElementById('highlighter-color') as HTMLInputElement;
const uiLanguage = document.getElementById('ui-language') as HTMLSelectElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

let saveTimer: ReturnType<typeof setTimeout>;

function flashStatus(msg: string) {
  statusEl.textContent = msg;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { statusEl.textContent = ''; }, 1500);
}

async function load() {
  const s = await getSettings();
  autoMetadata.checked = s.autoMetadata;
  showBubble.checked = s.showBubble;
  defaultView.value = s.defaultViewMode;
  highlighterColor.value = s.highlighterColor;
  uiLanguage.value = s.uiLanguage;
}

function onChange() {
  saveSettings({
    autoMetadata: autoMetadata.checked,
    showBubble: showBubble.checked,
    defaultViewMode: defaultView.value as 'preview' | 'source',
    highlighterColor: highlighterColor.value,
  });
  flashStatus(t('savedSettings'));
}

uiLanguage.addEventListener('change', async () => {
  await saveSettings({ uiLanguage: uiLanguage.value });
  location.reload();
});

autoMetadata.addEventListener('change', onChange);
showBubble.addEventListener('change', onChange);
defaultView.addEventListener('change', onChange);
highlighterColor.addEventListener('input', onChange);

// ---- Rating ----

const CWS_REVIEWS_URL = 'https://chromewebstore.google.com/detail/text-to-md-html-to-markdo/gkplehkbkofmdjhafgbclcmfcficoego/reviews';
const RATING_LOCALES = new Set(['en','de','fr','es','it','nl','sv','da','no','fi','ar','id','ru','pt-PT','ja','fil','vi','tr','th','ko']);

function getRatingUrl(stars: number): string {
  if (stars >= 4) return CWS_REVIEWS_URL;
  const lang = chrome.i18n.getUILanguage().replace('_', '-');
  let locale = RATING_LOCALES.has(lang) ? lang : (() => {
    const base = lang.split('-')[0];
    if (base === 'pt') return 'pt-PT';
    if (base === 'nb' || base === 'nn') return 'no';
    return RATING_LOCALES.has(base) ? base : 'en';
  })();
  return `https://2md.site/${locale}/feedback`;
}

function initRatingStars() {
  const ratingRow = document.querySelector('.rating-row') as HTMLDivElement;
  const stars = ratingRow.querySelectorAll('.star') as NodeListOf<HTMLButtonElement>;

  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.dataset.value!);
      stars.forEach(s => s.classList.toggle('highlighted', parseInt(s.dataset.value!) <= val));
    });
    star.addEventListener('click', () => {
      chrome.tabs.create({ url: getRatingUrl(parseInt(star.dataset.value!)) });
    });
  });

  ratingRow.addEventListener('mouseleave', () => {
    stars.forEach(s => s.classList.remove('highlighted'));
  });
}

async function init() {
  const s = await getSettings();
  await initI18n(s.uiLanguage);
  document.title = t('settingsTitle');
  applyI18n();
  load();
  initRatingStars();
}

init();
