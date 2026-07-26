export interface Settings {
  autoMetadata: boolean;
  defaultViewMode: 'preview' | 'source';
  highlighterColor: string;
  showBubble: boolean;
  /**
   * Emit an HTML table for structures GFM cannot express — merged cells, a nested
   * table, preformatted text in a cell — instead of flattening them into the pipe
   * form. Off by default: an HTML table keeps the structure exactly, but Markdown
   * is not parsed inside an HTML block, so every cell stops being Markdown, and
   * renderers that strip HTML show nothing at all.
   */
  htmlTables: boolean;
  uiLanguage: string;
}

const DEFAULTS: Settings = {
  autoMetadata: true,
  defaultViewMode: 'preview',
  highlighterColor: '#0066cc',
  showBubble: true,
  htmlTables: false,
  uiLanguage: 'en',
};

export async function getSettings(): Promise<Settings> {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}
