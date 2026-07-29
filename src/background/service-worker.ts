import { ensureInstallId } from '../shared/identity';
import { ensureContentScript } from '../shared/inject';
import { t, initI18n } from '../shared/i18n';
import { trackEvent } from '../shared/telemetry';
import { siteUrl } from '../shared/site-links';

// Set to true for releases where changelog page should open on update
const SHOW_CHANGELOG_ON_UPDATE = true;

function openPage(path: string): void {
  // The locale mapping is shared with the options page's link to the same site;
  // see `site-links.ts` for why it is not spelled twice.
  chrome.tabs.create({ url: siteUrl(path, chrome.i18n.getUILanguage()) });
}

/**
 * The page Chrome opens in a new tab when the extension is removed.
 *
 * It has to be registered *before* the removal, which is why it is set on every
 * worker start rather than only on install, and re-set when the reader changes
 * the interface language: the URL carries a locale, and by the time it opens
 * there is no extension left to ask. Language chosen in settings wins over the
 * browser's, being the more specific answer; `auto` means there was no choice.
 */
async function syncUninstallUrl(): Promise<void> {
  if (!chrome.runtime.setUninstallURL) return;
  const { settings } = await chrome.storage.local.get('settings');
  const chosen = settings?.uiLanguage;
  const lang = !chosen || chosen === 'auto' ? chrome.i18n.getUILanguage() : chosen;
  await chrome.runtime.setUninstallURL(siteUrl('uninstall', lang));
}

syncUninstallUrl().catch(console.error);

// Explicitly disable Chrome's built-in toggle so onClicked fires on every click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
  }
  // Signal sidepanel to auto-capture after opening
  chrome.storage.session.set({ captureSignal: Date.now() }).catch(console.error);
});

const CONTENT_I18N_KEYS = ['bubbleText', 'toastNoSelection', 'toastCopied', 'toastCouldNotCopy'];

async function writeContentTranslations() {
  const result: Record<string, string> = {};
  for (const key of CONTENT_I18N_KEYS) result[key] = t(key);
  await chrome.storage.local.set({ contentI18n: result });
}

async function createContextMenu() {
  const { settings } = await chrome.storage.local.get('settings');
  await initI18n(settings?.uiLanguage ?? 'en');
  await writeContentTranslations();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'capture-and-copy',
    title: t('contextMenuTitle') || 'add to .md',
    contexts: ['selection'],
  });
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    const newLang = changes.settings.newValue?.uiLanguage ?? 'en';
    const oldLang = changes.settings.oldValue?.uiLanguage ?? 'en';
    if (newLang !== oldLang) {
      await initI18n(newLang);
      await writeContentTranslations();
      await syncUninstallUrl();
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: 'capture-and-copy',
          title: t('contextMenuTitle') || 'add to .md',
          contexts: ['selection'],
        });
      });
    }
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInstallId();
  createContextMenu();
  await syncUninstallUrl();

  if (details.reason === 'install') {
    trackEvent('install');
    openPage('welcome');
  } else if (details.reason === 'update' && SHOW_CHANGELOG_ON_UPDATE) {
    openPage('changelog');
  }

  // Re-inject fresh content scripts to replace orphaned ones after update
  if (details.reason === 'update' || details.reason === 'install') {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content-script.js'],
        }).catch(() => {}); // restricted pages (chrome://, file://, etc.) — ignore
      }
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-and-copy' && tab?.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
    chrome.storage.session.set({ captureSignal: Date.now() }).catch(console.error);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-and-copy') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) captureAndCopy(tab.id);
    });
  }
  if (command === 'capture-and-append') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id || !tab.windowId) return;
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
      chrome.storage.session.set({ captureSignal: Date.now() }).catch(console.error);
    });
  }
});

async function captureAndCopy(tabId: number) {
  const ok = await ensureContentScript(tabId);
  if (!ok) return;
  chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_AND_COPY' });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'OPEN_AND_CAPTURE' && sender.tab?.id) {
    const tabId = sender.tab.id;
    // sidePanel.open() requires a user gesture context;
    // from onMessage it may throw synchronously — catch both cases.
    try {
      chrome.sidePanel.open({ tabId }).catch(console.error);
    } catch {
      // No user gesture context — panel will capture on next open via captureSignal
    }
    chrome.storage.session.set({ captureSignal: Date.now() }).catch(console.error);
  }
});

export {};
