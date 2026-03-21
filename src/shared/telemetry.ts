import { ensureInstallId } from './identity';

const STATS_ENDPOINT = 'https://2md.site/api/event';

export function trackEvent(event: string): void {
  ensureInstallId().then((clientId) => {
    const locale = chrome.i18n.getUILanguage();
    const version = chrome.runtime.getManifest().version;
    fetch(STATS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, event, locale, version }),
    }).catch(() => {});
  }).catch(() => {});
}
