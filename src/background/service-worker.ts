import { ensureInstallId } from '../shared/identity';
import { ensureContentScript } from '../shared/inject';

// Set to true for releases where changelog page should open on update
const SHOW_CHANGELOG_ON_UPDATE = false;

const SUPPORTED_LOCALES = new Set([
  'en','de','fr','es','it','nl','sv','da','no','fi',
  'ar','id','ru','pt-PT','ja','fil','vi','tr','th','ko',
]);

function getUrlLocale(): string {
  const lang = chrome.i18n.getUILanguage();
  const normalized = lang.replace('_', '-');
  if (SUPPORTED_LOCALES.has(normalized)) return normalized;
  const base = normalized.split('-')[0];
  if (base === 'pt') return 'pt-PT';
  if (base === 'nb' || base === 'nn') return 'no';
  if (SUPPORTED_LOCALES.has(base)) return base;
  return 'en';
}

function openPage(path: string): void {
  const locale = getUrlLocale();
  chrome.tabs.create({ url: `https://2md.site/${locale}/${path}` });
}

// Explicitly disable Chrome's built-in toggle so onClicked fires on every click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
  }
  // Signal sidepanel to auto-capture after opening
  chrome.storage.session.set({ captureSignal: Date.now() }).catch(console.error);
});

function createContextMenu() {
  chrome.contextMenus.create({
    id: 'capture-and-copy',
    title: chrome.i18n.getMessage('contextMenuTitle') || 'add to .md',
    contexts: ['selection'],
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInstallId();
  createContextMenu();

  if (details.reason === 'install') {
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
