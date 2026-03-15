import { describe, test, expect } from 'bun:test';
import { isRestrictedUrl } from '../restricted';

describe('isRestrictedUrl', () => {
  test('chrome:// is restricted', () => {
    expect(isRestrictedUrl('chrome://settings')).toBe(true);
    expect(isRestrictedUrl('chrome://newtab')).toBe(true);
  });

  test('chrome-extension:// is restricted', () => {
    expect(isRestrictedUrl('chrome-extension://abcdef123456/popup.html')).toBe(true);
  });

  test('file:// is restricted', () => {
    expect(isRestrictedUrl('file:///Users/foo/bar.html')).toBe(true);
    expect(isRestrictedUrl('file://localhost/index.html')).toBe(true);
  });

  test('about: is restricted', () => {
    expect(isRestrictedUrl('about:blank')).toBe(true);
    expect(isRestrictedUrl('about:newtab')).toBe(true);
  });

  test('data: is restricted', () => {
    expect(isRestrictedUrl('data:text/html,<h1>Hello</h1>')).toBe(true);
  });

  test('https:// is not restricted', () => {
    expect(isRestrictedUrl('https://example.com')).toBe(false);
    expect(isRestrictedUrl('https://github.com/user/repo')).toBe(false);
    expect(isRestrictedUrl('https://stackoverflow.com/questions/123')).toBe(false);
  });

  test('http:// is not restricted', () => {
    expect(isRestrictedUrl('http://localhost:3000')).toBe(false);
    expect(isRestrictedUrl('http://example.com')).toBe(false);
  });
});
