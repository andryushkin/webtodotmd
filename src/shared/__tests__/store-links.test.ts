import { describe, test, expect } from 'bun:test';
import { CWS_REVIEWS_URL } from '../store-links';

describe('CWS_REVIEWS_URL', () => {
  test('points at the store review form for this item', () => {
    expect(CWS_REVIEWS_URL).toBe(
      'https://chromewebstore.google.com/detail/gkplehkbkofmdjhafgbclcmfcficoego/reviews',
    );
  });

  // Rating stars must never route anywhere but the store: a private form for
  // low scores held zero entries while suppressing the public rating volume the
  // store's ranking heuristic reads.
  test('is not the developer site', () => {
    expect(CWS_REVIEWS_URL).not.toContain('2md.site');
  });
});
