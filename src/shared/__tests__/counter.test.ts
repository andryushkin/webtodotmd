import { describe, test, expect, beforeEach } from 'bun:test';
import { incrementCounter, getCounterToday } from '../counter';

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

describe('counter', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  test('getCounterToday returns 0 initially', async () => {
    expect(await getCounterToday()).toBe(0);
  });

  test('incrementCounter returns 1 on first call', async () => {
    expect(await incrementCounter()).toBe(1);
  });

  test('incrementCounter increments on each call', async () => {
    await incrementCounter();
    await incrementCounter();
    expect(await incrementCounter()).toBe(3);
  });

  test('getCounterToday reflects increments', async () => {
    await incrementCounter();
    await incrementCounter();
    expect(await getCounterToday()).toBe(2);
  });
});
