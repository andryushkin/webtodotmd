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

async function init() {
  const s = await getSettings();
  await initI18n(s.uiLanguage);
  document.title = t('settingsTitle');
  applyI18n();
  load();
}

init();
