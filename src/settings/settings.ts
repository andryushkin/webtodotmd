import { getSettings, saveSettings } from '../shared/settings-store';
import { initI18n, applyI18n, t } from '../shared/i18n';
import { getRatingUrl } from '../shared/store-links';

const autoMetadata = document.getElementById('auto-metadata') as HTMLInputElement;
const showBubble = document.getElementById('show-bubble') as HTMLInputElement;
const htmlTables = document.getElementById('html-tables') as HTMLInputElement;
const copyHtml = document.getElementById('copy-html') as HTMLInputElement;
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
  htmlTables.checked = s.htmlTables;
  copyHtml.checked = s.copyHtmlButton;
  defaultView.value = s.defaultViewMode;
  highlighterColor.value = s.highlighterColor;
  uiLanguage.value = s.uiLanguage;
}

function onChange() {
  saveSettings({
    autoMetadata: autoMetadata.checked,
    showBubble: showBubble.checked,
    htmlTables: htmlTables.checked,
    copyHtmlButton: copyHtml.checked,
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
htmlTables.addEventListener('change', onChange);
copyHtml.addEventListener('change', onChange);
defaultView.addEventListener('change', onChange);
highlighterColor.addEventListener('input', onChange);

// ---- Rating ----

function initRatingStars() {
  const ratingRow = document.querySelector('.rating-row') as HTMLDivElement;
  const stars = ratingRow.querySelectorAll('.star') as NodeListOf<HTMLButtonElement>;

  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.dataset.value!);
      stars.forEach(s => s.classList.toggle('highlighted', parseInt(s.dataset.value!) <= val));
    });
    star.addEventListener('click', () => {
      // Through getRatingUrl, not the constant: it is the one place a test can
      // catch score-based routing coming back, and both surfaces must use it.
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
