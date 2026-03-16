import { ensureInstallId } from '../shared/identity';

// Primary: auto-open side panel when action icon is clicked (Chrome 116+)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Fallback: explicitly open panel on click (also works if setPanelBehavior is unavailable)
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
    title: 'Copy as Markdown',
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
    captureAndCopy(tab.id);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-and-copy') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) captureAndCopy(tab.id);
    });
  }
});

function captureAndCopy(tabId: number) {
  chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_AND_COPY' });
}

export {};
