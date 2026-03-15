import { describe, test, expect, beforeEach } from 'bun:test';
import { ensureInstallId } from '../identity';

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};

(globalThis as Record<string, unknown>).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: mockStorage[key] }),
      set: async (data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
      },
    },
  },
};

describe('ensureInstallId', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  test('creates a UUID on first call', async () => {
    const id = await ensureInstallId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('returns same UUID on subsequent calls (no duplication)', async () => {
    const id1 = await ensureInstallId();
    const id2 = await ensureInstallId();
    expect(id1).toBe(id2);
  });

  test('does not overwrite existing UUID', async () => {
    const id1 = await ensureInstallId();
    // Simulate second call (storage already has the id)
    const id2 = await ensureInstallId();
    expect(id1).toBe(id2);
  });
});
