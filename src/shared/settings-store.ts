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
  /**
   * Add a toolbar button that copies the markup the conversion was given.
   *
   * Off by default, and the capture does not even build that markup while it is:
   * the fragment carries a computed style on every element that needed one,
   * which on a long article outweighs the Markdown itself. What it is for is
   * reporting — a defect in the file is reproducible from this text alone,
   * without anyone having to fetch the page and guess which part of it was
   * selected. It was a third view in the panel until 1.4.9; a debugging aid does
   * not earn a tab beside the preview and the source.
   */
  copyHtmlButton: boolean;
  uiLanguage: string;
}

const DEFAULTS: Settings = {
  autoMetadata: true,
  defaultViewMode: 'preview',
  highlighterColor: '#0066cc',
  showBubble: true,
  htmlTables: false,
  copyHtmlButton: false,
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
