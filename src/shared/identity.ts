const INSTALL_ID_KEY = 'installId';

export async function ensureInstallId(): Promise<string> {
  const result = await chrome.storage.local.get(INSTALL_ID_KEY);
  if (result[INSTALL_ID_KEY]) {
    return result[INSTALL_ID_KEY] as string;
  }
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: id });
  return id;
}
