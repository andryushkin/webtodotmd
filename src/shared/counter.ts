const COUNTER_KEY_PREFIX = 'counter_';

function getTodayKey(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${COUNTER_KEY_PREFIX}${today}`;
}

export async function incrementCounter(): Promise<number> {
  const key = getTodayKey();
  const result = await chrome.storage.local.get(key);
  const current = (result[key] as number | undefined) ?? 0;
  const next = current + 1;
  await chrome.storage.local.set({ [key]: next });
  return next;
}

export async function getCounterToday(): Promise<number> {
  const key = getTodayKey();
  const result = await chrome.storage.local.get(key);
  return (result[key] as number | undefined) ?? 0;
}
