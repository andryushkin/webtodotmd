import { describe, test, expect } from 'bun:test';
import { requestAction } from '../gate';

describe('requestAction (stub)', () => {
  test('returns true for copy', async () => {
    expect(await requestAction('copy')).toBe(true);
  });

  test('returns true for download', async () => {
    expect(await requestAction('download')).toBe(true);
  });
});
