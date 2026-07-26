import type { DOMAdapterFn } from '../types.js';

let globalAdapter: DOMAdapterFn | null = null;

export function setDOMAdapter(adapter: DOMAdapterFn): void {
  globalAdapter = adapter;
}

export function getAdapter(): DOMAdapterFn {
  if (globalAdapter) return globalAdapter;

  // Браузер — нативный DOMParser
  if (typeof globalThis.DOMParser !== 'undefined') {
    return (html) => new DOMParser().parseFromString(html, 'text/html');
  }

  throw new Error(
    '@markitdown/core: No DOM adapter found. ' +
      'Install linkedom or happy-dom and call setDOMAdapter().',
  );
}
