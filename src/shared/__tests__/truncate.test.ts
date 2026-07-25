import { describe, expect, test } from 'bun:test';
import { truncateGraphemes } from '../truncate';

describe('truncateGraphemes', () => {
  test('leaves text that fits alone', () => {
    expect(truncateGraphemes('short', 80)).toBe('short');
    expect(truncateGraphemes('exact', 5)).toBe('exact');
  });

  test('never leaves a lone surrogate', () => {
    // The emoji straddles the budget: slice(0, 80) would keep its high
    // surrogate and encodeURIComponent() would then throw URIError.
    const title = 'a'.repeat(79) + '😀';
    const cut = truncateGraphemes(title, 80);
    expect(cut).toBe('a'.repeat(79));
    expect(() => encodeURIComponent(cut)).not.toThrow();
  });

  test('keeps an emoji that fits whole', () => {
    expect(truncateGraphemes('a'.repeat(78) + '😀', 80)).toBe('a'.repeat(78) + '😀');
  });

  test('does not split a ZWJ sequence', () => {
    const family = '👨‍👩‍👧'; // 8 code units, one grapheme cluster
    expect(truncateGraphemes('ab' + family, 6)).toBe('ab');
    expect(truncateGraphemes('ab' + family, 10)).toBe('ab' + family);
  });

  test('does not split a combining mark from its base', () => {
    const e = 'é'; // e + combining acute
    expect(truncateGraphemes('abc' + e, 4)).toBe('abc');
  });

  test('a budget smaller than the first cluster yields an empty string', () => {
    expect(truncateGraphemes('😀😀', 1)).toBe('');
  });
});
