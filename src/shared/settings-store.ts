export interface Settings {
  autoMetadata: boolean;
  defaultViewMode: 'preview' | 'source';
  highlighterColor: string;
  showBubble: boolean;
  uiLanguage: string;
}

const DEFAULTS: Settings = {
  autoMetadata: true,
  defaultViewMode: 'preview',
  highlighterColor: '#2563eb',
  showBubble: true,
  uiLanguage: 'auto',
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}
