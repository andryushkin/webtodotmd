import { ensureInstallId } from '../shared/identity';

// Primary: auto-open side panel when action icon is clicked (Chrome 116+)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Fallback: explicitly open panel on click (also works if setPanelBehavior is unavailable)
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallId();
});

export {};
