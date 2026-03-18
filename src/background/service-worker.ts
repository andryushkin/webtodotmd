import { ensureInstallId } from '../shared/identity';
import { ensureContentScript } from '../shared/inject';

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
    title: 'add to .md',
    contexts: ['selection'],
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallId();
  createContextMenu();
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
